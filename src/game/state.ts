// ゲーム状態の管理 — 種族データ参照・経験値/進化・捕獲・セーブ復元
import type { Combatant, GameState, MonsterData, Move, OwnedMonster, ResearchEntry } from '../types'
import monstersJson from '../../data/monsters.json'
import { makeCombatant } from '../engine/battleEngine'
import { systemRng, type Rng } from '../engine/rng'
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


export const RESEARCH_THRESHOLDS = [1, 3, 7, 15, 30]
export function researchLevel(entry?: ResearchEntry): number {
  if (!entry || entry.caught <= 0) return 0
  return RESEARCH_THRESHOLDS.reduce((lv, n) => entry.caught >= n ? lv + 1 : lv, 0)
}
export function researchCatchBonus(s: GameState, id: string): number {
  return researchLevel(s.research?.[id]) * 0.01
}
export function buildResearchFromCollection(collection: OwnedMonster[], existing?: Record<string, ResearchEntry>): Record<string, ResearchEntry> {
  const research: Record<string, ResearchEntry> = { ...(existing ?? {}) }
  for (const o of collection) {
    const cur = research[o.speciesId] ?? { caught: 0, bestTalent: 0, mutant: false }
    research[o.speciesId] = {
      caught: Math.max(cur.caught ?? 0, 1),
      bestTalent: Math.max(cur.bestTalent ?? 0, o.talent ?? 0),
      mutant: !!cur.mutant || !!o.mutant,
    }
  }
  return research
}
export function recordCapture(s: GameState, owned: OwnedMonster): GameState {
  const cur = s.research?.[owned.speciesId] ?? { caught: 0, bestTalent: 0, mutant: false }
  const nextEntry: ResearchEntry = {
    caught: cur.caught + 1,
    bestTalent: Math.max(cur.bestTalent ?? 0, owned.talent ?? 0),
    mutant: !!cur.mutant || !!owned.mutant,
  }
  return withCaught({ ...s, research: { ...(s.research ?? {}), [owned.speciesId]: nextEntry } }, owned.speciesId)
}
export function researchSummary(s: GameState, id: string): { entry?: ResearchEntry; level: number; next?: number; progressText: string } {
  const entry = s.research?.[id]
  const level = researchLevel(entry)
  const next = RESEARCH_THRESHOLDS[level]
  return { entry, level, next, progressText: next ? `${entry?.caught ?? 0}/${next}` : 'MAX' }
}

export function captureResearchHighlights(prev: ResearchEntry | undefined, next: ResearchEntry, owned: OwnedMonster): string[] {
  const highlights: string[] = []
  const prevCaught = prev?.caught ?? 0
  const prevTalent = prev?.bestTalent ?? 0
  const talent = owned.talent ?? 0
  if (prevCaught <= 0) highlights.push('NEW: first capture')
  if (talent > prevTalent) highlights.push(`Best talent ${prevTalent} -> ${talent}`)
  if (!!owned.mutant && !prev?.mutant) highlights.push('First mutant found')
  const prevLevel = researchLevel(prev)
  const nextLevel = researchLevel(next)
  if (nextLevel > prevLevel) highlights.push(`Research Lv ${prevLevel} -> ${nextLevel}`)
  return highlights
}

export const PARTY_MAX = 6 // 戦うパーティの上限。残りは預かりボックス

// ── 個体差・レア度 ──
// talent(0-10)=個体の質。全能力+4%/段。野生でロール、配合で上昇。
const sys = systemRng()
/** 野生個体の才能をロール。良個体(★★以上=talent6+)は約5%。塔ではシード付きrngを渡す */
export function rollTalent(rng: Rng = sys): number {
  const r = rng.next()
  if (r < 0.8) return rng.int(0, 2) // ノーマル 80%
  if (r < 0.95) return rng.int(3, 5) // ★ 上物 15%
  if (r < 0.99) return rng.int(6, 7) // ★★ レア 4%
  return rng.int(8, 10) // ★★★ 超レア 1%
}
/** 変異種(色違い)判定。1/100。強さとは無関係の見た目レア。塔ではシード付きrng */
export const MUTANT_RATE = 0.01
export function rollMutant(rng: Rng = sys): boolean {
  return rng.chance(MUTANT_RATE)
}
/** talent からレア度表示(なし=ノーマル)。 */
export function rarityOf(talent = 0): { stars: string; name: string; color: string } | null {
  if (talent >= 8) return { stars: '★★★', name: '超レア', color: '#e2c23b' }
  if (talent >= 6) return { stars: '★★', name: 'レア', color: '#c79be8' }
  if (talent >= 3) return { stars: '★', name: '上物', color: '#6fb3e2' }
  return null
}

// 記章の数から称号を導出(プロフィール表示用)
export function playerTitle(s: GameState): string {
  const n = s.badges.length
  return n >= 8 ? 'オーダー認定マスター' : n >= 5 ? '熟練の錬獣師' : n >= 3 ? '一人前の錬獣師' : n >= 1 ? '駆け出しの錬獣師' : '見習い錬獣師'
}

