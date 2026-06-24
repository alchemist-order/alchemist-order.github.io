// バトルエンジン — 純粋関数の集合。UI から分離してテスト可能に保つ。
import type { Combatant, Move, MonsterData, TypeChart } from '../types'
import typechartJson from '../../data/typechart.json'

const TC = typechartJson as unknown as TypeChart

/** 種族値とレベルから実ステータスを算出 (ポケモン風の簡易式) */
export function statAt(base: number, level: number, isHp = false): number {
  const core = Math.floor((2 * base * level) / 100)
  return isHp ? core + level + 10 : core + 5
}

/** MonsterData から指定レベルのバトル個体を生成。talentで全能力に+4%/段 */
export function makeCombatant(data: MonsterData, level: number, talent = 0): Combatant {
  const [hp, atk, def, spd, mag] = data.stats
  const m = 1 + Math.max(0, talent) * 0.04
  const maxHp = Math.round(statAt(hp, level, true) * m)
  return {
    data,
    level,
    talent,
    maxHp,
    hp: maxHp,
    atk: Math.round(statAt(atk, level) * m),
    def: Math.round(statAt(def, level) * m),
    spd: Math.round(statAt(spd, level) * m),
    mag: Math.round(statAt(mag, level) * m),
    status: null,
    statusTurns: 0,
  }
}

/** 攻撃タイプ → 防御側(複合可)への相性倍率 */
export function effectiveness(attackType: string, defenderTypes: string[]): number {
  const row = TC.chart[attackType] ?? {}
  let mult = 1
  for (const dt of defenderTypes) {
    if (row[dt] !== undefined) mult *= row[dt]
  }
  return mult
}

export interface DamageResult {
  damage: number
  eff: number // 相性倍率
  stab: boolean // タイプ一致
}

/** ダメージ計算 (状態異常の補正込み) */
export function calcDamage(
  attacker: Combatant,
  defender: Combatant,
  move: Move,
  rand: number = 0.85 + Math.random() * 0.15,
): DamageResult {
  if (move.category === 'status' || move.power <= 0) return { damage: 0, eff: 1, stab: false }
  let atkStat = move.category === 'phys' ? attacker.atk : attacker.mag
  // やけど: 物理攻撃が半減
  if (attacker.status === 'やけど' && move.category === 'phys') atkStat = Math.floor(atkStat / 2)
  const defStat = defender.def
  const stab = move.type === attacker.data.type || move.type === attacker.data.type2
  const defTypes = [defender.data.type, defender.data.type2].filter(Boolean) as string[]
  const eff = effectiveness(move.type, defTypes)

  const base = Math.floor(
    ((2 * attacker.level) / 5 + 2) * move.power * (atkStat / defStat) / 50 + 2,
  )
  let dmg = eff === 0 ? 0 : Math.max(1, Math.floor(base * (stab ? 1.5 : 1) * eff * rand))
  // 灰化: 与ダメージ減
  if (attacker.status === '灰化') dmg = Math.max(1, Math.floor(dmg * 0.85))
  return { damage: dmg, eff, stab }
}

/** 相性倍率を日本語メッセージに */
export function effMessage(eff: number): string {
  if (eff === 0) return '効果がないようだ……'
  if (eff >= 2) return 'こうかは ばつぐんだ！'
  if (eff > 1) return 'すこし効いている。'
  if (eff < 1) return 'こうかは いまひとつのようだ。'
  return ''
}

/** まひ時はすばやさ半減 */
export function effectiveSpeed(c: Combatant): number {
  return c.status === 'まひ' ? Math.max(1, Math.floor(c.spd / 2)) : c.spd
}

/** 行動前チェック(ねむり/こおり/まひ)。行動可否と状態変化後の値を返す */
export function preMoveCheck(c: Combatant): {
  act: boolean
  msg?: string
  status: Combatant['status']
  statusTurns: number
} {
  if (c.status === 'ねむり') {
    const t = c.statusTurns - 1
    if (t <= 0) return { act: true, msg: `${c.data.name}は 目を覚ました！`, status: null, statusTurns: 0 }
    return { act: false, msg: `${c.data.name}は ぐっすり 眠っている。`, status: 'ねむり', statusTurns: t }
  }
  if (c.status === 'こおり') {
    if (Math.random() < 0.25) return { act: true, msg: `${c.data.name}の こおりが とけた！`, status: null, statusTurns: 0 }
    return { act: false, msg: `${c.data.name}は こおって 動けない！`, status: 'こおり', statusTurns: c.statusTurns }
  }
  if (c.status === 'まひ' && Math.random() < 0.25) {
    return { act: false, msg: `${c.data.name}は からだが しびれて 動けない！`, status: 'まひ', statusTurns: c.statusTurns }
  }
  return { act: true, status: c.status, statusTurns: c.statusTurns }
}

/** ターン終了時の状態異常ダメージ(やけど/どく/灰化) */
export function endTurnStatus(c: Combatant): { dmg: number; msg?: string } {
  if (c.hp <= 0 || !c.status) return { dmg: 0 }
  if (c.status === 'やけど') return { dmg: Math.max(1, Math.floor(c.maxHp / 16)), msg: `${c.data.name}は やけどの ダメージ！` }
  if (c.status === 'どく') return { dmg: Math.max(1, Math.floor(c.maxHp / 16)), msg: `${c.data.name}は どくの ダメージ！` }
  if (c.status === '灰化') return { dmg: Math.max(1, Math.floor(c.maxHp / 12)), msg: `${c.data.name}は 灰化に 蝕まれている……` }
  return { dmg: 0 }
}

export type { Combatant, Move, MonsterData, TypeChart }
