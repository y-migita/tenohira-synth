import type { Quality } from './music'

export interface TabNote {
  /** 曲頭からの位置(小節単位) */
  pos: number
  /** 0 = 1弦(一番上の行) … 5 = 6弦 */
  string: number
  fret: number
  midi: number
}

export interface ChartEvent {
  pos: number
  /** 小節単位の長さ */
  len: number
  degree: number
  quality: Quality
  name: string
}

export interface Song {
  title: string
  composer: string
  credit: string
  bars: number
  notes: TabNote[]
  chart: ChartEvent[]
}

// ドロップD: 1弦E4, 2弦B3, 3弦G3, 4弦D3, 5弦A2, 6弦D2
const TUNING = [64, 59, 55, 50, 45, 38]
const ROW = /^[EBGDA]-\|/

/** ASCIIのtab譜を読む。1小節 = 縦線から縦線まで */
export function parseTab(text: string): { notes: TabNote[]; bars: number } {
  const lines = text.split(/\r?\n/)
  const notes: TabNote[] = []
  let bars = 0
  for (let i = 0; i + 5 < lines.length; i++) {
    if (!lines.slice(i, i + 6).every((l) => ROW.test(l))) continue
    const rows = lines.slice(i, i + 6).map((l) => l.slice(3))
    const segs = rows.map((r) => r.split('|').filter((s) => s.length > 0))
    const nBars = Math.min(...segs.map((s) => s.length))
    for (let b = 0; b < nBars; b++) {
      const width = Math.max(...segs.map((s) => s[b].length))
      for (let s = 0; s < 6; s++) {
        const seg = segs[s][b]
        for (let c = 0; c < seg.length; c++) {
          const ch = seg[c]
          if (ch < '0' || ch > '9') continue
          let fret = +ch
          const col = c
          // 10〜12フレットは2桁で書かれている
          if (ch === '1' && seg[c + 1] >= '0' && seg[c + 1] <= '2') {
            fret = +(ch + seg[c + 1])
            c++
          }
          notes.push({ pos: bars + b + Math.max(0, col - 1) / width, string: s, fret, midi: TUNING[s] + fret })
        }
      }
    }
    bars += nBars
    i += 5
  }
  notes.sort((a, b) => a.pos - b.pos)
  return { notes, bars }
}

/** カノンのコード進行(1小節に2つ): |D A|Bm F#m|G D|G A| */
const CANON: [number, Quality, string][] = [
  [1, 'maj', 'D'],
  [5, 'maj', 'A'],
  [6, 'min', 'Bm'],
  [3, 'min', 'F#m'],
  [4, 'maj', 'G'],
  [1, 'maj', 'D'],
  [4, 'maj', 'G'],
  [5, 'maj', 'A'],
]

export function buildCanon(text: string): Song {
  const { notes, bars } = parseTab(text)
  const chart: ChartEvent[] = []
  for (let b = 0; b < bars; b++) {
    if (b === bars - 1 && b % 4 === 0) {
      chart.push({ pos: b, len: 1, degree: 1, quality: 'maj', name: 'D' })
      break
    }
    for (let h = 0; h < 2; h++) {
      const [degree, quality, name] = CANON[(b % 4) * 2 + h]
      chart.push({ pos: b + h / 2, len: 0.5, degree, quality, name })
    }
  }
  return {
    title: 'カノン ニ長調',
    composer: 'J. パッヘルベル',
    credit: 'ドロップDのソロギター編曲(このアプリ用)',
    bars,
    notes,
    chart,
  }
}
