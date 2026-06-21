import { useState } from 'react'

// 汎用会話ボックス。話者名＋複数行。タップ/クリックで進み、最後で onDone。
export default function Dialogue({
  speaker,
  lines,
  onDone,
}: {
  speaker?: string
  lines: string[]
  onDone: () => void
}) {
  const [i, setI] = useState(0)
  const last = i >= lines.length - 1
  const next = () => (last ? onDone() : setI(i + 1))
  return (
    <div className="dialogue-overlay" onClick={next}>
      <div className="dialogue-box" onClick={(e) => e.stopPropagation()}>
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
