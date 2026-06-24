import { useState } from 'react'

// プロローグ。各ページ1〜2行。タップ or 「次へ」で進む。
const PAGES: string[][] = [
  ['空には、目に見えぬ粒子――《エーテル》が満ちている。', '錬金術師たちはそれを束ね、幻の獣を生み出す術を見いだした。'],
  ['幻獣を操る者は《錬獣師》と呼ばれ、', 'その頂点に立つ秩序こそ――《アルケミスト・オーダー》。'],
  ['だが今、大陸を"灰化"が蝕んでいる。幻獣は色と心を失い、暴れ出す。', 'オーダーは各地の《守護者》に記章を託し、これに立ち向かえる錬獣師を選んでいる。'],
  ['八つの記章を集めた者だけが、オーダーの中枢へ――灰化の元凶へ挑む資格を得る。', 'すべては、失われゆく世界を取り戻すために。'],
  ['ここは錬金の大陸アルケミア。あなたは地方の村ラピスで学ぶ、ひとりの見習い。', '今日は――師から はじめての幻獣を授かる、旅立ちの日。'],
  ['朝の光が、窓から差し込む。', 'さあ……ゆっくりと、目を覚まそう。'],
  ['【操作】矢印キー、または画面の十字ボタンで移動。人や物に向かって進むと調べられる。', '画面上の 🎯 が、つねに次の目標を教えてくれる。それに従って進もう。'],
]

export default function Opening({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const last = i >= PAGES.length - 1
  const next = () => (last ? onDone() : setI(i + 1))

  return (
    <div className="opening-screen" onClick={next}>
      <div key={i} className="opening-box">
        {PAGES[i].map((line, k) => (
          <p key={k} className="opening-line">
            {line}
          </p>
        ))}
      </div>
      <div className="opening-controls" onClick={(e) => e.stopPropagation()}>
        <button className="opening-skip" onClick={onDone}>
          スキップ
        </button>
        <span className="opening-progress">
          {i + 1} / {PAGES.length}
        </span>
        <button className="opening-next" onClick={next}>
          {last ? '目を覚ます ▶' : '次へ ▶'}
        </button>
      </div>
    </div>
  )
}
