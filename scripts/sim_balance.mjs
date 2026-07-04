// バランスシミュレーション(SPEC_BATTLE_DEPTH.md §8)。
// engineの純関数(battleEngine.ts)のみを使い、UIには一切触れないヘッドレスバトルで
// 「連打AI vs 積みAI vs ガードAI」総当たり、タイプ全組合せの勝率行列、
// 守護者(森)の初見勝率を測定する。
//
// 実行: npx tsx scripts/sim_balance.mjs
import { readFileSync } from 'node:fs'
import {
  stageMult, calcDamage, effectiveness, effectiveSpeed,
  preMoveCheck, endTurnStatus, makeCombatant,
} from '../src/engine/battleEngine.ts'
import { getMoveset, moveById } from '../src/game/moves.ts'
import { heldItemOf } from '../src/game/abilities.ts'
import { TRAINERS } from '../src/game/maps.ts'

const TYPES = ['火', '水', '風', '地', '雷', '毒', '聖', '冥', '錬成']
const N_TYPE_MATRIX = 1000 // §8指定
const N_STACK_VS_SPAM = 2000
const N_BOSS = 1000
const MAX_TURNS = 40 // 決着しない場合は引き分け扱い

// ─────────────────────────── 共通ユーティリティ ───────────────────────────
function clampStage(v) { return Math.max(-3, Math.min(3, v)) }
function applyBuff(target, stat, delta) { target.stages[stat] = clampStage(target.stages[stat] + delta) }
function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)) }
function foeTypesOf(c) { return [c.data.type, c.data.type2].filter(Boolean) }

/** AIの意思決定用: 期待値(命中×相性×威力、連続技は平均回数込み) */
function expectedValue(attacker, defender, move) {
  if (move.power <= 0) return -1
  const eff = effectiveness(move.type, foeTypesOf(defender))
  if (eff === 0) return 0
  const hits = move.multi ? (move.multi[0] + move.multi[1]) / 2 : 1
  const bonus = move.bonusVsStatus && defender.status ? move.bonusVsStatus : 1
  return move.acc * eff * move.power * hits * bonus
}

function bestAttack(self, moves, foe) {
  const attacks = moves.filter((m) => m.power > 0 && !(m.charge && self.hp < self.maxHp * 0.5))
  if (attacks.length === 0) return moves[0]
  let best = attacks[0]
  let bestV = expectedValue(self, foe, best)
  for (const m of attacks.slice(1)) {
    const v = expectedValue(self, foe, m)
    if (v > bestV) { best = m; bestV = v }
  }
  return best
}

// ─────────────────────────── 3種のAI(§8「連打/積み/ガード」) ───────────────────────────
function spamAI(self, moves, foe) {
  return bestAttack(self, moves, foe)
}
function stackAI(self, moves, foe) {
  const buffMove = moves.find((m) => m.buffs?.some((b) => b.target === 'self' && self.stages[b.stat] < 2))
  if (buffMove && self.hp > self.maxHp * 0.5) return buffMove
  return bestAttack(self, moves, foe)
}
function guardAI(self, moves, foe) {
  const guardMove = moves.find((m) => m.guard)
  if (guardMove && self.hp < self.maxHp * 0.4 && self.lastMoveId !== guardMove.id) return guardMove
  return bestAttack(self, moves, foe)
}
const AI = { spam: spamAI, stack: stackAI, guard: guardAI }

// ─────────────────────────── ターン実行(doMoveの正準シーケンスを純関数で再現) ───────────────────────────
function pinchHealCheck(c) {
  if (c.berryUsed || c.hp <= 0) return
  const item = heldItemOf(c.heldItem)
  if (item?.pinchHeal && c.hp <= c.maxHp * 0.25) {
    c.hp = Math.min(c.maxHp, c.hp + Math.round(c.maxHp * item.pinchHeal))
    c.berryUsed = true
  }
}

