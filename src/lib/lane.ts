import { DEGREE_ICON, QUALITY_TILT, iconImage } from '../components/Icon'
import type { ChartEvent, Song } from './tab'

export const DEGREE_COLOR = ['#ffd166', '#ff9f6b', '#ff6b9d', '#c58bff', '#7ab8ff', '#5fe3d0', '#9be36b']

export type Judge = 'pending' | 'perfect' | 'ok' | 'miss'

export interface RunEvent extends ChartEvent {
  time: number
  dur: number
  judge: Judge
  judgedAt: number
}

export interface LaneView {
  song: Song
  events: RunEvent[] | null
  /** 曲の現在位置(秒)。再生していないときは 0 */
  now: number
  barDur: number
  showTilt: boolean
}

export const HIT_X = 132
const PX_PER_SEC = 150
const CHORD_Y = 46
const R = 25
const STRING_LABELS = ['E', 'B', 'G', 'D', 'A', 'D']

/** 下のレーンを描く。コードとtab譜が右から左へ流れて、判定ラインに重なる */
export function drawLane(ctx: CanvasRenderingContext2D, w: number, h: number, v: LaneView) {
  ctx.clearRect(0, 0, w, h)
  const xOf = (t: number) => HIT_X + (t - v.now) * PX_PER_SEC
  const tMin = v.now - HIT_X / PX_PER_SEC - 1
  const tMax = v.now + (w - HIT_X) / PX_PER_SEC + 1

  // コードのレーン
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  ctx.fillRect(0, CHORD_Y - R - 7, w, (R + 7) * 2)

  // tab譜の6本線
  const top = CHORD_Y + R + 26
  const gap = Math.max(11, (h - top - 12) / 5)
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1
  for (let s = 0; s < 6; s++) {
    const y = Math.round(top + s * gap) + 0.5
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }

  // 小節線と小節番号
  ctx.font = '10px ui-monospace, Menlo, monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const firstBar = Math.max(0, Math.floor(tMin / v.barDur))
  for (let b = firstBar; b <= v.song.bars && b * v.barDur < tMax; b++) {
    const x = Math.round(xOf(b * v.barDur) - 9) + 0.5
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, top + gap * 5)
    ctx.stroke()
    if (b < v.song.bars) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillText(String(b + 1), x + 3, top - 9)
    }
  }

  // フレット番号
  ctx.font = '600 13px ui-monospace, Menlo, monospace'
  ctx.textAlign = 'center'
  for (const n of v.song.notes) {
    const t = n.pos * v.barDur
    if (t < tMin) continue
    if (t > tMax) break
    const x = xOf(t)
    const y = top + n.string * gap
    const past = t < v.now
    const label = String(n.fret)
    ctx.fillStyle = '#0a0c12'
    ctx.fillRect(x - 4 * label.length - 2, y - 7, 8 * label.length + 4, 14)
    ctx.fillStyle = past ? 'rgba(255,255,255,0.3)' : '#ffffff'
    ctx.fillText(label, x, y + 0.5)
  }

  // コードのノーツ
  const events: (RunEvent | (ChartEvent & { time: number; dur: number; judge: Judge; judgedAt: number }))[] =
    v.events ?? v.song.chart.map((e) => ({ ...e, time: e.pos * v.barDur, dur: e.len * v.barDur, judge: 'pending' as Judge, judgedAt: 0 }))
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.time + e.dur < tMin || e.time > tMax) continue
    const x = xOf(e.time)
    const color = DEGREE_COLOR[e.degree - 1]
    const hit = e.judge === 'perfect' || e.judge === 'ok'
    const fade = hit ? Math.max(0, 1 - (v.now - e.judgedAt) / 0.35) : 1
    if (hit && fade <= 0) continue
    ctx.globalAlpha = e.judge === 'miss' ? 0.3 : fade

    // 押さえ続ける長さの帯
    const tail = e.dur * PX_PER_SEC - R - 8
    ctx.fillStyle = color + '33'
    ctx.beginPath()
    ctx.roundRect(x, CHORD_Y - 13, tail + R, 26, 13)
    ctx.fill()

    const r = hit ? R + (1 - fade) * 14 : R
    ctx.fillStyle = e.judge === 'miss' ? '#555c70' : color
    ctx.beginPath()
    ctx.arc(x, CHORD_Y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(10,12,18,0.9)'
    ctx.lineWidth = 3
    ctx.stroke()

    const img = iconImage(DEGREE_ICON[e.degree - 1], '#0a0c12')
    if (img.complete && img.naturalWidth) {
      // メジャー/マイナーは手のアイコンの傾きで示す
      ctx.save()
      ctx.translate(x, CHORD_Y)
      if (v.showTilt) ctx.rotate((QUALITY_TILT[e.quality] * Math.PI) / 180)
      ctx.drawImage(img, -16, -16, 32, 32)
      ctx.restore()
    }

    ctx.fillStyle = '#ffffff'
    ctx.font = '700 14px ui-monospace, Menlo, monospace'
    ctx.textAlign = 'left'
    ctx.fillText(e.name, x + R + 7, CHORD_Y + 1)
    ctx.globalAlpha = 1
  }

  // 左端のラベル帯と判定ライン
  const grad = ctx.createLinearGradient(0, 0, 44, 0)
  grad.addColorStop(0, 'rgba(10,12,18,1)')
  grad.addColorStop(1, 'rgba(10,12,18,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 44, h)
  ctx.font = '600 11px ui-monospace, Menlo, monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  for (let s = 0; s < 6; s++) ctx.fillText(STRING_LABELS[s], 12, top + s * gap + 0.5)

  ctx.strokeStyle = 'rgba(124,247,196,0.9)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(HIT_X, top - 4)
  ctx.lineTo(HIT_X, top + gap * 5 + 4)
  ctx.stroke()
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(HIT_X, CHORD_Y, R + 5, 0, Math.PI * 2)
  ctx.stroke()
}
