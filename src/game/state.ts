// ゲーム状態の管理 — 種族データ参照・経験値/進化・捕獲・セーブ復元
import type { Combatant, GameState, MonsterData, Move, OwnedMonster } from '../types'
import monstersJson from '../../data/monsters.json'
import { makeCombatant } from '../engine/battleEngine'
import { getMoveset, signatureMove } from './moves'

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
    mats: { talentStone: 0, slotCharm: 0 },
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
    merged.achievements = p.achievements ?? []
    merged.dexClaimed = p.dexClaimed ?? []
    merged.mats = { talentStone: p.mats?.talentStone ?? 0, slotCharm: p.mats?.slotCharm ?? 0 }
    return merged
  } catch {
    return null
  }
}

// ── やりこみ(日課/実績/図鑑報酬) ──
export type Reward = { money?: number; flask?: number; heal?: number; heal2?: number }
export const DAILY_GOAL = 3 // デイリー: 野生討伐数
export const DAILY_REWARD: { money: number; flask: number } = { money: 150, flask: 2 }

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function today(): string {
  return dateStr(new Date())
}
function yesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return dateStr(d)
}

export function grantReward(s: GameState, r: Reward): GameState {
  return {
    ...s,
    money: s.money + (r.money ?? 0),
    flasks: s.flasks + (r.flask ?? 0),
    items: { heal: s.items.heal + (r.heal ?? 0), heal2: s.items.heal2 + (r.heal2 ?? 0) },
  }
}

/** ログイン処理。日付が変わっていればボーナス付与＋デイリーをリセット。reward!=nullなら新規ログイン */
export function applyDailyLogin(s: GameState): { state: GameState; reward: { money: number; flask: number; streak: number } | null } {
  const t = today()
  if (s.lastLogin === t) {
    const daily = s.daily && s.daily.date === t ? s.daily : { date: t, wild: 0, claimed: false }
    return { state: { ...s, daily }, reward: null }
  }
  const streak = s.lastLogin === yesterdayStr() ? (s.loginStreak ?? 0) + 1 : 1
  const money = 100 + Math.min(streak, 7) * 20
  const flask = 1
  const ns: GameState = {
    ...grantReward(s, { money, flask }),
    lastLogin: t,
    loginStreak: streak,
    daily: { date: t, wild: 0, claimed: false },
  }
  return { state: ns, reward: { money, flask, streak } }
}

export interface Achievement {
  id: string
  name: string
  desc: string
  reward: Reward
  check: (s: GameState) => boolean
}
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_win', name: 'はじめての勝利', desc: 'バトルに 1回 勝つ', reward: { money: 100 }, check: (s) => s.wins >= 1 },
  { id: 'catch_5', name: 'コレクター見習い', desc: '5体 つかまえる', reward: { flask: 3 }, check: (s) => s.caught.length >= 5 },
  { id: 'catch_15', name: 'コレクター', desc: '15体 つかまえる', reward: { money: 300 }, check: (s) => s.caught.length >= 15 },
  { id: 'badge_1', name: '最初の記章', desc: '記章を 1つ 得る', reward: { heal2: 2 }, check: (s) => s.badges.length >= 1 },
  { id: 'rich', name: '小金持ち', desc: '所持金 1000ゲル', reward: { money: 200 }, check: (s) => s.money >= 1000 },
  { id: 'wins_20', name: '歴戦の錬獣師', desc: '20回 勝つ', reward: { money: 500 }, check: (s) => s.wins >= 20 },
  { id: 'party_3', name: 'にぎやかな旅', desc: '手持ちを 3体にする', reward: { heal: 3 }, check: (s) => s.collection.length >= 3 },
]
/** 達成済みだが未受取の実績 */
export function pendingAchievements(s: GameState): Achievement[] {
  const got = s.achievements ?? []
  return ACHIEVEMENTS.filter((a) => a.check(s) && !got.includes(a.id))
}

export const DEX_MILESTONES: { n: number; reward: Reward }[] = [
  { n: 10, reward: { money: 200 } },
  { n: 25, reward: { flask: 5 } },
  { n: 50, reward: { money: 1000 } },
  { n: 100, reward: { heal2: 10 } },
]
export function pendingDexMilestones(s: GameState): { n: number; reward: Reward }[] {
  const claimed = s.dexClaimed ?? []
  return DEX_MILESTONES.filter((m) => s.caught.length >= m.n && !claimed.includes(m.n))
}

// ── 錬成(融合) ──
export const FUSION_COST = 300 // 錬成の費用(ゲル)
export const TALENT_MAX = 10
export const MAX_INHERITED = 2 // 遺伝技の保持上限(継承の符で+1)

