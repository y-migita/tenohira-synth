import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@ui-sdk/react/dialog'
import { useEffect, useMemo, useRef, useState } from 'react'
import canonText from './assets/canon.txt?raw'
import { DEGREE_ICON, Icon, QUALITY_TILT, type IconName } from './components/Icon'
import { Button, Picker, Range, Segmented, Toggle } from './components/ui'
import { INSTRUMENTS, Sampler, type InstrumentId } from './lib/audio'
import { analyzeHand, leftDegree, rightVoicing, tiltOctave, tiltQuality, type Point } from './lib/gesture'
import { DEGREE_COLOR, HIT_X, drawLane, type Judge, type RunEvent } from './lib/lane'
import {
  DIATONIC_QUALITY,
  KEYS,
  chordName,
  chordNotes,
  chordRoman,
  degreeRoot,
  noteName,
  sameChord,
  voicingLabel,
  type Chord,
  type Octave,
  type Quality,
  type Voicing,
} from './lib/music'
import { buildCanon } from './lib/tab'
import { DEGREE_FINGERS, DemoHands } from './lib/hands3d'
import { createTracker, type Tracker } from './lib/tracker'

type QualityMode = 'tilt' | 'auto'
type CameraState = 'starting' | 'on' | 'off'

interface Settings {
  key: number
  instrument: InstrumentId
  qualityMode: QualityMode
  guide: boolean
  melody: boolean
  bpm: number
}

interface Live {
  left: boolean
  right: boolean
  chord: Chord | null
  quality: Quality
  voicing: Voicing
  octave: Octave
}

interface Hud {
  playing: boolean
  countdown: number
  score: number
  combo: number
  maxCombo: number
  perfect: number
  ok: number
  miss: number
  last: { judge: Judge; n: number } | null
}

interface Run {
  start: number
  barDur: number
  events: RunEvent[]
  nextNote: number
  hud: Hud
}

const SONG_KEY = 2 // 曲はニ長調
const VOICINGS: Voicing[] = ['root', 'inv1', 'sev1', 'sev2']
const VOICING_ICON: IconName[] = ['tabler-hand-finger', 'tabler-hand-two-fingers', 'tabler-hand-three-fingers', 'tabler-hand-stop']
const JUDGE_LABEL: Record<Judge, string> = { pending: '', perfect: 'ぴったり!', ok: 'OK', miss: 'ミス' }
const EMPTY_HUD: Hud = { playing: false, countdown: 0, score: 0, combo: 0, maxCombo: 0, perfect: 0, ok: 0, miss: 0, last: null }
const params = new URLSearchParams(location.search)
const debugSrc = params.get('src')
/** 映像を左右反転して扱うか。Webカメラは反転、動画入力は ?mirror=1 のときだけ反転 */
const FLIP = !debugSrc || params.get('mirror') === '1'

function fitCanvas(c: HTMLCanvasElement): [CanvasRenderingContext2D, number, number] {
  const dpr = window.devicePixelRatio || 1
  const w = c.clientWidth
  const h = c.clientHeight
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
  }
  const ctx = c.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return [ctx, w, h]
}

