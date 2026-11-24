# てのひらシンセ

手の形でコードを鳴らすジェスチャーシンセです。下のレーンにtab譜とコードが流れてくるので、合わせて演奏できます。

```bash
npm install
npm run dev
```

- 左手: 指の本数でコード(Ⅰ〜Ⅶ)を選ぶ。内側に傾けるとメジャー、立てるとマイナー
- 右手: 指の本数で響き(基本形 / 第1転回 / セブンス)、傾きでオクターブ
- キーボード: 1〜7でコード(Shiftでマイナー)、Q/W/E/Rで響き、Zでオクターブ
- `?src=/動画.mp4` を付けると、カメラの代わりに `public/` 内の動画を入力にできます(動作確認用)

## 構成

- Vite + React + Tailwind CSS v4 + UI SDK(`@ui-sdk/react`)
- ハンドトラッキング: MediaPipe Hand Landmarker(ブラウザ内で処理。映像は送信しません)
- 音: 録音済みサンプルを再生するサンプラー(`src/lib/audio.ts`)。合成はしていません

## 素材のクレジット

- 音源: FluidR3 GM(Frank Wen、CC BY 3.0)。[midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) のmp3を `public/samples/` に置いています
- アイコン: Tabler Icons(MIT)、Fluent Emoji High Contrast(MIT)。Iconify経由で取得
- 手の3Dモデル: `public/models/hand-left.glb` / `hand-right.glb`(WebXRのGeneric Handモデル)
- ハンドトラッキングのモデルとWASM: MediaPipe(Apache 2.0)
- tab譜: パッヘルベル「カノン ニ長調」(パブリックドメイン)を、このアプリ用にドロップDのソロギターへ編曲したもの。`node scripts/make-canon-tab.mjs > src/assets/canon.txt` で生成

## デプロイ

Cloudflare Workers の静的アセットとして配信します。

```bash
npm run build
npx wrangler deploy
```