// 全8記章の並び順とアイコンslug(獲得記章一覧の8枠グリッド用)。
// badges は名前文字列で保存されるため name→slug をここで一元管理する。
// 現在実装は先頭3つ、残り5つは第4世界以降の予約(画像は先行納品済み・未取得はグレー表示)。
export const ALL_BADGES: { name: string; slug: string }[] = [
  { name: '新緑の記章', slug: 'verdant' },
  { name: '蒼潮の記章', slug: 'tide' },
  { name: '烈火の記章', slug: 'blaze' },
  { name: '迅雷の記章', slug: 'spark' },
  { name: '蒼嵐の記章', slug: 'gale' },
  { name: '聖光の記章', slug: 'astral' },
  { name: '玄冥の記章', slug: 'umbra' },
  { name: '錬鉄の記章', slug: 'forge' },
]

// パーティの uid 列を返す(旧セーブ移行: party未設定なら先頭PARTY_MAX体)。collectionに無いidは除外
export function getParty(s: GameState): string[] {
  const ids = new Set(s.collection.map((o) => o.uid))
  if (s.party && s.party.length) return s.party.filter((uid) => ids.has(uid))
  return s.collection.slice(0, PARTY_MAX).map((o) => o.uid)
}
// 預ける(パーティ→ボックス)。最後の1体は預けられない。リーダーを預けたら次の先頭へ
export function depositToBox(s: GameState, uid: string): GameState {
  const p = getParty(s)
  if (p.length <= 1 || !p.includes(uid)) return s
  const party = p.filter((x) => x !== uid)
  const activeUid = s.activeUid === uid ? party[0] : s.activeUid
  return { ...s, party, activeUid }
}
// 連れる(ボックス→パーティ)。満員なら不可
export function withdrawToParty(s: GameState, uid: string): GameState {
  const p = getParty(s)
  if (p.length >= PARTY_MAX || p.includes(uid) || !s.collection.some((o) => o.uid === uid)) return s
  return { ...s, party: [...p, uid] }
}
// 先頭(リーダー)にする＝パーティ先頭へ並べ替え＋activeUid更新
export function setLeader(s: GameState, uid: string): GameState {
  const p = getParty(s)
  if (!p.includes(uid)) return s
  return { ...s, party: [uid, ...p.filter((x) => x !== uid)], activeUid: uid }
}

export function newGame(): GameState {
  return {
    collection: [],
    party: [],
    seen: [],
    caught: [],
    research: {},
    activeUid: null,
    flasks: 0,
    wins: 0,
    pos: { mapId: 'home2f', x: 2, y: 1 }, // 自室のベッドで目覚める
    badges: [],
    defeatedTrainers: [],
    items: { heal: 0, heal2: 0, heal3: 0, exp_tome: 0, evo_dust: 0, trait_elixir: 0, catch_charm: 0, revive: 0 },
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
    merged.items = { heal: p.items?.heal ?? 0, heal2: p.items?.heal2 ?? 0, heal3: p.items?.heal3 ?? 0, exp_tome: p.items?.exp_tome ?? 0, evo_dust: p.items?.evo_dust ?? 0, trait_elixir: p.items?.trait_elixir ?? 0, catch_charm: p.items?.catch_charm ?? 0, revive: p.items?.revive ?? 0 }
    merged.money = p.money ?? 0
    merged.research = buildResearchFromCollection(merged.collection, p.research)
    merged.achievements = p.achievements ?? []
    merged.dexClaimed = p.dexClaimed ?? []
    merged.mats = { talentStone: p.mats?.talentStone ?? 0, slotCharm: p.mats?.slotCharm ?? 0 }
    // パーティ移行(旧セーブはparty無し→先頭PARTY_MAX体)。collectionに無いidは除外
    merged.party = getParty(merged)
    // リーダー(activeUid)は必ずパーティ内に
    if (merged.activeUid == null || !merged.party.includes(merged.activeUid)) merged.activeUid = merged.party[0] ?? null
    return merged
  } catch {
    return null
  }
}

// ── やりこみ(日課/実績/図鑑報酬) ──
export type Reward = { money?: number; flask?: number; heal?: number; heal2?: number; heal3?: number; exp_tome?: number; evo_dust?: number; trait_elixir?: number; catch_charm?: number; revive?: number }
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
    items: { ...s.items, heal: s.items.heal + (r.heal ?? 0), heal2: s.items.heal2 + (r.heal2 ?? 0), heal3: s.items.heal3 + (r.heal3 ?? 0), exp_tome: s.items.exp_tome + (r.exp_tome ?? 0), evo_dust: s.items.evo_dust + (r.evo_dust ?? 0), trait_elixir: s.items.trait_elixir + (r.trait_elixir ?? 0), catch_charm: s.items.catch_charm + (r.catch_charm ?? 0), revive: s.items.revive + (r.revive ?? 0) },
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
export const LEGEND_BY_TYPE: Record<string, string> = { 火: 'ignaros', 水: 'abystia', 風: 'tempestroc', 地: 'terrabehemoth', 聖: 'sol', 冥: 'luna' }
export const LEGEND_MOVE_NAME: Record<string, string> = { 火: '原初の業火', 水: '原初の大海', 風: '原初の嵐', 地: '原初の大地', 聖: '原初の聖光', 冥: '原初の闇' }

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

