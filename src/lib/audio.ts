const SAMPLE_NOTES: [string, number][] = [
  ['D2', 38], ['F2', 41], ['Ab2', 44], ['B2', 47],
  ['D3', 50], ['F3', 53], ['Ab3', 56], ['B3', 59],
  ['D4', 62], ['F4', 65], ['Ab4', 68], ['B4', 71],
  ['D5', 74], ['F5', 77], ['Ab5', 80], ['B5', 83],
]

export const INSTRUMENTS = [
  { id: 'lead_2_sawtooth', label: 'レトロシンセ', sustain: true, gain: 0.5 },
  { id: 'acoustic_guitar_nylon', label: 'ナイロンギター', sustain: false, gain: 1 },
  { id: 'acoustic_grand_piano', label: 'ピアノ', sustain: false, gain: 0.9 },
  { id: 'electric_piano_1', label: 'エレピ', sustain: false, gain: 0.9 },
] as const

export type InstrumentId = (typeof INSTRUMENTS)[number]['id']

interface Voice {
  gain: GainNode
  sources: AudioBufferSourceNode[]
}

/** 録音済みサンプル(FluidR3 GM)を鳴らすだけのサンプラー。音の合成はしない */
export class Sampler {
  ctx: AudioContext
  analyser: AnalyserNode
  private master: GainNode
  private buffers = new Map<string, Map<number, AudioBuffer>>()
  private loading = new Map<string, Promise<void>>()
  private chord: Voice | null = null
  private restrike: number | null = null

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.8
    const comp = this.ctx.createDynamicsCompressor()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.master.connect(comp)
    comp.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)
  }

  setVolume(v: number) {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02)
  }

  load(inst: InstrumentId): Promise<void> {
    let p = this.loading.get(inst)
    if (!p) {
      p = (async () => {
        const map = new Map<number, AudioBuffer>()
        await Promise.all(
          SAMPLE_NOTES.map(async ([name, midi]) => {
            const res = await fetch(`/samples/${inst}/${name}.mp3`)
            if (!res.ok) throw new Error(`サンプルを読み込めません: ${inst}/${name}`)
            map.set(midi, await this.ctx.decodeAudioData(await res.arrayBuffer()))
          }),
        )
        this.buffers.set(inst, map)
      })()
      this.loading.set(inst, p)
    }
    return p
  }

  isLoaded(inst: InstrumentId) {
    return this.buffers.has(inst)
  }

  private source(inst: InstrumentId, midi: number): AudioBufferSourceNode | null {
    const map = this.buffers.get(inst)
    if (!map) return null
    let best = 38
    for (const m of map.keys()) if (Math.abs(m - midi) < Math.abs(best - midi)) best = m
    const src = this.ctx.createBufferSource()
    src.buffer = map.get(best)!
    src.playbackRate.value = 2 ** ((midi - best) / 12)
    return src
  }

  /** 単音を鳴らす(tab譜のメロディ用) */
  playNote(inst: InstrumentId, midi: number, when: number, gain = 0.5, dur = 2.5) {
    const src = this.source(inst, midi)
    if (!src) return
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, when)
    g.gain.setTargetAtTime(0, when + dur, 0.15)
    src.connect(g).connect(this.master)
    src.start(when)
    src.stop(when + dur + 1)
  }

  private strike(inst: InstrumentId, notes: number[], level: number): Voice {
    const now = this.ctx.currentTime
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(level, now + 0.015)
    g.connect(this.master)
    const sources: AudioBufferSourceNode[] = []
    notes.forEach((n, i) => {
      const src = this.source(inst, n)
      if (!src) return
      src.connect(g)
      src.start(now + i * 0.012) // 低い音から少しずつずらして鳴らす
      sources.push(src)
    })
    return { gain: g, sources }
  }

  private fade(v: Voice, t = 0.08) {
    const now = this.ctx.currentTime
    v.gain.gain.cancelScheduledValues(now)
    v.gain.gain.setTargetAtTime(0, now, t)
    for (const s of v.sources) s.stop(now + t * 8)
  }

  /** コードを鳴らす。前のコードは短くフェードアウトさせる */
  playChord(inst: InstrumentId, notes: number[]) {
    this.releaseChord()
    const def = INSTRUMENTS.find((i) => i.id === inst)!
    const level = (def.gain * 0.9) / Math.sqrt(notes.length)
    this.chord = this.strike(inst, notes, level)
    if (def.sustain) {
      // 持続音のサンプルは約3秒で切れるので、押さえている間は重ねて鳴らし直す
      this.restrike = window.setInterval(() => {
        const old = this.chord
        this.chord = this.strike(inst, notes, level)
        if (old) this.fade(old, 0.12)
      }, 2200)
    }
  }

  releaseChord() {
    if (this.restrike !== null) {
      clearInterval(this.restrike)
      this.restrike = null
    }
    if (this.chord) {
      this.fade(this.chord)
      this.chord = null
    }
  }
}
