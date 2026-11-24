// パッヘルベルのカノン(パブリックドメイン)を、このアプリ用にドロップDのソロギターへ編曲してASCII tab譜にする。
// 実行: node scripts/make-canon-tab.mjs > src/assets/canon.txt
// 弦は 0 = 1弦(E) … 5 = 6弦(D)。1つのコードは8分音符4つぶん。
const SHAPES = {
  D: { bass: [5, 0], s: [[3, 0], [2, 2], [1, 3], [0, 2]] },
  A: { bass: [4, 0], s: [[3, 2], [2, 2], [1, 2], [0, 0]] },
  Bm: { bass: [4, 2], s: [[3, 4], [2, 4], [1, 3], [0, 2]] },
  'F#m': { bass: [5, 4], s: [[3, 4], [2, 2], [1, 2], [0, 2]] },
  G: { bass: [5, 5], s: [[3, 0], [2, 0], [1, 0], [0, 3]] },
}
const PROG = ['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A']
// 主題(第1声部と第2声部)と、4分音符の変奏
const THEME1 = [[0, 2], [0, 0], [1, 3], [1, 2], [1, 0], [2, 2], [1, 0], [1, 2]]
const THEME2 = [[1, 3], [1, 2], [1, 0], [2, 2], [2, 0], [3, 4], [2, 0], [3, 2]]
const QUARTERS = [[[1, 3], [0, 2]], [[0, 5], [0, 3]], [[0, 2], [1, 3]], [[0, 2], [0, 0]], [[1, 3], [1, 0]], [[1, 3], [0, 5]], [[0, 3], [0, 7]], [[0, 5], [0, 3]]]

const VARIATIONS = [
  (c) => [[c.bass], [c.s[1]], [c.s[2]], [c.s[1]]],
  (c, i) => [[c.bass, THEME1[i]], [c.s[1]], [c.s[0]], [c.s[1]]],
  (c, i) => [[c.bass, THEME2[i]], [c.s[1]], [c.s[2]], [c.s[1]]],
  (c, i) => [[c.bass, QUARTERS[i][0]], [c.s[1]], [QUARTERS[i][1]], [c.s[1]]],
  (c) => [[c.bass], [c.s[1]], [c.s[2]], [c.s[3]]],
  (c, i) => [[c.bass, THEME1[i]], [c.s[0]], [c.s[1]], [c.s[2]]],
]

const bars = [] // 各小節は8スロット、各スロットは [弦, フレット] の配列
for (const v of VARIATIONS) {
  for (let b = 0; b < 4; b++) {
    const slots = []
    for (let h = 0; h < 2; h++) slots.push(...v(SHAPES[PROG[b * 2 + h]], b * 2 + h))
    bars.push(slots)
  }
}
const d = SHAPES.D
bars.push([[d.bass, ...d.s], [], [], [], [], [], [], []])

const NAMES = ['E', 'B', 'G', 'D', 'A', 'D']
const out = [
  'Canon in D - Johann Pachelbel (1653-1706)',
  'てのひらシンセ用の編曲(ドロップD)。scripts/make-canon-tab.mjs で生成',
  'コード(1小節に2つ): |D A|Bm F#m|G D|G A|',
  '',
]
for (let i = 0; i < bars.length; i += 4) {
  const group = bars.slice(i, i + 4)
  out.push(String(i + 1))
  for (let s = 0; s < 6; s++) {
    let line = NAMES[s] + '-|'
    for (const bar of group) {
      for (const slot of bar) {
        const n = slot.find((x) => x[0] === s)
        line += '-' + (n ? n[1] : '-')
      }
      line += '|'
    }
    out.push(line)
  }
  out.push('')
}
process.stdout.write(out.join('\n'))