/** 1体の行動を解決。ダメージ量(参考値)を返す。 */
function doMove(actor, defender, move) {
  actor.guarding = false
  actor.lastMoveId = move.id

  if (move.charge) {
    if (actor.charging !== move.id) { actor.charging = move.id; return 0 }
    actor.charging = undefined
  }
  if (move.guard) actor.guarding = true
  if (move.resetStages) defender.stages = { atk: 0, def: 0, spd: 0, mag: 0 }
  if (move.heal) {
    actor.hp = Math.min(actor.maxHp, actor.hp + Math.round(actor.maxHp * move.heal))
    if (move.cures) { actor.status = null; actor.statusTurns = 0 }
  }

  let totalDmg = 0
  if (move.power > 0) {
    if (Math.random() < move.acc) {
      const hits = move.multi ? randInt(move.multi[0], move.multi[1]) : 1
      for (let i = 0; i < hits && defender.hp > 0; i++) {
        const wasFull = defender.hp === defender.maxHp
        const dr = calcDamage(actor, defender, move)
        const lethal = dr.damage >= defender.hp
        if (defender.ability === 'sturdy' && wasFull && lethal) defender.hp = 1
        else defender.hp = Math.max(0, defender.hp - dr.damage)
        totalDmg += dr.damage
        pinchHealCheck(defender)
      }
      if (move.drain) actor.hp = Math.min(actor.maxHp, actor.hp + Math.max(1, Math.round(totalDmg * move.drain)))
      if (move.recoil) actor.hp = Math.max(0, actor.hp - Math.max(1, Math.round(totalDmg * move.recoil)))
      pinchHealCheck(actor)
      if (move.inflict && defender.hp > 0 && !defender.status && Math.random() < move.inflict.chance) {
        defender.status = move.inflict.status
        defender.statusTurns = move.inflict.status === 'ねむり' ? 2 : 0
      }
    }
  }
  if (move.buffs) {
    for (const b of move.buffs) applyBuff(b.target === 'self' ? actor : defender, b.stat, b.delta)
  }
  return totalDmg
}

/** 行動前チェック→doMove。行動できなければ何もしない。 */
function act(actor, defender, move) {
  const pre = preMoveCheck(actor)
  actor.status = pre.status
  actor.statusTurns = pre.statusTurns
  if (!pre.act) return
  doMove(actor, defender, move)
}

function endOfTurn(c) {
  if (c.hp <= 0) return
  if (c.ability === 'regen') c.hp = Math.min(c.maxHp, c.hp + Math.max(1, Math.round(c.maxHp / 16)))
  const r = endTurnStatus(c)
  if (r.dmg) c.hp = Math.max(0, c.hp - r.dmg)
}

/**
 * 1体 vs 1体のバトルを1回実行。
 * pickP/pickE: (self, moves, foe, ctx) => Move
 */
function runSingleBattle(p, pMoves, pickP, e, eMoves, pickE) {
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const pMove = p.charging ? pMoves.find((m) => m.id === p.charging) ?? pMoves[0] : pickP(p, pMoves, e)
    const eMove = e.charging ? eMoves.find((m) => m.id === e.charging) ?? eMoves[0] : pickE(e, eMoves, p)
    const pPri = pMove.priority ?? 0
    const ePri = eMove.priority ?? 0
    const pFirst = pPri !== ePri ? pPri > ePri : effectiveSpeed(p) >= effectiveSpeed(e)
    const order = pFirst ? [[p, e, pMove], [e, p, eMove]] : [[e, p, eMove], [p, e, pMove]]
    for (const [actor, defender, move] of order) {
      if (actor.hp <= 0 || defender.hp <= 0) continue
      act(actor, defender, move)
      if (defender.hp <= 0 || actor.hp <= 0) break
    }
    if (p.hp <= 0 || e.hp <= 0) return { winner: p.hp > 0 ? 'p' : e.hp > 0 ? 'e' : 'draw', turns: turn }
    endOfTurn(p)
    endOfTurn(e)
    if (p.hp <= 0 || e.hp <= 0) return { winner: p.hp > 0 ? 'p' : e.hp > 0 ? 'e' : 'draw', turns: turn }
  }
  return { winner: 'draw', turns: MAX_TURNS }
}

/**
 * 先手同速時「p優先」tie-break(実装に忠実、App/Battle.tsxと同一ルール)による
 * 先手バイアスを打ち消すため、n回のうち半分はA視点=p、残り半分はB視点=pで実行し平均する。
 * 同速の同ステータス同士(タイプ行列・stack-vs-spam)を公平比較するのに必須。
 */