export default function App() {
  const song = useMemo(() => buildCanon(canonText), [])
  const [started, setStarted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [camera, setCamera] = useState<CameraState>('starting')
  const [settings, setSettings] = useState<Settings>({
    key: SONG_KEY,
    instrument: 'lead_2_sawtooth',
    qualityMode: 'tilt',
    guide: true,
    melody: true,
    bpm: 52,
  })
  const [live, setLive] = useState<Live>({ left: false, right: false, chord: null, quality: 'maj', voicing: 'root', octave: 'low' })
  const [hud, setHud] = useState<Hud>(EMPTY_HUD)
  const [help, setHelp] = useState(false)
  const [result, setResult] = useState<Hud | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const waveRef = useRef<HTMLCanvasElement>(null)
  const laneRef = useRef<HTMLCanvasElement>(null)
  const demoCanvasRef = useRef<HTMLCanvasElement>(null)
  const demoLabelRef = useRef<HTMLDivElement>(null)
  const demoRef = useRef<DemoHands | null>(null)
  const samplerRef = useRef<Sampler | null>(null)
  const settingsRef = useRef(settings)
  const runRef = useRef<Run | null>(null)
  const kbRef = useRef({ degrees: [] as number[], shift: false, voicing: 'root' as Voicing, octave: 'low' as Octave })
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }))

  async function begin() {
    setLoading(true)
    setError(null)
    try {
      const sampler = new Sampler()
      samplerRef.current = sampler
      await sampler.ctx.resume()
      await Promise.all([sampler.load(settings.instrument), sampler.load('acoustic_guitar_nylon')])
      setStarted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function changeInstrument(id: InstrumentId) {
    set('instrument', id)
    samplerRef.current?.load(id).catch((e) => setError(String(e)))
  }

  function startSong() {
    const sampler = samplerRef.current
    if (!sampler) return
    const barDur = (4 * 60) / settingsRef.current.bpm
    setSettings((s) => ({ ...s, key: SONG_KEY }))
    setResult(null)
    const hudNow: Hud = { ...EMPTY_HUD, playing: true, countdown: 3 }
    runRef.current = {
      start: sampler.ctx.currentTime + 3,
      barDur,
      events: song.chart.map((e) => ({ ...e, time: e.pos * barDur, dur: e.len * barDur, judge: 'pending', judgedAt: 0 })),
      nextNote: 0,
      hud: hudNow,
    }
    setHud(hudNow)
  }

  function stopSong() {
    runRef.current = null
    setHud((h) => ({ ...h, playing: false, countdown: 0 }))
  }

  // カメラ(または ?src= で渡した動画)を映像入力にする
  useEffect(() => {
    if (!started) return
    const video = videoRef.current!
    let stream: MediaStream | null = null
    let cancelled = false
    if (debugSrc) {
      video.src = debugSrc
      video.loop = true
      video.play().then(
        () => setCamera('on'),
        () => setCamera('off'),
      )
    } else {
      navigator.mediaDevices
        ?.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' }, audio: false })
        .then((s) => {
          if (cancelled) return s.getTracks().forEach((t) => t.stop())
          stream = s
          video.srcObject = s
          return video.play().then(() => setCamera('on'))
        })
        .catch(() => setCamera('off'))
      if (!navigator.mediaDevices) setCamera('off')
    }
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [started])

  // お手本モードのときだけ3Dの手を用意する
  useEffect(() => {
    if (!started || !settings.melody || !demoCanvasRef.current) return
    const demo = new DemoHands(demoCanvasRef.current)
    demoRef.current = demo
    demo.load().catch((e) => setError('手のモデルを読み込めません: ' + (e instanceof Error ? e.message : String(e))))
    return () => {
      demoRef.current = null
      demo.dispose()
    }
  }, [started, settings.melody])

  // キーボードでも演奏できるようにする
  useEffect(() => {
    if (!started) return
    const kb = kbRef.current
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target
      if (el instanceof Element && el.closest('input, textarea, [role="listbox"], [role="combobox"], [role="slider"]')) return
      const digit = /^Digit([1-7])$/.exec(e.code)
      if (digit) {
        const d = +digit[1]
        if (!kb.degrees.includes(d)) kb.degrees.push(d)
      } else if (e.key === 'Shift') kb.shift = true
      else if (e.code === 'KeyQ') kb.voicing = 'root'
      else if (e.code === 'KeyW') kb.voicing = 'inv1'
      else if (e.code === 'KeyE') kb.voicing = 'sev1'
      else if (e.code === 'KeyR') kb.voicing = 'sev2'
      else if (e.code === 'KeyZ' && !e.repeat) kb.octave = kb.octave === 'low' ? 'high' : 'low'
    }
    const up = (e: KeyboardEvent) => {
      const digit = /^Digit([1-7])$/.exec(e.code)
      if (digit) kb.degrees = kb.degrees.filter((d) => d !== +digit[1])
      else if (e.key === 'Shift') kb.shift = false
    }
    const blur = () => {
      kb.degrees = []
      kb.shift = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [started])

  // メインループ: 手の検出 → コード決定 → 発音 → 描画 → 判定
  useEffect(() => {
    if (!started) return
    const sampler = samplerRef.current!
    const video = videoRef.current!
    const flip = FLIP
    let tracker: Tracker | null = null
    let disposed = false
    createTracker().then(
      (t) => (disposed ? t.close() : (tracker = t)),
      (e) => setError('ハンドトラッキングを開始できません: ' + (e instanceof Error ? e.message : String(e))),
    )

    let hands: Point[][] = []
    let lastVideoTime = -1
    let quality: Quality = 'maj'
    let octave: Octave = 'low'
    let current: Chord | null = null
    let currentSince = 0
    let candidate = ''
    let candidateAt = 0
    let liveKey = ''
    const wave = new Float32Array(sampler.analyser.fftSize)
    let raf = 0
    let lastWall = performance.now()
    let demoName = ''

    const frame = () => {
      raf = requestAnimationFrame(frame)
      const s = settingsRef.current
      const kb = kbRef.current
      const wall = performance.now()
      const dt = Math.min(0.1, (wall - lastWall) / 1000)
      lastWall = wall

      if (tracker && video.readyState >= 2 && video.videoWidth > 0 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime
        try {
          hands = tracker.detect(video, wall)
        } catch {
          hands = []
        }
      }

      // 画面の左側にある手を左手、右側にある手を右手として扱う
      const sx = (h: Point[]) => (flip ? 1 - h[0].x : h[0].x)
      const sorted = [...hands].sort((a, b) => sx(a) - sx(b))
      let leftHand: Point[] | null = null
      let rightHand: Point[] | null = null
      if (sorted.length >= 2) {
        leftHand = sorted[0]
        rightHand = sorted[sorted.length - 1]
      } else if (sorted.length === 1) {
        if (sx(sorted[0]) < 0.5) leftHand = sorted[0]
        else rightHand = sorted[0]
      }

      let degree: number | null = null
      if (leftHand) {
        const pose = analyzeHand(leftHand, flip)
        degree = leftDegree(pose)
        quality = tiltQuality(pose.tilt, quality)
      }
      const kbDegree = kb.degrees.at(-1)
      if (kbDegree) {
        degree = kbDegree
        quality = kb.shift ? 'min' : 'maj'
      }
      const q: Quality = s.qualityMode === 'auto' && degree ? DIATONIC_QUALITY[degree - 1] : quality

      let voicing: Voicing = kb.voicing
      if (rightHand) {
        const pose = analyzeHand(rightHand, flip)
        voicing = rightVoicing(pose)
        octave = tiltOctave(pose.tilt, octave)
      } else {
        octave = kb.octave
      }

      const target: Chord | null = degree ? { degree, quality: q, voicing, octave } : null
      const targetKey = target ? `${target.degree}${target.quality}${target.voicing}${target.octave}` : ''
      if (targetKey !== candidate) {
        candidate = targetKey
        candidateAt = wall
      }
      // 形が少しの間安定してから切り替える(指を動かしている途中の誤判定を避ける)
      if (!sameChord(target, current) && wall - candidateAt >= (kbDegree ? 0 : 100)) {
        current = target
        currentSince = sampler.ctx.currentTime
        if (current) sampler.playChord(s.instrument, chordNotes(current, s.key))
        else sampler.releaseChord()
      }

      const nextLive = `${!!leftHand}${!!rightHand}${targetKey}|${current ? chordName(current, s.key) : ''}${q}${voicing}${octave}`
      if (nextLive !== liveKey) {
        liveKey = nextLive
        setLive({ left: !!leftHand, right: !!rightHand, chord: current, quality: q, voicing, octave })
      }

      // 曲の進行と判定
      const run = runRef.current
      let songNow = 0
      if (run) {
        songNow = sampler.ctx.currentTime - run.start
        let dirty = false
        const countdown = songNow < 0 ? Math.ceil(-songNow) : 0
        if (countdown !== run.hud.countdown) {
          run.hud = { ...run.hud, countdown }
          dirty = true
        }
        while (run.nextNote < song.notes.length && song.notes[run.nextNote].pos * run.barDur < songNow + 0.25) {
          const n = song.notes[run.nextNote++]
          if (s.melody) sampler.playNote('acoustic_guitar_nylon', n.midi, run.start + n.pos * run.barDur, n.string >= 4 ? 0.5 : 0.4)
        }
        const since = currentSince - run.start
        for (const e of run.events) {
          if (e.judge !== 'pending') continue
          if (e.time - 0.4 > songNow) break
          const match = current && current.degree === e.degree && current.quality === e.quality
          let judge: Judge | null = null
          if (match) judge = Math.abs(Math.max(since, e.time - 0.4) - e.time) <= 0.18 || since < e.time - 0.4 ? 'perfect' : 'ok'
          else if (songNow > e.time + 0.5) judge = 'miss'
          if (!judge) continue
          e.judge = judge
          e.judgedAt = songNow
          const h = run.hud
          const combo = judge === 'miss' ? 0 : h.combo + 1
          run.hud = {
            ...h,
            score: h.score + (judge === 'perfect' ? 100 : judge === 'ok' ? 50 : 0),
            combo,
            maxCombo: Math.max(h.maxCombo, combo),
            perfect: h.perfect + +(judge === 'perfect'),
            ok: h.ok + +(judge === 'ok'),
            miss: h.miss + +(judge === 'miss'),
            last: { judge, n: (h.last?.n ?? 0) + 1 },
          }
          dirty = true
        }
        if (songNow > song.bars * run.barDur + 1.5) {
          const final = { ...run.hud, playing: false }
          runRef.current = null
          setHud(final)
          setResult(final)
        } else if (dirty) setHud(run.hud)
      }

      // 手のランドマーク
      const overlay = overlayRef.current
      if (overlay) {
        const [ctx, w, h] = fitCanvas(overlay)
        ctx.clearRect(0, 0, w, h)
        const vw = video.videoWidth || 16
        const vh = video.videoHeight || 9
        const scale = Math.max(w / vw, h / vh)
        const ox = (w - vw * scale) / 2
        const oy = (h - vh * scale) / 2
        ctx.fillStyle = '#ffffff'
        ctx.shadowColor = current ? DEGREE_COLOR[current.degree - 1] : '#ffffff'
        ctx.shadowBlur = 10
        for (const hand of hands) {
          for (const p of hand) {
            ctx.beginPath()
            ctx.arc(ox + (flip ? 1 - p.x : p.x) * vw * scale, oy + p.y * vh * scale, 3.5, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        ctx.shadowBlur = 0
      }

      // 波形
      const wc = waveRef.current
      if (wc) {
        const [ctx, w, h] = fitCanvas(wc)
        ctx.clearRect(0, 0, w, h)
        sampler.analyser.getFloatTimeDomainData(wave)
        ctx.strokeStyle = current ? DEGREE_COLOR[current.degree - 1] : 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 2.5
        ctx.lineJoin = 'round'
        const gapHalf = 70
        for (const [x0, x1] of [
          [0, w / 2 - gapHalf],
          [w / 2 + gapHalf, w],
        ]) {
          ctx.beginPath()
          for (let x = x0; x <= x1; x += 3) {
            const i = Math.floor((x / w) * (wave.length - 1))
            const edge = Math.min(1, Math.abs(x - w / 2) / 220) * Math.min(1, x / 80, (w - x) / 80)
            const y = h / 2 + wave[i] * h * 1.4 * edge
            if (x === x0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
        }
      }

      // お手本の手: 次に作る形を、判定ラインに来る少し前から見せる
      const demo = demoRef.current
      if (demo) {
        let ev = song.chart[0]
        if (run) {
          for (const e of run.events) {
            if (e.time - 0.6 > songNow) break
            ev = e
          }
        }
        const tilt = s.qualityMode === 'tilt' ? (ev.quality === 'maj' ? 30 : -6) : 10
        demo.setPose('left', DEGREE_FINGERS[ev.degree - 1], tilt, DEGREE_COLOR[ev.degree - 1])
        demo.setPose('right', [false, true, false, false, false], -12, '#e8ecff')
        demo.render(dt)
        if (ev.name !== demoName && demoLabelRef.current) {
          demoName = ev.name
          demoLabelRef.current.textContent = ev.name
          demoLabelRef.current.style.color = DEGREE_COLOR[ev.degree - 1]
        }
      }

      const lane = laneRef.current
      if (lane) {
        const [ctx, w, h] = fitCanvas(lane)
        drawLane(ctx, w, h, {
          song,
          events: run?.events ?? null,
          now: run ? songNow : 0,
          barDur: run?.barDur ?? (4 * 60) / s.bpm,
          showTilt: s.qualityMode === 'tilt',
        })
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      tracker?.close()
      sampler.releaseChord()
    }
  }, [started, song])

  const chord = live.chord
  const color = chord ? DEGREE_COLOR[chord.degree - 1] : '#ffffff'
  const total = song.chart.length

  return (
    <div className="flex h-dvh flex-col bg-ink select-none">
      {/* 上のバー */}
      <header className="z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel px-4 py-2">
        <h1 className="mr-2 text-base font-bold tracking-wide">
          てのひら<span className="text-mint">シンセ</span>
        </h1>
        <div className="flex items-center gap-2 text-xs text-dim">
          キー
          <div className="w-20">
            <Picker
              label="キー"
              value={String(settings.key)}
              disabled={hud.playing}
              onChange={(v) => set('key', +v)}
              options={KEYS.map((k) => ({ value: String(k.pc), label: k.name }))}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-dim">
          音色
          <div className="w-40">
            <Picker
              label="音色"
              value={settings.instrument}
              onChange={changeInstrument}
              options={INSTRUMENTS.map((i) => ({ value: i.id, label: i.label }))}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-dim">
          メジャー/マイナー
          <Segmented
            label="メジャーとマイナーの切り替え方"
            value={settings.qualityMode}
            onChange={(v) => set('qualityMode', v)}
            options={[
              { value: 'tilt', label: '手の傾き' },
              { value: 'auto', label: '自動' },
            ]}
          />
        </div>
        <Toggle label="ガイド" checked={settings.guide} onChange={(v) => set('guide', v)} />
        <div className="ml-auto flex items-center gap-3 text-xs text-dim">
          {started && (
            <span className="flex items-center gap-1.5">
              <Icon name="tabler-camera" className="size-4" />
              {camera === 'off' ? (
                'カメラなし(キーボードで演奏できます)'
              ) : camera === 'starting' ? (
                'カメラを準備中…'
              ) : (
                <>
                  <span className={live.left ? 'text-mint' : ''}>左手{live.left ? '●' : '○'}</span>
                  <span className={live.right ? 'text-mint' : ''}>右手{live.right ? '●' : '○'}</span>
                </>
              )}
            </span>
          )}
          <Button onClick={() => setHelp(true)}>
            <Icon name="tabler-help-circle" className="size-4" />
            遊び方
          </Button>
        </div>
      </header>

      {/* カメラ映像 */}
      <main className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          muted
          playsInline
          className={`absolute inset-0 size-full object-cover ${FLIP ? '-scale-x-100' : ''}`}
        />
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-ink via-transparent to-ink/40" />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 size-full" />

        {settings.melody && started && (
          <div className="pointer-events-none absolute top-2 left-1/2 w-[min(46%,26rem)] -translate-x-1/2">
            <div className="text-center text-[10px] font-semibold tracking-widest text-white/70">お手本</div>
            <canvas ref={demoCanvasRef} className="aspect-[2/1] w-full -scale-x-100 drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]" />
            <div ref={demoLabelRef} className="-mt-2 text-center font-mono text-lg font-bold" />
          </div>
        )}

        {settings.guide && started && (
          <>
            <LeftGuide live={live} settings={settings} />
            <RightGuide live={live} />
          </>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28">
          <canvas ref={waveRef} className="absolute inset-0 size-full" />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-mono text-5xl leading-none font-bold" style={{ color, textShadow: `0 0 24px ${color}66` }}>
              {chord ? chordName(chord, settings.key) : '–'}
            </div>
            <div className="mt-1 font-mono text-xs text-white/70">{chord ? chordRoman(chord) : '左手でコードを選ぶ'}</div>
          </div>
        </div>

        {error && (
          <div className="absolute inset-x-0 top-3 mx-auto w-fit max-w-[90%] rounded-lg border border-red-400/50 bg-red-950/90 px-3 py-2 text-xs text-red-100">
            {error}
          </div>
        )}

        {!started && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-ink/90 p-6">
            <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-7 text-center">
              <div className="mx-auto mb-4 flex w-fit gap-2 text-mint">
                <Icon name="tabler-hand-finger" className="size-9" />
                <Icon name="tabler-hand-two-fingers" className="size-9" />
                <Icon name="tabler-hand-three-fingers" className="size-9" />
              </div>
              <h2 className="text-xl font-bold">手の形でコードを鳴らそう</h2>
              <p className="mt-3 text-sm leading-relaxed text-dim">
                左手の指の本数でコードを選び、右手で響きを変えます。
                <br />
                下に流れてくるtab譜に合わせて演奏してみましょう。
              </p>
              <p className="mt-3 text-xs text-dim">カメラの映像はこのブラウザの中だけで処理され、どこにも送信されません。</p>
              <Button variant="solid" className="mt-6 h-11 w-full text-base" disabled={loading} onClick={begin}>
                {loading ? '音源を読み込み中…' : 'はじめる'}
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* 曲とレーン */}
      <footer className="z-20 border-t border-line bg-ink">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-panel px-4 py-2">
          <div className="flex items-center gap-2">
            <Icon name="tabler-music" className="size-4 text-mint" />
            <div>
              <div className="text-sm leading-tight font-semibold">
                {song.title} <span className="text-xs font-normal text-dim">{song.composer}</span>
              </div>
              <div className="text-[10px] leading-tight text-dim">{song.credit}</div>
            </div>
          </div>
          <div className="flex items-center gap-4 font-mono text-sm">
            <span>
              <span className="mr-1 font-sans text-[10px] text-dim">スコア</span>
              {hud.score}
            </span>
            <span>
              <span className="mr-1 font-sans text-[10px] text-dim">コンボ</span>
              {hud.combo}
            </span>
            <span className="text-xs text-dim">
              {hud.perfect + hud.ok}/{total}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="flex w-44 items-center gap-2 text-xs text-dim">
              <span className="whitespace-nowrap">テンポ {settings.bpm}</span>
              <Range label="テンポ" value={settings.bpm} min={36} max={76} step={2} disabled={hud.playing} onChange={(v) => set('bpm', v)} />
            </div>
            <Toggle label="お手本モード" checked={settings.melody} onChange={(v) => set('melody', v)} />
            {hud.playing ? (
              <Button onClick={stopSong}>
                <Icon name="tabler-player-stop" className="size-4" />
                ストップ
              </Button>
            ) : (
              <Button variant="solid" disabled={!started} onClick={startSong}>
                <Icon name="tabler-player-play" className="size-4" />
                スタート
              </Button>
            )}
          </div>
        </div>
        <div className="relative h-52">
          <canvas ref={laneRef} className="absolute inset-0 size-full" />
          {hud.last && hud.playing && (
            <div
              key={hud.last.n}
              className={`pointer-events-none absolute top-0 w-32 -translate-x-1/2 text-center text-sm font-bold [animation:pop_0.7s_ease-out_forwards] ${
                hud.last.judge === 'miss' ? 'text-dim' : hud.last.judge === 'perfect' ? 'text-mint' : 'text-white'
              }`}
              style={{ left: HIT_X }}
            >
              {JUDGE_LABEL[hud.last.judge]}
            </div>
          )}
          {hud.playing && hud.countdown > 0 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center font-mono text-7xl font-bold text-white/80">
              {hud.countdown}
            </div>
          )}
        </div>
      </footer>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogBackdrop className="fixed inset-0 bg-black/60" />
        <DialogContent className="fixed inset-0 m-auto h-fit max-h-[90dvh] w-[min(92vw,34rem)] overflow-auto rounded-2xl border border-line bg-panel p-6 text-white shadow-2xl outline-none">
          <DialogTitle className="text-lg font-bold">遊び方</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-dim">カメラに両手を映して、手の形で演奏します。</DialogDescription>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed">
            <li>
              <b className="text-mint">左手</b>:指の本数でコードを選びます。1本=Ⅰ、2本=Ⅱ … 5本(パー)=Ⅴ、人差し指と小指=Ⅵ、そこに親指を足すとⅦ。グーにすると音が止まります。
            </li>
            <li>
              <b className="text-mint">メジャー/マイナー</b>:「手の傾き」では、左手を内側(画面の右)に傾けるとメジャー、まっすぐ立てるとマイナー。「自動」にするとキーに合ったほうを自動で選びます。
            </li>
            <li>
              <b className="text-mint">右手</b>:指の本数で響きを変えます(1本=基本形、2本=第1転回、3本と4本=セブンス)。手を内側に傾けると低く、外側に傾けると高くなります。右手はなくても演奏できます。
            </li>
            <li>
              <b className="text-mint">tab譜</b>:スタートを押すと、コードとtab譜が右から左へ流れます。丸が判定ラインに重なるタイミングで、その形を左手で作ってください。丸の中の手が右に傾いていればメジャー、左ならマイナーです。「お手本モード」をオンにすると、メロディが流れ、次に作る形を3Dの手が見せてくれます。
            </li>
            <li>
              <b className="text-mint">キーボード</b>:1〜7でコード(Shiftを押しながらでマイナー)、Q/W/E/Rで響き、Zでオクターブ。
            </li>
          </ul>
          <p className="mt-4 text-[11px] leading-relaxed text-dim">
            音源: FluidR3 GM(CC BY 3.0)/ アイコン: Tabler Icons・Fluent Emoji / 手のモデル: WebXR Generic Hand / 曲: パッヘルベル「カノン」(パブリックドメイン)
          </p>
          <div className="mt-5 flex justify-end">
            <DialogClose className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-mint px-4 text-sm font-semibold text-ink outline-none hover:bg-mint/85 focus-visible:ring-2 focus-visible:ring-white">
              閉じる
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogBackdrop className="fixed inset-0 bg-black/60" />
        <DialogContent className="fixed inset-0 m-auto h-fit w-[min(92vw,22rem)] rounded-2xl border border-line bg-panel p-6 text-center text-white shadow-2xl outline-none">
          <DialogTitle className="text-lg font-bold">おつかれさまでした</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-dim">{song.title}</DialogDescription>
          {result && (
            <>
              <div className="mt-4 font-mono text-5xl font-bold text-mint">{result.score}</div>
              <dl className="mt-4 grid grid-cols-4 gap-2 text-xs">
                {[
                  ['ぴったり', result.perfect],
                  ['OK', result.ok],
                  ['ミス', result.miss],
                  ['最大コンボ', result.maxCombo],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-black/30 py-2">
                    <dt className="text-[10px] text-dim">{k}</dt>
                    <dd className="font-mono text-base">{v}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <div className="mt-5 flex justify-center gap-2">
            <DialogClose className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-line bg-white/5 px-4 text-sm outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-mint">
              閉じる
            </DialogClose>
            <Button variant="solid" onClick={startSong}>
              もう一度
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Panel({ title, side, children }: { title: string; side: 'left' | 'right'; children: React.ReactNode }) {
  return (
    <section
      className={`absolute top-3 ${side === 'left' ? 'left-3' : 'right-3'} w-44 rounded-xl border border-line bg-panel/85 p-2 backdrop-blur-sm`}
    >
      <h2 className="px-1 pb-1 text-[10px] font-semibold tracking-widest text-dim">{title}</h2>
      {children}
    </section>
  )
}

function Row({ active, color, children }: { active: boolean; color?: string; children: React.ReactNode }) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-md px-1.5 py-[3px] text-xs whitespace-nowrap transition-colors ${active ? 'bg-white/15 text-white' : 'text-white/55'}`}
      style={active && color ? { color } : undefined}
    >
      {children}
    </div>
  )
}

const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ']

function LeftGuide({ live, settings }: { live: Live; settings: Settings }) {
  const active = live.chord?.degree
  return (
    <Panel title="左手 ─ コード" side="left">
      {DEGREE_ICON.map((icon, i) => (
        <Row key={i} active={active === i + 1} color={DEGREE_COLOR[i]}>
          <Icon name={icon} className="size-5" />
          <span className="w-4 text-center text-[11px] opacity-70">{ROMAN[i]}</span>
          <span className="font-mono font-semibold">{noteName(degreeRoot(i + 1, settings.key), settings.key)}</span>
        </Row>
      ))}
      <div className="mt-1.5 grid grid-cols-2 gap-1 border-t border-line pt-1.5">
        {settings.qualityMode === 'tilt' ? (
          <>
            <Row active={!!live.chord && live.quality === 'min'}>
              <Icon name="tabler-hand-finger" className="size-4" rotate={QUALITY_TILT.min} />
              マイナー
            </Row>
            <Row active={!!live.chord && live.quality === 'maj'}>
              <Icon name="tabler-hand-finger" className="size-4" rotate={QUALITY_TILT.maj} />
              メジャー
            </Row>
          </>
        ) : (
          <div className="col-span-2 px-1.5 text-[11px] text-dim">
            メジャー/マイナーは自動{live.chord ? `(${live.quality === 'maj' ? 'メジャー' : 'マイナー'})` : ''}
          </div>
        )}
      </div>
    </Panel>
  )
}

function RightGuide({ live }: { live: Live }) {
  return (
    <Panel title="右手 ─ 響き" side="right">
      {VOICINGS.map((v, i) => (
        <Row key={v} active={live.voicing === v}>
          <Icon name={VOICING_ICON[i]} className="size-5" />
          {voicingLabel(v, live.quality)}
        </Row>
      ))}
      <h2 className="mt-1.5 border-t border-line px-1 pt-1.5 pb-1 text-[10px] font-semibold tracking-widest text-dim">オクターブ</h2>
      <div className="grid grid-cols-2 gap-1">
        <Row active={live.octave === 'low'}>
          <Icon name="tabler-arrow-up-left" className="size-4" />
          低い
        </Row>
        <Row active={live.octave === 'high'}>
          <Icon name="tabler-arrow-up-right" className="size-4" />
          高い
        </Row>
      </div>
    </Panel>
  )
}
