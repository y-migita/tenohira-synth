const raw = import.meta.glob('../icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const ICONS: Record<string, string> = {}
for (const [path, svg] of Object.entries(raw)) {
  ICONS[path.split('/').pop()!.replace('.svg', '')] = svg
}

export type IconName =
  | 'tabler-hand-finger'
  | 'tabler-hand-two-fingers'
  | 'tabler-hand-three-fingers'
  | 'tabler-hand-stop'
  | 'fluent-hand-splayed'
  | 'tabler-hand-rock'
  | 'fluent-love-you'
  | 'tabler-hand-grab'
  | 'tabler-hand-finger-right'
  | 'tabler-arrow-up-left'
  | 'tabler-arrow-up-right'
  | 'tabler-camera'
  | 'tabler-keyboard'
  | 'tabler-music'
  | 'tabler-volume'
  | 'tabler-help-circle'
  | 'tabler-player-play'
  | 'tabler-player-stop'

/** 左手の度数(1〜7)に対応するジェスチャーアイコン */
export const DEGREE_ICON: IconName[] = [
  'tabler-hand-finger',
  'tabler-hand-two-fingers',
  'tabler-hand-three-fingers',
  'tabler-hand-stop',
  'fluent-hand-splayed',
  'tabler-hand-rock',
  'fluent-love-you',
]

/** メジャー/マイナーを表すアイコンの傾き(度)。メジャーは右、マイナーは左に傾ける */
export const QUALITY_TILT = { maj: 24, min: -20 }

export function Icon({ name, className = 'size-5', rotate = 0 }: { name: IconName; className?: string; rotate?: number }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 transition-transform duration-150 [&>svg]:block [&>svg]:size-full ${className}`}
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  )
}

/** canvasに描くための、色を付けたアイコン画像 */
const cache = new Map<string, HTMLImageElement>()
export function iconImage(name: IconName, color: string): HTMLImageElement {
  const key = name + color
  let img = cache.get(key)
  if (!img) {
    img = new Image()
    const svg = ICONS[name].replaceAll('currentColor', color).replace('width="1em" height="1em"', 'width="64" height="64"')
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    cache.set(key, img)
  }
  return img
}
