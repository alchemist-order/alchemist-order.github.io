import { useState } from 'react'
import type { Combatant, StatusKind } from './types'
import { spriteFileNo, spriteOf } from './game/sprites'

// 画像が無いidを記録し、再リクエストを避ける(セッション内)
const missingSprites = new Set<string>()

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

/**
 * スプライト。public/sprites/<番号>.png があれば画像、無ければ絵文字にフォールバック。
 * bare=true で枠なし(バトルシーン用)、flip=true で左右反転(向かい合わせ用)。
 */
export function Sprite({
  id,
  type,
  size = 56,
  bare = false,
  flip = false,
}: {
  id: string
  type: string
  size?: number
  bare?: boolean
  flip?: boolean
}) {
  const [failed, setFailed] = useState(missingSprites.has(id))
  const src = `${import.meta.env.BASE_URL}sprites/${spriteFileNo(id)}.png`
  const content = failed ? (
    spriteOf(id, type)
  ) : (
    <img
      className="sprite-img"
      src={src}
      alt=""
      loading="lazy"
      onError={() => {
        missingSprites.add(id)
        setFailed(true)
      }}
    />
  )
  if (bare) {
    return (
      <div className="sprite-bare" style={{ width: size, height: size, fontSize: size * 0.85, transform: flip ? 'scaleX(-1)' : undefined }}>
        {content}
      </div>
    )
  }
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
      {content}
    </div>
  )
}

// プレイヤーの歩きキャラ(ドット絵)。public/ui/player.png があれば画像、無ければ🧝。
const playerImgState = { missing: false }
export function PlayerToken({ flip = false, size = 34 }: { flip?: boolean; size?: number }) {
  const [failed, setFailed] = useState(playerImgState.missing)
  const transform = flip ? 'scaleX(-1)' : undefined
  if (failed) {
    return <span style={{ transform, display: 'inline-block' }}>🧝</span>
  }
  return (
    <img
      className="player-sprite"
      src={`${import.meta.env.BASE_URL}ui/player.png`}
      alt=""
      style={{ width: size, height: size, transform }}
      onError={() => {
        playerImgState.missing = true
        setFailed(true)
      }}
    />
  )
}

// 支部長など敵トレーナーの歩きキャラ。public/ui/<trainerId>.png があれば画像、無ければ🧙‍♀️。
const leaderImgState: Record<string, boolean> = {}
export function LeaderToken({ trainerId, defeated, size = 46 }: { trainerId: string; defeated?: boolean; size?: number }) {
  const [failed, setFailed] = useState(!!leaderImgState[trainerId])
  if (failed) {
    return <span>{defeated ? '🧙' : '🧙‍♀️'}</span>
  }
  return (
    <img
      className="leader-sprite"
      src={`${import.meta.env.BASE_URL}ui/${trainerId}.png`}
      alt=""
      style={{ height: size, width: 'auto', opacity: defeated ? 0.5 : 1 }}
      onError={() => {
        leaderImgState[trainerId] = true
        setFailed(true)
      }}
    />
  )
}

// 村のNPC。public/ui/npc_<kind>.png があれば画像、無ければ種別の絵文字。
const NPC_EMOJI: Record<string, string> = { mentor: '🧙‍♂️', mom: '👩', inn: '🧑‍🍳', sign: '📜', villager: '🧑', shop: '🛒' }
const npcImgState: Record<string, boolean> = {}
export function NpcToken({ kind, emoji, size = 46 }: { kind: string; emoji?: string; size?: number }) {
  const [failed, setFailed] = useState(!!npcImgState[kind])
  if (failed) return <span>{emoji ?? NPC_EMOJI[kind] ?? '❔'}</span>
  return (
    <img
      className="leader-sprite"
      src={`${import.meta.env.BASE_URL}ui/npc_${kind}.png`}
      alt=""
      style={{ height: size, width: 'auto' }}
      onError={() => {
        npcImgState[kind] = true
        setFailed(true)
      }}
    />
  )
}

// マップ上の小物。public/ui/prop_<kind>.png があれば画像、'fence'はCSS、無ければ絵文字。
const PROP_EMOJI: Record<string, string> = {
  bed: '🛏️', bookshelf: '📚', books: '📖', cauldron: '⚗️', candle: '🕯️', plant: '🪴',
  rug: '🟥', window: '🪟', fireplace: '🔥', fountain: '⛲', barrel: '🛢️', crate: '📦',
  lamp: '🏮', flower: '🌷', sign: '🪧', rock: '🪨', mushroom: '🍄', log: '🪵', anchor: '⚓', shell: '🐚',
}
const propImgState: Record<string, boolean> = {}
export function PropToken({ kind, emoji, size = 30 }: { kind: string; emoji?: string; size?: number }) {
  const [failed, setFailed] = useState(!!propImgState[kind])
  if (!failed) {
    return (
      <img
        className="prop-sprite"
        src={`${import.meta.env.BASE_URL}ui/prop_${kind}.png`}
        alt=""
        style={{ width: size, height: size, objectFit: 'contain' }}
        onError={() => {
          propImgState[kind] = true
          setFailed(true)
        }}
      />
    )
  }
  if (kind === 'fence') return <span className="prop-fence" style={{ width: size, height: size * 0.5 }} aria-hidden />
  return <span style={{ fontSize: size * 0.82, lineHeight: 1 }}>{emoji ?? PROP_EMOJI[kind] ?? '◽'}</span>
}

// タイトルロゴ。ui/logo.png があれば画像、無ければ文字。
export function TitleLogo() {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="title-logo">
        <h1>錬金幻獣録</h1>
        <h2>アルケミスト・オーダー</h2>
      </div>
    )
  }
  return (
    <img
      className="title-logo-img"
      src={`${import.meta.env.BASE_URL}ui/logo.png`}
      alt="錬金幻獣録 アルケミスト・オーダー"
      onError={() => setFailed(true)}
    />
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