function fairDuel(specA, aiA, specB, aiB, n) {
  let winsA = 0, draws = 0, turnSum = 0
  const half = Math.floor(n / 2)
  for (let i = 0; i < n; i++) {
    const aAsP = i < half
    const a = specA()
    const b = specB()
    const res = aAsP
      ? runSingleBattle(a.c, a.moves, aiA, b.c, b.moves, aiB)
      : runSingleBattle(b.c, b.moves, aiB, a.c, a.moves, aiA)
    const winnerIsA = aAsP ? res.winner === 'p' : res.winner === 'e'
    if (res.winner === 'draw') draws++
    else if (winnerIsA) winsA++
    turnSum += res.turns
  }
  return { winRateA: winsA / n, drawRate: draws / n, avgTurns: turnSum / n }
}

// ─────────────────────────── ダミー種族(タイプ単体・種族値差を排除して検証) ───────────────────────────
function dummySpecies(type) {
  return {
    dex: 0, id: `dummy_${type}`, name: `${type}のダミー`, type, type2: undefined,
    stage: 1, from: null, to: null, at: null,
    stats: [60, 60, 60, 60, 60], sig: `${type}の必殺技`, dex_text: '',
  }
}
const DUMMY_LEVEL = 25 // rush/aura/blast/sig の4枠が出揃うレベル

function freshDummy(type) {
  const sp = dummySpecies(type)
  return { c: makeCombatant(sp, DUMMY_LEVEL, 0), moves: getMoveset(sp, DUMMY_LEVEL) }
}

// ═══════════════════════════ 1) タイプ全組合せ×3AI総当たり ═══════════════════════════
function runTypeMatrix() {
  const aiNames = ['spam', 'stack', 'guard']
  const results = [] // {atkType, defType, aiA, aiB, winRateA, avgTurns}
  for (const aiA of aiNames) {
    for (const aiB of aiNames) {
      for (const ta of TYPES) {
        for (const tb of TYPES) {
          const r = fairDuel(() => freshDummy(ta), AI[aiA], () => freshDummy(tb), AI[aiB], N_TYPE_MATRIX)
          results.push({ aiA, aiB, ta, tb, ...r })
        }
      }
    }
  }
  return results
}

// ═══════════════════════════ 2) 決着ターン数(同タイプ・spam vs spam) ═══════════════════════════
function mirrorDecisionTurns() {
  let turnSum = 0, n = 0, draws = 0
  for (const t of TYPES) {
    for (let i = 0; i < N_TYPE_MATRIX; i++) {
      const a = freshDummy(t)
      const b = freshDummy(t)
      const res = runSingleBattle(a.c, a.moves, spamAI, b.c, b.moves, spamAI)
      if (res.winner === 'draw') { draws++; continue }
      turnSum += res.turns; n++
    }
  }
  return { avgTurns: turnSum / n, n, draws }
}

// ═══════════════════════════ 3) 積みAI vs 連打AI(同タイプ、ランク/技タグ由来の優位を単離) ═══════════════════════════
function stackVsSpam() {
  const perType = []
  let winsStack = 0, total = 0, longFightWinsStack = 0, longFightTotal = 0
  for (const t of TYPES) {
    let w = 0
    const half = Math.floor(N_STACK_VS_SPAM / 2)
    for (let i = 0; i < N_STACK_VS_SPAM; i++) {
      const stackAsP = i < half
      const a = freshDummy(t)
      const b = freshDummy(t)
      const res = stackAsP
        ? runSingleBattle(a.c, a.moves, stackAI, b.c, b.moves, spamAI)
        : runSingleBattle(a.c, a.moves, spamAI, b.c, b.moves, stackAI)
      const stackWon = stackAsP ? res.winner === 'p' : res.winner === 'e'
      if (stackWon) { w++; winsStack++ }
      total++
      if (res.turns >= 3) {
        longFightTotal++
        if (stackWon) longFightWinsStack++
      }
    }
    perType.push({ type: t, stackWinRate: w / N_STACK_VS_SPAM })
  }
  return {
    perType,
    overallStackWinRate: winsStack / total,
    longFight3plus: { winRateStack: longFightWinsStack / longFightTotal, n: longFightTotal },
  }
}