// 隠し配合: 特定の2種(順不同)で伝説種＋専用技。発見要素
const rmove = (key: string, name: string, type: string, power: number): Move => ({
  id: `rare_${key}`,
  name,
  type,
  category: 'spec',
  power,
  acc: 0.95,
  desc: '隠し配合でのみ得られる専用技。',
})
export interface Recipe {
  base: string
  material: string
  result: string
  move: Move
}
export const RECIPES: Recipe[] = [
  { base: 'volcadon', material: 'ignisleo', result: 'ignaros', move: rmove('ignaros', '原初の業火', '火', 110) },
  { base: 'leviaran', material: 'krakent', result: 'abystia', move: rmove('abystia', '原初の大海', '水', 110) },
  { base: 'grandroc', material: 'tempesta', result: 'tempestroc', move: rmove('tempestroc', '原初の嵐', '風', 110) },
  { base: 'archange', material: 'undine', result: 'sol', move: rmove('sol', '太陽神光', '聖', 115) },
  { base: 'nightmare', material: 'lich', result: 'luna', move: rmove('luna', '月幻の蝕', '冥', 115) },
  { base: 'mysticchimera', material: 'archange', result: 'celestialchimera', move: rmove('chimera', '天翔ける黄金光', '聖', 120) },
]
export function findRecipe(aId: string, bId: string): Recipe | undefined {
  return RECIPES.find((r) => (r.base === aId && r.material === bId) || (r.base === bId && r.material === aId))
}

// 汎用レア配合: 同タイプの最終形(stage3)を2体錬成すると、そのタイプの伝説種が生まれる
const LEGEND_BY_TYPE: Record<string, string> = { 火: 'ignaros', 水: 'abystia', 風: 'tempestroc', 地: 'terrabehemoth', 聖: 'sol', 冥: 'luna' }
const LEGEND_MOVE_NAME: Record<string, string> = { 火: '原初の業火', 水: '原初の大海', 風: '原初の嵐', 地: '原初の大地', 聖: '原初の聖光', 冥: '原初の闇' }

/** 錬成結果。隠し配合なら伝説種＋専用技。stone=才能+1追加, charm=遺伝枠+1 */
export function fuseResult(
  a: OwnedMonster,
  b: OwnedMonster,
  opts?: { stone?: boolean; charm?: boolean },
): { speciesId: string; level: number; talent: number; evolved: boolean; inherited: Move[]; rare: boolean } {
  const spA = species(a.speciesId)
  const spB = species(b.speciesId)
  const explicit = findRecipe(a.speciesId, b.speciesId)
  let rareResult: string | null = null
  let rareMove: Move | null = null
  if (explicit) {
    rareResult = explicit.result
    rareMove = explicit.move
  } else if (spA.stage === 3 && spB.stage === 3 && spA.type === spB.type && LEGEND_BY_TYPE[spA.type]) {
    rareResult = LEGEND_BY_TYPE[spA.type]
    rareMove = rmove(`leg_${spA.type}`, LEGEND_MOVE_NAME[spA.type], spA.type, 110)
  }
  const evolvedId = rareResult ?? (spA.to && DEX.some((d) => d.id === spA.to) ? (spA.to as string) : a.speciesId)
  const level = Math.max(5, Math.min(60, Math.round((a.level + b.level) / 2) + 3))
  const talent = Math.min(TALENT_MAX, Math.max(a.talent ?? 0, b.talent ?? 0) + 1 + (opts?.stone ? 1 : 0))
  const cap = MAX_INHERITED + (opts?.charm ? 1 : 0)
  const resultNatural = getMoveset(species(evolvedId), level)
  const inherited: Move[] = []
  if (rareMove) inherited.push(rareMove) // 専用技は必ず先頭で確保
  const pool = [signatureMove(species(b.speciesId)), ...(a.inheritedMoves ?? []), ...(b.inheritedMoves ?? [])]
  for (const mv of pool) {
    if (inherited.length >= cap) break
    if (inherited.some((m) => m.id === mv.id)) continue
    if (resultNatural.some((m) => m.id === mv.id)) continue
    inherited.push(mv)
  }
  return { speciesId: evolvedId, level, talent, evolved: evolvedId !== a.speciesId, inherited, rare: !!rareResult }
}

/** 所有個体の実際の技セット(習得技＋遺伝技、id重複除く) */
export function ownedMoveset(o: OwnedMonster): Move[] {
  const natural = getMoveset(species(o.speciesId), o.level)
  const extra = (o.inheritedMoves ?? []).filter((m) => !natural.some((n) => n.id === m.id))
  return [...natural, ...extra]
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
  const c = makeCombatant(species(o.speciesId), o.level, o.talent ?? 0)
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
