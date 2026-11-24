import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Matrix4,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SkinnedMesh,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export type Side = 'left' | 'right'
/** [親指, 人差し指, 中指, 薬指, 小指] を伸ばすかどうか */
export type FingerFlags = [boolean, boolean, boolean, boolean, boolean]

/** 左手の度数(1〜7)ごとのお手本の形 */
export const DEGREE_FINGERS: FingerFlags[] = [
  [false, true, false, false, false],
  [false, true, true, false, false],
  [false, true, true, true, false],
  [false, true, true, true, true],
  [true, true, true, true, true],
  [false, true, false, false, true],
  [true, true, false, false, true],
]

const FINGER_NAMES = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger']
const rad = (d: number) => (d * Math.PI) / 180
// 握ったときの各関節の曲げ角。指は 付け根 → 第2関節 → 第1関節 の順
const FINGER_BEND = [rad(82), rad(100), rad(62)]
const THUMB_BEND = [rad(24), rad(34), rad(58)]

interface Joint {
  bone: Object3D
  p: Vector3
  q: Quaternion
}

interface Finger {
  joints: Joint[]
  /** 曲げる関節のインデックスと回転軸 */
  flex: { index: number; axis: Vector3; max: number }[]
  curl: number
  target: number
}

interface Hand {
  pivot: Group
  material: MeshStandardMaterial
  fingers: Finger[]
  tilt: number
  tiltTarget: number
  color: Color
}

/**
 * お手本の手(GLBのリグ)を描く。
 * このリグは関節がすべて同じ階層に並んでいるので、指を曲げるときは
 * 付け根から順に回転を積み上げて、各関節の位置と向きを自分で計算する。
 */
export class DemoHands {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(26, 2, 0.01, 10)
  private hands: Partial<Record<Side, Hand>> = {}
  private disposed = false
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true })
    this.renderer.setClearColor(0x000000, 0)
    this.camera.position.set(0, 0, 0.64)
    this.scene.add(new HemisphereLight(0xffffff, 0x30364a, 1.6))
    const key = new DirectionalLight(0xffffff, 2.2)
    key.position.set(0.3, 0.6, 1)
    this.scene.add(key)
  }

  async load() {
    const loader = new GLTFLoader()
    const [left, right] = await Promise.all([loader.loadAsync('/models/hand-left.glb'), loader.loadAsync('/models/hand-right.glb')])
    if (this.disposed) return
    this.hands.left = this.setup(left.scene, 'left')
    this.hands.right = this.setup(right.scene, 'right')
  }

  private setup(root: Object3D, side: Side): Hand {
    const material = new MeshStandardMaterial({ color: 0xe8ecff, roughness: 0.55, metalness: 0.05 })
    root.traverse((o) => {
      if (o instanceof SkinnedMesh) {
        o.material = material
        o.frustumCulled = false
      }
    })

    // モデルは指先が -Y、手のひらが ±X を向いている。指先を上、手のひらをカメラ側に向け直す。
    // シーンは「カメラに向かって立つ人」の向きで組み、canvasをCSSで左右反転して鏡写しにする。
    const palm = new Vector3(side === 'left' ? 1 : -1, 0, 0)
    const orient = new Group()
    orient.quaternion.setFromRotationMatrix(
      side === 'left'
        ? new Matrix4().makeBasis(new Vector3(0, 0, 1), new Vector3(0, -1, 0), new Vector3(1, 0, 0))
        : new Matrix4().makeBasis(new Vector3(0, 0, -1), new Vector3(0, -1, 0), new Vector3(-1, 0, 0)),
    )
    root.position.set(side === 'left' ? 0.037 : -0.039, -0.056, -0.008) // 手首を回転の中心にする
    orient.add(root)
    const pivot = new Group()
    pivot.position.set(side === 'left' ? 0.1 : -0.1, -0.09, 0)
    pivot.add(orient)
    this.scene.add(pivot)

    const fingers = FINGER_NAMES.map((name, f): Finger => {
      const parts = f === 0 ? ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'] : ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip']
      const joints = parts.map((part): Joint => {
        const bone = root.getObjectByName(`${name}-${part}`)
        if (!bone) throw new Error(`手のモデルに関節がありません: ${name}-${part}`)
        return { bone, p: bone.position.clone(), q: bone.quaternion.clone() }
      })
      // 曲げる向き: 4本の指は手のひら側へ、親指は手のひらを横切る向きへ
      const toward = f === 0 ? palm.clone().multiplyScalar(0.5).add(new Vector3(0, 0, 1)).normalize() : palm
      const first = f === 0 ? 0 : 1
      const bend = f === 0 ? THUMB_BEND : FINGER_BEND
      const flex = bend.map((max, i) => {
        const index = first + i
        const dir = joints[index + 1].p.clone().sub(joints[index].p).normalize()
        return { index, axis: dir.cross(toward).normalize(), max }
      })
      return { joints, flex, curl: 0, target: 0 }
    })
    return { pivot, material, fingers, tilt: 0, tiltTarget: 0, color: new Color(0xe8ecff) }
  }

  /** お手本の形を指定する。tiltDeg は鏡写しの画面で右に傾く角度 */
  setPose(side: Side, flags: FingerFlags, tiltDeg: number, color: string) {
    const hand = this.hands[side]
    if (!hand) return
    hand.fingers.forEach((f, i) => (f.target = flags[i] ? 0 : 1))
    hand.tiltTarget = rad(tiltDeg)
    hand.color.set(color)
  }

  render(dt: number) {
    if (this.disposed) return
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (!w || !h) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.renderer.setPixelRatio(dpr)
      this.renderer.setSize(w, h, false)
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    }
    const k = 1 - Math.exp(-dt * 11)
    for (const hand of Object.values(this.hands)) {
      hand.tilt += (hand.tiltTarget - hand.tilt) * k
      hand.pivot.rotation.z = hand.tilt
      hand.material.color.lerp(hand.color, k)
      for (const f of hand.fingers) {
        f.curl += (f.target - f.curl) * k
        this.pose(f)
      }
    }
    this.renderer.render(this.scene, this.camera)
  }

  private pose(f: Finger) {
    const m = new Matrix4()
    const rot = new Quaternion()
    const step = new Matrix4()
    const stepRot = new Quaternion()
    f.joints.forEach((j, i) => {
      const flex = f.flex.find((x) => x.index === i)
      if (flex) {
        stepRot.setFromAxisAngle(flex.axis, flex.max * f.curl)
        // 関節 j.p を中心にした回転を、それまでの変換の内側に掛ける
        step
          .makeTranslation(j.p.x, j.p.y, j.p.z)
          .multiply(new Matrix4().makeRotationFromQuaternion(stepRot))
          .multiply(new Matrix4().makeTranslation(-j.p.x, -j.p.y, -j.p.z))
        m.multiply(step)
        rot.multiply(stepRot)
      }
      j.bone.position.copy(j.p).applyMatrix4(m)
      j.bone.quaternion.copy(rot).multiply(j.q)
    })
  }

  dispose() {
    this.disposed = true
    for (const hand of Object.values(this.hands)) hand.material.dispose()
    this.renderer.dispose()
  }
}
