// ゲーム状態の管理 — 種族データ参照・経験値/進化・捕獲・セーブ復元
import type { Combatant, GameState, MonsterData, OwnedMonster } from '../types'
import monstersJson from '../../data/monsters.json'
import { makeCombatant } from '../engine/battleEngine'
import { getMoveset } from './moves'

export const DEX = monstersJson.dex as unknown as MonsterData[]
export const STARTER_IDS = monstersJson.meta.starters as string[]
export const DEX_TOTAL = DEX.length

const speciesMap = new Map(DEX.map((d) => [d.id, d]))
export function species(id: string): MonsterData {
  const m = speciesMap.get(id)
  if (!m) throw new Error(`unknown species: ${id}`)
  return m
}

const SAVE_KEY = 'alchemist-order-save-v1'
const MAX_LEVEL = 100

export function newGame(): GameState {
  return {
    collection: [],
    seen: [],
    caught: [],
    activeUid: null,
    flasks: 0,
    wins: 0,
    pos: { mapId: 'home2f', x: 2, y: 1 }, // 自室のベッドで目覚める
    badges: [],
    defeatedTrainers: [],
    items: { heal: 0, heal2: 0 },
    money: 0,
    flags: [],
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<GameState>
    const base = newGame()
    const merged = { ...base, ...p } as GameState
    // ネストは既定値で補完(旧セーブ対応)
    merged.items = { heal: p.items?.heal ?? 0, heal2: p.items?.heal2 ?? 0 }
    merged.money = p.money ?? 0
    return merged
  } catch {
    return null
  }
}

export function saveGame(s: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s))
  } catch {
    /* ストレージ不可でも続行 */
  }
}

let uidSeq = 0
export function makeUid(): string {
  return `m${Date.now().toString(36)}_${(uidSeq++).toString(36)}`
}

export function makeOwned(speciesId: string, level: number): OwnedMonster {
  return { uid: makeUid(), speciesId, level, exp: 0 }
}

/** active個体をバトル用Combatantに変換(現在HPを反映) */
export function ownedToCombatant(o: OwnedMonster): Combatant {
  const c = makeCombatant(species(o.speciesId), o.level)
  if (typeof o.hp === 'number') c.hp = Math.max(0, Math.min(c.maxHp, o.hp))
  return c
}

// ── アイテム/フラグ/回復ヘルパ ──
export function hasFlag(s: GameState, f: string): boolean {
  return s.flags.includes(f)
}
export function withFlag(s: GameState, f: string): GameState {
  return s.flags.includes(f) ? s : { ...s, flags: [...s.flags, f] }
}
/** 手持ち全員のHPを満タンに(宿屋) */
export function healParty(s: GameState): GameState {
  return { ...s, collection: s.collection.map((o) => ({ ...o, hp: undefined })) }
}
/** 指定個体のHPを満タン基準のmaxHpに対して amount 回復し、新collectionを返す */
export function healOwned(s: GameState, uid: string, amount: number): GameState {
  return {
    ...s,
    collection: s.collection.map((o) => {
      if (o.uid !== uid) return o
      const max = makeCombatant(species(o.speciesId), o.level).maxHp
      const cur = typeof o.hp === 'number' ? o.hp : max
      return { ...o, hp: Math.min(max, cur + amount) }
    }),
  }
}

// ── 経験値 ──
export function expToNext(level: number): number {
  return 12 + level * 8
}
export function expReward(enemyLevel: number): number {
  return 18 + enemyLevel * 6
}

/**
 * 経験値を付与。レベルアップ・進化を処理し、ログ用メッセージを返す。
 * owned は破壊的に更新する(呼び出し側で複製済みのものを渡すこと)。
 */
export function grantExp(owned: OwnedMonster, amount: number): string[] {
  const msgs: string[] = []
  const beforeMoves = getMoveset(species(owned.speciesId), owned.level).map((m) => m.id)
  owned.exp += amount
  while (owned.level < MAX_LEVEL && owned.exp >= expToNext(owned.level)) {
    owned.exp -= expToNext(owned.level)
    owned.level++
    msgs.push(`${species(owned.speciesId).name}は レベル${owned.level}に あがった！`)
    const sp = species(owned.speciesId)
    if (sp.to && sp.at !== null && owned.level >= sp.at) {
      const beforeName = sp.name
      owned.speciesId = sp.to
      msgs.push(`おや……？ ${beforeName}の ようすが……！`)
      msgs.push(`${beforeName}は ${species(sp.to).name}に しんかした！`)
    }
  }
  // 新しく覚えた技の通知
  const afterMoves = getMoveset(species(owned.speciesId), owned.level)
  for (const mv of afterMoves) {
    if (!beforeMoves.includes(mv.id)) {
      msgs.push(`${species(owned.speciesId).name}は 技【${mv.name}】を おぼえた！`)
    }
  }
  return msgs
}

// ── 捕獲 ──
export function catchChance(enemy: Combatant): number {
  const hpFactor = 1 - enemy.hp / enemy.maxHp // 瀕死ほど高い
  let rate = 0.25 + hpFactor * 0.6 // 0.25〜0.85
  if (species(enemy.data.id).role === 'legendary') rate *= 0.35
  return Math.min(0.95, Math.max(0.05, rate))
}

// ── 配列ヘルパ(seen/caught) ──
export function withSeen(s: GameState, id: string): GameState {
  return s.seen.includes(id) ? s : { ...s, seen: [...s.seen, id] }
}
export function withCaught(s: GameState, id: string): GameState {
  return s.caught.includes(id) ? s : { ...s, caught: [...s.caught, id] }
}
