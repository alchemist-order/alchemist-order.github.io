import { useState } from 'react'

// 話者の立ち絵。portraits/<id>.png(水彩) → 無ければ ui/npc_<id>.png(ドット) → 無ければ非表示。
function Portrait({ id }: { id: string }) {
  const srcs = [
    `${import.meta.env.BASE_URL}portraits/${id}.png`,
    `${import.meta.env.BASE_URL}ui/npc_${id}.png`,
  ]
  const [stage, setStage] = useState(0)
  if (stage >= srcs.length) return null
  return (
    <img
      className="dialogue-portrait"
      src={srcs[stage]}
      alt=""
      onError={() => setStage((s) => s + 1)}
    />
  )
}

// 汎用会話ボックス。話者名＋立ち絵＋複数行。タップ/クリックで進み、最後で onDone。
export default function Dialogue({
  speaker,
  portrait,
  lines,
  onDone,
}: {
  speaker?: string
  portrait?: string
  lines: string[]
  onDone: () => void
}) {
  const [i, setI] = useState(0)
  const last = i >= lines.length - 1
  const next = () => (last ? onDone() : setI(i + 1))
  return (
    <div className="dialogue-overlay" onClick={next}>
      <div className="dialogue-box" onClick={(e) => e.stopPropagation()}>
        {portrait && <Portrait id={portrait} />}
        {speaker && <div className="dialogue-speaker">{speaker}</div>}
        <p key={i} className="dialogue-text">
          {lines[i]}
        </p>
        <button className="dialogue-next" onClick={next}>
          {last ? '▼ とじる' : '▼ つぎへ'}
        </button>
      </div>
    </div>
  )
}