// ═══════════════════════════ 4) 森の守護者シルヴァ 初見勝率(推奨Lv12・道具2個) ═══════════════════════════
const monstersJson = JSON.parse(readFileSync(new URL('../data/monsters.json', import.meta.url), 'utf8'))
function species(id) {
  const sp = monstersJson.dex.find((m) => m.id === id)
  if (!sp) throw new Error(`species not found: ${id}`)
  return sp
}

function buildTeamFromTrainerEntry(entry) {
  const sp = species(entry.speciesId)
  const c = makeCombatant(sp, entry.level, entry.talent ?? 0, entry.heldItem)
  const moves = entry.moves ? entry.moves.map((id) => moveById(id, sp)).filter(Boolean) : getMoveset(sp, entry.level)
  return { c, moves }
}

// プレイヤー個体の進化を反映: baseからlevelに応じて進化形を辿る(御三家はLv16でstage2化)。
// これを省くとLv18編成が「進化前のstage1をLv18で」使う非現実的な弱さになり勝率が過小評価される。
function resolveEvolved(baseId, level) {
  let sp = species(baseId)
  while (sp.to && sp.at != null && level >= sp.at) sp = species(sp.to)
  return sp.id
}

// maps.ts の実データを直接使用(重複定義してドリフトするのを防ぐ)
const PLAYER_ITEM_HEAL_FRAC = 0.4 // 上傷薬相当
const PLAYER_ITEM_COUNT = 2 // §8「道具2個持込」

function bossChooseMove(self, moves, foe, isAceOpening) {
  const selfBuff = moves.find((m) => m.buffs?.some((b) => b.target === 'self' && self.stages[b.stat] < 2))
  const guardMove = moves.find((m) => m.guard)
  const foeDebuff = moves.find((m) => m.buffs?.some((b) => b.target === 'foe' && foe.stages[b.stat] > -2))
  const resetMove = moves.find((m) => m.resetStages)
  if (isAceOpening && (selfBuff || guardMove)) return selfBuff ?? guardMove
  const foeStageSum = foe.stages.atk + foe.stages.def + foe.stages.spd + foe.stages.mag
  if (resetMove && foeStageSum >= 3) return resetMove
  if (selfBuff && self.hp > self.maxHp * 0.7 && Math.random() < 0.4) return selfBuff
  if (guardMove && self.hp < self.maxHp * 0.4 && self.lastMoveId !== guardMove.id && Math.random() < 0.3) return guardMove
  const foeAhead = foe.stages.atk > 0 || foe.stages.mag > 0 || effectiveSpeed(foe) > effectiveSpeed(self)
  if (foeDebuff && foeAhead && Math.random() < 0.3) return foeDebuff
  return bestAttack(self, moves, foe)
}

/** 1回のジム戦(3vs3、party switching込み)。プレイヤーの勝敗を返す。
 *  cfg = { teamData, playerIds, playerLevel } */
