export type Quality = 'maj' | 'min'
export type Voicing = 'root' | 'inv1' | 'sev1' | 'sev2'
export type Octave = 'high' | 'low'

export interface Chord {
  degree: number // 1..7
  quality: Quality
  voicing: Voicing
  octave: Octave
}

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const FLAT_KEYS = new Set([5, 10, 3, 8, 1])
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
/** ダイアトニックでのコードの種類(メジャーキー) */
export const DIATONIC_QUALITY: Quality[] = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'min']

export const KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((pc) => ({
  pc,
  name: (FLAT_KEYS.has(pc) ? FLAT : SHARP)[pc],
}))

export function noteName(pc: number, key: number): string {
  return (FLAT_KEYS.has(key) ? FLAT : SHARP)[((pc % 12) + 12) % 12]
}

export function degreeRoot(degree: number, key: number): number {
  return (key + MAJOR_SCALE[degree - 1]) % 12
}

export function chordName(c: Chord, key: number): string {
  const root = noteName(degreeRoot(c.degree, key), key)
  if (c.quality === 'maj') {
    return root + (c.voicing === 'sev1' ? 'maj7' : c.voicing === 'sev2' ? '7' : '')
  }
  return root + (c.voicing === 'sev1' ? 'm7' : c.voicing === 'sev2' ? 'dim7' : 'm')
}

export function chordRoman(c: Chord): string {
  const r = ROMAN[c.degree - 1]
  const base = c.quality === 'maj' ? r : r.toLowerCase()
  const suffix =
    c.voicing === 'sev1' ? (c.quality === 'maj' ? 'maj7' : '7') : c.voicing === 'sev2' ? (c.quality === 'maj' ? '7' : '°7') : ''
  return base + suffix
}

export function voicingLabel(v: Voicing, q: Quality): string {
  if (v === 'root') return '基本形'
  if (v === 'inv1') return '第1転回'
  if (v === 'sev1') return q === 'maj' ? 'メジャー7' : 'マイナー7'
  return q === 'maj' ? 'ドミナント7' : 'ディミニッシュ7'
}

/** コードを構成するMIDIノート番号(低い順) */
export function chordNotes(c: Chord, key: number): number[] {
  const pc = degreeRoot(c.degree, key)
  // ルートは A2(45)〜G#3(56) の範囲に置く
  let root = 48 + pc
  if (root > 56) root -= 12
  if (c.octave === 'high') root += 12
  const third = c.quality === 'maj' ? 4 : 3
  let iv: number[]
  switch (c.voicing) {
    case 'root':
      iv = [-12, 0, third, 7, 12]
      break
    case 'inv1':
      iv = [third - 12, third, 7, 12]
      break
    case 'sev1':
      iv = [-12, 0, third, 7, c.quality === 'maj' ? 11 : 10]
      break
    case 'sev2':
      iv = c.quality === 'maj' ? [-12, 0, 4, 7, 10] : [-12, 0, 3, 6, 9]
      break
  }
  return iv.map((i) => root + i)
}

export function sameChord(a: Chord | null, b: Chord | null): boolean {
  if (!a || !b) return a === b
  return a.degree === b.degree && a.quality === b.quality && a.voicing === b.voicing && a.octave === b.octave
}
