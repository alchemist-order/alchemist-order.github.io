import type { BattleConfig, GameState, OwnedMonster } from '../types'
import { makeCombatant } from '../engine/battleEngine'
import { systemRng } from '../engine/rng'
import {
  expReward,
  getParty,
  grantExp,
  hasFlag,
  makeOwned,
  species,
  today,
  withCaught,
  withFlag,
  withSeen,
} from './state'

export interface QuickBattleResult {
  won: boolean
  title: string
  lines: string[]
}

function activeOf(s: GameState): OwnedMonster | null {
  const party = getParty(s)
  return s.collection.find((o) => o.uid === s.activeUid && party.includes(o.uid)) ?? s.collection.find((o) => party.includes(o.uid)) ?? null
}

function pickWild(config: Extract<BattleConfig, { kind: 'wild' }>, level: number) {
  const rng = systemRng()
  const forced = config.forcedSpeciesId
  if (forced) return { id: forced, level: config.forcedLevel ?? level, talent: config.forcedTalent ?? 0 }
  const pool = config.pool?.length ? config.pool : ['ignif', 'aquab', 'cogrif']
  return { id: rng.pick(pool), level: rng.int(config.min ?? Math.max(2, level - 2), config.max ?? level + 1), talent: rng.int(0, 4) }
}

function score(o: OwnedMonster, enemyLevel: number): number {
  const c = makeCombatant(species(o.speciesId), o.level, o.talent ?? 0, o.heldItem, o.traitBoost ?? 0)
  const hpRatio = o.hp == null ? 1 : Math.max(0.15, o.hp / c.maxHp)
  return (c.maxHp * 0.45 + c.atk + c.def * 0.8 + c.spd * 0.55 + c.mag) * hpRatio + o.level * 5 - enemyLevel * 4
}

function addExpToActive(s: GameState, uid: string, amount: number, lines: string[]): GameState {
  let evolvedId: string | null = null
  const collection = s.collection.map((o) => {
    if (o.uid !== uid) return o
    const copy = { ...o }
    const before = copy.speciesId
    const msgs = grantExp(copy, amount)
    evolvedId = copy.speciesId !== before ? copy.speciesId : null
    lines.push(...msgs)
    return copy
  })
  let next = { ...s, collection }
  if (evolvedId) next = withCaught(withSeen(next, evolvedId), evolvedId)
  return next
}

export function resolveQuickBattle(state: GameState, config: BattleConfig): { state: GameState; result: QuickBattleResult } {
  const rng = systemRng()
  const active = activeOf(state)
  if (!active) return { state, result: { won: false, title: '探索失敗', lines: ['戦える幻獣がいない。拠点で体勢を立て直そう。'] } }

  if (config.kind === 'trainer') {
    const final = config.trainer.team[config.trainer.team.length - 1]
    const avgLv = Math.round(config.trainer.team.reduce((sum, m) => sum + m.level, 0) / Math.max(1, config.trainer.team.length))
    const chance = Math.max(0.12, Math.min(0.92, 0.48 + (score(active, avgLv) - avgLv * 10) / 260))
    const won = rng.chance(chance)
    const lines = [`勝率目安 ${Math.round(chance * 100)}%`, `${config.trainer.name}に挑んだ。`]
    if (!won) {
      const dmg = Math.max(1, Math.floor((active.hp ?? makeCombatant(species(active.speciesId), active.level, active.talent ?? 0, active.heldItem, active.traitBoost ?? 0).maxHp) * 0.45))
      return {
        state: { ...state, collection: state.collection.map((o) => (o.uid === active.uid ? { ...o, hp: Math.max(1, (o.hp ?? makeCombatant(species(o.speciesId), o.level, o.talent ?? 0, o.heldItem, o.traitBoost ?? 0).maxHp) - dmg) } : o)) },
        result: { won: false, title: '敗北', lines: [...lines, 'あと一歩及ばなかった。HPを消耗した。'] },
      }
    }
    const reward = expReward(final.level) * config.trainer.team.length
    let next = addExpToActive(state, active.uid, reward, lines)
    const prize = 150 + final.level * 12
    next = {
      ...next,
      wins: next.wins + 1,
      money: next.money + prize,
      badges: next.badges.includes(config.trainer.badge) ? next.badges : [...next.badges, config.trainer.badge],
      defeatedTrainers: next.defeatedTrainers.includes(config.trainer.id) ? next.defeatedTrainers : [...next.defeatedTrainers, config.trainer.id],
    }
    return { state: next, result: { won: true, title: '勝利', lines: [...lines, `${config.trainer.badge}を獲得。`, `${prize}ゲルを得た。`] } }
  }

  const wild = pickWild(config, active.level)
  const enemy = makeCombatant(species(wild.id), wild.level, wild.talent)
  let next = withSeen(state, wild.id)
  const chance = Math.max(0.08, Math.min(0.94, 0.55 + (score(active, wild.level) - (enemy.maxHp * 0.35 + enemy.atk + enemy.def * 0.8 + enemy.spd * 0.55 + enemy.mag)) / 240))
  const won = rng.chance(chance)
  const lines = [`${species(wild.id).name} Lv.${wild.level} と遭遇。`, `勝率目安 ${Math.round(chance * 100)}%`]
  if (!won) {
    next = { ...next, collection: next.collection.map((o) => (o.uid === active.uid ? { ...o, hp: Math.max(1, (o.hp ?? makeCombatant(species(o.speciesId), o.level, o.talent ?? 0, o.heldItem, o.traitBoost ?? 0).maxHp) - Math.max(1, Math.floor(enemy.atk * 0.7))) } : o)) }
    return { state: next, result: { won: false, title: '撤退', lines: [...lines, '押し切れず撤退した。HPを消耗した。'] } }
  }

  next = addExpToActive(next, active.uid, expReward(wild.level), lines)
  const prize = 10 + wild.level * 3
  next = { ...next, wins: next.wins + 1, flasks: next.flasks + 1, money: next.money + prize, daily: next.daily && next.daily.date === today() ? { ...next.daily, wild: next.daily.wild + 1 } : next.daily }
  if (config.nushiId) next = hasFlag(next, `nushi_${config.nushiId}`) ? next : withFlag(next, `nushi_${config.nushiId}`)

  const canCatch = next.flasks > 0 && !next.caught.includes(wild.id) && species(wild.id).role !== 'legendary'
  const catchBonus = Math.min(0.3, (next.items.catch_charm ?? 0) * 0.08)
  if (canCatch) {
    // フラスコは投げた(試みた)時点で消費する。手動戦闘(throwFlask)と経済を揃える —
    // 成功時のみ消費だとクイック決着の失敗が無料になり、手動戦闘より一方的に有利になってしまう。
    next = { ...next, flasks: next.flasks - 1 }
    if (rng.chance(0.34 + catchBonus)) {
      const owned = { ...makeOwned(wild.id, wild.level), talent: wild.talent }
      next = withCaught({ ...next, items: { ...next.items, catch_charm: Math.max(0, (next.items.catch_charm ?? 0) - 1) }, collection: [...next.collection, owned] }, wild.id)
      lines.push(`${species(wild.id).name}を捕獲した。`)
    } else {
      lines.push(`${species(wild.id).name}は フラスコから 逃げてしまった。`)
    }
  }
  return { state: next, result: { won: true, title: config.nushiId ? 'ヌシ撃破' : '勝利', lines: [...lines, `${prize}ゲルとフラスコ1個を得た。`] } }
}