function runGymBattle(cfg) {
  const bossTeam = cfg.teamData.map(buildTeamFromTrainerEntry)
  const playerTeam = cfg.playerIds.map((id) => {
    const sp = species(resolveEvolved(id, cfg.playerLevel)) // Lvに応じて進化形を使う
    return { c: makeCombatant(sp, cfg.playerLevel, 0), moves: getMoveset(sp, cfg.playerLevel) }
  })
  let bIdx = 0, pIdx = 0
  let itemsLeft = PLAYER_ITEM_COUNT
  let bossAceJustEntered = bIdx === bossTeam.length - 1

  for (let turn = 1; turn <= MAX_TURNS * 3; turn++) {
    const p = playerTeam[pIdx].c
    const b = bossTeam[bIdx].c

    // プレイヤー: HP30%未満・道具残ありなら回復、それ以外は最善攻撃
    let pMove = null
    let pUsesItem = false
    if (p.charging) {
      pMove = playerTeam[pIdx].moves.find((m) => m.id === p.charging) ?? playerTeam[pIdx].moves[0]
    } else if (p.hp < p.maxHp * 0.3 && itemsLeft > 0) {
      pUsesItem = true
    } else {
      pMove = spamAI(p, playerTeam[pIdx].moves, b)
    }
    const bMove = b.charging
      ? bossTeam[bIdx].moves.find((m) => m.id === b.charging) ?? bossTeam[bIdx].moves[0]
      : bossChooseMove(b, bossTeam[bIdx].moves, p, bossAceJustEntered)
    bossAceJustEntered = false

    if (pUsesItem) {
      p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * PLAYER_ITEM_HEAL_FRAC))
      itemsLeft--
      act(b, p, bMove) // 道具はターン消費、敵はそのまま行動
    } else {
      const pPri = pMove.priority ?? 0
      const ePri = bMove.priority ?? 0
      const pFirst = pPri !== ePri ? pPri > ePri : effectiveSpeed(p) >= effectiveSpeed(b)
      const order = pFirst ? [[p, b, pMove], [b, p, bMove]] : [[b, p, bMove], [p, b, pMove]]
      for (const [actor, defender, move] of order) {
        if (actor.hp <= 0 || defender.hp <= 0) continue
        act(actor, defender, move)
      }
    }
    endOfTurn(p)
    endOfTurn(b)

    if (b.hp <= 0) {
      bIdx++
      if (bIdx >= bossTeam.length) return { win: true, turns: turn }
      bossAceJustEntered = bIdx === bossTeam.length - 1
    }
    if (p.hp <= 0) {
      pIdx++
      if (pIdx >= playerTeam.length) return { win: false, turns: turn }
    }
  }
  return { win: false, turns: MAX_TURNS * 3, timeout: true }
}

function runGymSim(cfg) {
  let wins = 0
  for (let i = 0; i < N_BOSS; i++) {
    const r = runGymBattle(cfg)
    if (r.win) wins++
  }
  return wins / N_BOSS
}

// ═══════════════════════════ 実行 & レポート ═══════════════════════════
function fmtPct(x) { return `${(x * 100).toFixed(1)}%` }

console.log('=== SPEC_BATTLE_DEPTH.md §8 バランスシミュレーション ===\n')

console.log('[1] 決着ターン数(同タイプミラー・連打AI vs 連打AI, 目標4〜6T)')
const mirror = mirrorDecisionTurns()
console.log(`  平均決着ターン: ${mirror.avgTurns.toFixed(2)} (n=${mirror.n}, 引き分け=${mirror.draws})`)
console.log(`  判定: ${mirror.avgTurns >= 4 && mirror.avgTurns <= 6 ? 'OK(目標域内)' : mirror.avgTurns < 4 ? 'NG: 速すぎる(火力/会心を下げる or HP係数を上げる)' : 'NG: 長すぎる(HP係数を下げる or 威力を上げる)'}\n`)

console.log('[2] 積みAI vs 連打AI(同タイプ、目標: 積みが優位)')
const svs = stackVsSpam()
console.log(`  全体: 積みAI勝率 ${fmtPct(svs.overallStackWinRate)}`)
console.log(`  3ターン以上長引いた試合限定: 積みAI勝率 ${fmtPct(svs.longFight3plus.winRateStack)} (n=${svs.longFight3plus.n})`)
for (const r of svs.perType) console.log(`    ${r.type}: ${fmtPct(r.stackWinRate)}`)
console.log(`  判定: ${svs.longFight3plus.winRateStack > 0.5 ? 'OK(長期戦で積みが連打に勝る)' : 'NG: aura倍率(+2→検討)を強化 or guard/recoilノブ調整'}\n`)

function bossVerdict(rate) {
  return rate >= 0.5 && rate <= 0.6 ? 'OK(目標50-60%域内)' : rate > 0.6 ? `NG: 簡単すぎる(${fmtPct(rate)}。ボスtalent↑/guard係数↑/aura強化)` : `NG: 難しすぎる(${fmtPct(rate)}。ボスtalent↓/Lv↓/もちもの外し)`
}
console.log('[3] 守護者 初見勝率(御三家編成・上傷薬×2持込, 目標50-60%)')
const silvaRate = runGymSim({ teamData: TRAINERS.gym_forest.team, playerIds: ['ignif', 'aquab', 'cogrif'], playerLevel: 12 })
console.log(`  森シルヴァ(Lv12): ${fmtPct(silvaRate)} — ${bossVerdict(silvaRate)}`)
// マレア(港・第2世界)。港到達の現実的Lv=20前後(潮騒の道Lv9-13を抜けた後)。stage2進化済み想定
const mareaRate = runGymSim({ teamData: TRAINERS.gym_port.team, playerIds: ['ignif', 'aquab', 'cogrif'], playerLevel: 20 })
console.log(`  港マレア(Lv20): ${fmtPct(mareaRate)} — ${bossVerdict(mareaRate)}`)
console.log('')

