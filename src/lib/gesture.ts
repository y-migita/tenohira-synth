import type { Octave, Quality, Voicing } from './music'

export interface Point {
  x: number
  y: number
}

export interface HandPose {
  /** [親指, 人差し指, 中指, 薬指, 小指] が伸びているか */
  fingers: [boolean, boolean, boolean, boolean, boolean]
  /** 画面上での手の傾き(度)。0 = 真上、プラス = 画面右へ傾く */
  tilt: number
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * MediaPipeの21点ランドマークから指の状態と傾きを求める。
 * flipX: 映像を左右反転して表示している場合は true(Webカメラ)。
 */
export function analyzeHand(lm: Point[], flipX: boolean): HandPose {
  const wrist = lm[0]
  const palm = dist(lm[5], lm[17]) || 1e-6
  const ext = (tip: number, pip: number, mcp: number) =>
    dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.12 && dist(lm[tip], lm[mcp]) > palm * 0.55
  const index = ext(8, 6, 5)
  const middle = ext(12, 10, 9)
  const ring = ext(16, 14, 13)
  const pinky = ext(20, 18, 17)
  // 親指: 先端が人差し指の付け根と手のひらから十分離れていれば伸びているとみなす
  const thumb = dist(lm[4], lm[5]) > palm * 0.8 && dist(lm[4], lm[9]) > palm * 0.95 && dist(lm[4], lm[17]) > dist(lm[2], lm[17]) * 1.05

  // 傾きは、伸びている指があればその指の向き、なければ手のひらの向きで測る
  const from = lm[0]
  const to = index ? lm[8] : lm[9]
  const dx = (to.x - from.x) * (flipX ? -1 : 1)
  const dy = to.y - from.y
  const tilt = (Math.atan2(dx, -dy) * 180) / Math.PI
  return { fingers: [thumb, index, middle, ring, pinky], tilt }
}

/** 左手の形 → 度数(1〜7)。握りこぶしなどは null */
export function leftDegree(p: HandPose): number | null {
  const [t, i, m, r, pk] = p.fingers
  const count = +i + +m + +r + +pk
  if (i && pk && !m && !r) return t ? 7 : 6
  if (count === 4) return t ? 5 : 4
  if (count === 3) return 3
  if (count === 2) return 2
  if (count === 1) return 1
  return null
}

/** 右手の伸ばした指の本数(親指以外) → コードの形 */
export function rightVoicing(p: HandPose): Voicing {
  const [, i, m, r, pk] = p.fingers
  const count = +i + +m + +r + +pk
  if (count >= 4) return 'sev2'
  if (count === 3) return 'sev1'
  if (count === 2) return 'inv1'
  return 'root'
}

/** 左手の傾き → メジャー/マイナー(ヒステリシス付き) */
export function tiltQuality(tilt: number, prev: Quality): Quality {
  if (tilt > 19) return 'maj'
  if (tilt < 13) return 'min'
  return prev
}

/** 右手の傾き → オクターブ。内側(画面の左)へ傾けると低く、外側へ傾けると高い */
export function tiltOctave(tilt: number, prev: Octave): Octave {
  if (tilt < -4) return 'low'
  if (tilt > 4) return 'high'
  return prev
}
