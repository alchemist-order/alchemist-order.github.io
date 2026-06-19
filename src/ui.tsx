import type { Combatant, StatusKind } from './types'
import { spriteOf } from './game/sprites'

export const TYPE_COLORS: Record<string, string> = {
  火: '#e2563b', 水: '#3b82e2', 風: '#4cae8b', 地: '#b08a3e', 雷: '#e2c23b',
  毒: '#9a4ce2', 聖: '#c9b033', 冥: '#6b4ce2', 錬成: '#8a8f99',
}

const STATUS_COLORS: Record<StatusKind, string> = {
  やけど: '#e2563b', どく: '#9a4ce2', まひ: '#e2c23b', ねむり: '#5a7b8a', こおり: '#3bb6e2', 灰化: '#8a8f99',
}

export function TypeBadge({ t }: { t: string }) {
  return (
    <span className="badge" style={{ background: TYPE_COLORS[t] ?? '#666' }}>
      {t}
    </span>
  )
}

export function StatusBadge({ status }: { status: StatusKind | null }) {
  if (!status) return null
  return (
    <span className="badge status-badge" style={{ background: STATUS_COLORS[status] }}>
      {status}
    </span>
  )
}

/** 絵文字スプライト。type-color の光輪の上に表示 */
export function Sprite({ id, type, size = 56 }: { id: string; type: string; size?: number }) {
  return (
    <div
      className="sprite"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 30%, #ffffff22, ${TYPE_COLORS[type] ?? '#666'}66)`,
        fontSize: size * 0.6,
      }}
    >
      {spriteOf(id, type)}
    </div>
  )
}

export function HpBar({ c }: { c: Combatant }) {
  const ratio = c.hp / c.maxHp
  const hpColor = ratio > 0.5 ? '#43c463' : ratio > 0.2 ? '#e2c23b' : '#e2563b'
  return (
    <>
      <div className="hpbar-outer">
        <div className="hpbar-inner" style={{ width: `${ratio * 100}%`, background: hpColor }} />
      </div>
      <div className="hp-text">
        {c.hp} / {c.maxHp}
      </div>
    </>
  )
}