// ── セーブのバックアップ(書き出し/読み込み) ──
// 書き出し=現在のセーブをbase64コードに。読み込み=コード(またはJSON)を検証して復元。
export function exportSave(): string {
  const raw = localStorage.getItem(SAVE_KEY) ?? ''
  try {
    return btoa(unescape(encodeURIComponent(raw)))
  } catch {
    return raw
  }
}
export function importSave(code: string): GameState | null {
  try {
    const t = code.trim()
    const json = t.startsWith('{') ? t : decodeURIComponent(escape(atob(t)))
    const p = JSON.parse(json)
    if (!p || !Array.isArray(p.collection)) return null // 最低限の妥当性チェック
    localStorage.setItem(SAVE_KEY, JSON.stringify(p))
    return loadGame() // 既定値補完・移行を通す
  } catch {
    return null
  }
}

// ── 個体の売却・逃がす ──
// 売値: レベル＋レア度(才能)に応じる
export function sellPrice(o: OwnedMonster): number {
  return 20 + o.level * 8 + (o.talent ?? 0) * 30
}
// 逃がす(パーティ個体は不可。先にボックスへ)
export function releaseMon(s: GameState, uid: string): GameState {
  if (getParty(s).includes(uid)) return s
  return { ...s, collection: s.collection.filter((o) => o.uid !== uid) }
}
// 売る(逃がす＋売値を入手)
export function sellMon(s: GameState, uid: string): GameState {
  if (getParty(s).includes(uid)) return s
  const o = s.collection.find((x) => x.uid === uid)
  if (!o) return s
  return { ...s, money: s.money + sellPrice(o), collection: s.collection.filter((x) => x.uid !== uid) }
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
  const c = makeCombatant(species(o.speciesId), o.level, o.talent ?? 0, o.heldItem, o.traitBoost ?? 0)
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

// チュートリアル兼メインクエストの「現在の目標」を状態から導出。最初のステージ攻略で完了→null。
export function currentObjective(g: GameState): { icon: string; text: string } | null {
  if (g.defeatedTrainers.includes('gym_forest')) return null // 最初のステージ攻略=チュートリアル完了
  if (g.collection.length === 0) {
    // まだ相棒がいない → 起床〜相棒入手まで誘導
    if (g.pos.mapId === 'home2f') return { icon: '🚶', text: '階段(部屋の下側のマス)から 1階へ降りよう' }
    if (g.pos.mapId === 'home') {
      if (!hasFlag(g, 'mom_gift')) return { icon: '💬', text: 'おかあさんに話しかけて 傷薬を受け取ろう' }
      return { icon: '🚪', text: '玄関(下の扉)から 村へ出よう' }
    }
    if (g.pos.mapId === 'mentor_house') return { icon: '💬', text: '師ガレンに話しかけて 最初の相棒を選ぼう' }
    if (g.pos.mapId === 'rapis') return { icon: '🏠', text: '中央上の「師ガレンの家」へ。最初の相棒をもらおう' }
    return { icon: '🏠', text: '本拠地ラピス村へ戻り、師ガレンを訪ねよう' }
  }
  // 初錬成の導線(第2次品質スプリント): 2体以上そろい錬成未経験で村にいる時、
  // 署名機構=錬成の存在に気づかせる。森誘導より前に一度だけ(村滞在時のみ・強制ではない)。
  if (g.pos.mapId === 'rapis' && g.collection.length >= 2 && !hasFlag(g, 'fused_once')) {
    return { icon: '⚗️', text: '幻獣が2体に。師の家の錬成師ミルカに話しかけ「錬成」を試せる' }
  }
  // 相棒あり・最初のステージ未攻略 → 転送門〜森ボスへ誘導
  if (g.pos.mapId === 'forest') return { icon: '⚔️', text: '高草で仲間を増やし鍛え、最奥の守護者シルヴァに挑もう' }
  if (g.pos.mapId === 'rapis') return { icon: '🌀', text: '中央広場の転送門(🌀)に触れて「緑霧の森」へワープしよう' }
  return { icon: '🌀', text: '本拠地へ戻り、転送門から緑霧の森へ向かおう' }
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
      const max = makeCombatant(species(o.speciesId), o.level, o.talent ?? 0, o.heldItem, o.traitBoost ?? 0).maxHp
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