// マレアはプレイヤーの港到達Lvに勝率が極端に敏感(Lv20で約30%→Lv22で約90%、進化直後stage2の
// 成長カーブが急なため)。厳密な50-60%はシミュ単独では詰められないので、複数Lvで幅を表示する。
console.log('  参考: 港マレアのプレイヤーLv感度')
for (const plv of [18, 20, 22]) {
  const r = runGymSim({ teamData: TRAINERS.gym_port.team, playerIds: ['ignif', 'aquab', 'cogrif'], playerLevel: plv })
  console.log(`    P.Lv${plv}: ${fmtPct(r)}`)
}
// 火山イグナート(第3世界)。火山到達の現実的Lv=23前後。全御三家で測る(スターター公平性の確認)
const ignatRate = runGymSim({ teamData: TRAINERS.gym_fire.team, playerIds: ['ignif', 'aquab', 'cogrif'], playerLevel: 24 })
console.log(`  火山イグナート(Lv24): ${fmtPct(ignatRate)} — ${bossVerdict(ignatRate)}`)
// スターター別(火山は火→風2.0で風が不利になりがち。公平性の確認)
console.log('  参考: イグナートのスターター別勝率(P.Lv24)')
for (const st of ['ignif', 'aquab', 'cogrif']) {
  const r = runGymSim({ teamData: TRAINERS.gym_fire.team, playerIds: [st], playerLevel: 24 })
  console.log(`    ${st}単独: ${fmtPct(r)}`)
}
console.log('')

console.log('[4] タイプ全組合せ×3AI 総当たり勝率行列 を計算中… (81組合せ×9AI対×' + N_TYPE_MATRIX + '戦、先手バイアスはfairDuelで相殺)')
const matrix = runTypeMatrix()
// 真の有利度 = eff(A→B) と eff(B→A) の比較(相互作用込み)。同AI同士のみで見る。
// ミラー(ta===tb)は定義上つねに互角(eff同一)なので、勝率50%±マージンからの乖離だけをチェック(=先手バイアス残存の検知)。
const anomalies = []
const MARGIN = 0.12
for (const r of matrix) {
  if (r.aiA !== r.aiB) continue // 同AI同士の型対決のみで純粋な相性影響を見る
  const effAB = effectiveness(r.ta, [r.tb])
  const effBA = effectiveness(r.tb, [r.ta])
  if (r.ta === r.tb) {
    if (Math.abs(r.winRateA - 0.5) > MARGIN) anomalies.push({ ...r, effAB, effBA, note: `ミラー戦なのに勝率が50%から乖離(先手バイアス残存の疑い)` })
    continue
  }
  const advantageA = effAB > effBA // Aの方が攻撃効率が高い=Aが有利なはず
  const advantageB = effBA > effAB
  if (advantageA && r.winRateA < 0.5 - MARGIN) anomalies.push({ ...r, effAB, effBA, note: `${r.ta}の方が相性有利(${effAB}vs${effBA})なのに勝率が伸びていない` })
  if (advantageB && r.winRateA > 0.5 + MARGIN) anomalies.push({ ...r, effAB, effBA, note: `${r.tb}の方が相性有利(${effBA}vs${effAB})なのに${r.ta}側の勝率が高すぎる` })
}
console.log(`  同AI同士(spam/spam,stack/stack,guard/guard)での相性反映の異常値: ${anomalies.length}件`)
for (const a of anomalies.slice(0, 20)) {
  console.log(`    [${a.aiA}] ${a.ta}(→${a.effAB}) vs ${a.tb}(→${a.effBA}) 勝率${fmtPct(a.winRateA)} — ${a.note}`)
}
if (anomalies.length > 20) console.log(`    …他 ${anomalies.length - 20} 件`)

console.log('\n=== 完了 ===')
