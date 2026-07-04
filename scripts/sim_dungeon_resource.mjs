// パッケージD「消耗設計」シミュレーション(S3後半)。
// QUALITY_PLAN.mdの目標: 「ボス到達時に資源7割目標」をヘッドレスで検証する。
// engineの純関数(calcDamage/makeCombatant等)と実データ(MAPS.forest.zones/encounter/chests)を
// 直接importし、緑霧の森を入口→守護者シルヴァの手前まで歩いた1本のランをシミュレートする。
//
// 実行: npx tsx scripts/sim_dungeon_resource.mjs
import {
  calcDamage, effectiveSpeed, preMoveCheck, endTurnStatus, makeCombatant, effectiveness,
} from '../src/engine/battleEngine.ts'
import { getMoveset } from '../src/game/moves.ts'
import { species, rollTalent, expReward, expToNext } from '../src/game/state.ts'
import { MAPS, ENCOUNTER_RATE } from '../src/game/maps.ts'

const forest = MAPS.forest
const N = 2000 // モンテカルロ試行回数/シナリオ

// ─────────────────────────── ゾーンの「高草マス数」推定 ───────────────────────────
// buildForest()の実データより: 各ゾーン矩形と、それを貫く廊下の重なり行/列が「最短通過」に必要な最小マス数。
// 矩形の全面積が「くまなく歩き回る」場合の上限。実際のプレイは大抵その中間。
// min/max/typicalの3シナリオで幅を持たせ、単一の偽の精度を避ける(QUALITY_PLAN.mdの「曲線調整」対象の透明化)。
const zoneArea = (z) => (z.x1 - z.x0 + 1) * (z.y1 - z.y0 + 1)
// 各ゾーンを貫く廊下1本ぶんの最小通過マス数(幅×1行、または高さ×1列。実測値をmaps.tsのbuildForest()から手で確認済み)
const ZONE_MIN_TRANSIT = [6, 7, 7, 7, 7, 7] // A,B,C,D,E,F の順(forest.zones配列の順と一致)

const zones = forest.zones.map((z, i) => ({
  ...z,
  minTiles: ZONE_MIN_TRANSIT[i],
  maxTiles: zoneArea(z),
}))
zones.forEach((z) => { z.typicalTiles = Math.round((z.minTiles + z.maxTiles) / 2) })

// ─────────────────────────── プレイヤーAI/エネミーAI(簡易) ───────────────────────────
// 技選択は相性込みの期待値で選ぶ(実プレイヤーは有利技を選ぶ。sim_balance.mjsと同基準)。
// 相性を無視すると火が地相手に等倍の物理技でなく不利な火技を撃ち続け、wipe率を過大評価する。
function foeTypesOf(c) { return [c.data.type, c.data.type2].filter(Boolean) }
function expectedValue(attacker, defender, move) {
  if (move.power <= 0) return -1
  const eff = effectiveness(move.type, foeTypesOf(defender))
  const stab = move.type === attacker.data.type || move.type === attacker.data.type2 ? 1.5 : 1
  const hits = move.multi ? (move.multi[0] + move.multi[1]) / 2 : 1
  return move.acc * move.power * hits * eff * stab
}
function bestAttack(attacker, moves, foe) {
  const atks = moves.filter((m) => m.power > 0)
  if (!atks.length) return moves[0]
  let best = atks[0], bv = expectedValue(attacker, foe, best)
  for (const m of atks.slice(1)) { const v = expectedValue(attacker, foe, m); if (v > bv) { best = m; bv = v } }
  return best
}
function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)) }

/**
 * 1体vs1体の戦闘を解決。'p'|'e'|'fled' を返す(HPはmutateして返す)。
 * 野生戦の「にげる」は実装上100%成功(Battle.tsx flee())なので、
 * 現実的なプレイヤーは無傷では済まないにせよ無謀に殴り合って倒れたりはしない。
 * HP30%未満・道具切れの時点で逃げる、という防御的行動をAIに組み込む。
 */
function runBattle(p, pMoves, e, eMoves, itemsLeft) {
  for (let turn = 0; turn < 40; turn++) {
    if (p.hp / p.maxHp < 0.3 && itemsLeft <= 0) return 'fled'
    const pMove = bestAttack(p, pMoves, e)
    const eMove = bestAttack(e, eMoves, p)
    const pFirst = effectiveSpeed(p) >= effectiveSpeed(e)
    const order = pFirst ? [[p, e, pMove], [e, p, eMove]] : [[e, p, eMove], [p, e, pMove]]
    for (const [actor, defender, move] of order) {
      if (actor.hp <= 0 || defender.hp <= 0) continue
      const pre = preMoveCheck(actor)
      actor.status = pre.status; actor.statusTurns = pre.statusTurns
      if (!pre.act) continue
      if (Math.random() < move.acc) {
        const hits = move.multi ? randInt(move.multi[0], move.multi[1]) : 1
        for (let h = 0; h < hits && defender.hp > 0; h++) {
          const dr = calcDamage(actor, defender, move)
          defender.hp = Math.max(0, defender.hp - dr.damage)
        }
      }
    }
    if (p.hp <= 0 || e.hp <= 0) break
    if (p.hp > 0) { const r = endTurnStatus(p); if (r.dmg) p.hp = Math.max(0, p.hp - r.dmg) }
    if (e.hp > 0) { const r = endTurnStatus(e); if (r.dmg) e.hp = Math.max(0, e.hp - r.dmg) }
  }
  return p.hp > 0 ? 'p' : 'e'
}

// ─────────────────────────── 1体のプレイヤー状態を持ち歩くラン ───────────────────────────
const STARTER_LEVEL = 8
const STARTER_HEAL_ITEMS = 5 // 母の贈り物(mom_gift)。第2次品質スプリントで3→5に増量。上傷薬は未所持(序盤の現実的な手持ち)
const STARTERS = ['ignif', 'aquab', 'cogrif']

function newPlayer(forcedStarter) {
  const speciesId = forcedStarter ?? STARTERS[Math.floor(Math.random() * STARTERS.length)]
  const talent = rollTalent()
  const c0 = makeCombatant(species(speciesId), STARTER_LEVEL, talent)
  return { speciesId, level: STARTER_LEVEL, exp: 0, talent, hp: c0.maxHp, items: { heal: STARTER_HEAL_ITEMS, heal2: 0 } }
}

function applyExp(player, amount) {
  player.exp += amount
  while (player.exp >= expToNext(player.level) && player.level < 100) {
    player.exp -= expToNext(player.level)
    player.level++
  }
}

function useItemsIfNeeded(player, maxHp) {
  // HP40%未満なら手持ちの回復を使う(上傷薬優先、無ければ傷薬)。実際のプレイでの自然な備え行動を模す
  if (player.hp / maxHp >= 0.4) return
  if (player.items.heal2 > 0) { player.items.heal2--; player.hp = maxHp; return }
  if (player.items.heal > 0) { player.items.heal--; player.hp = Math.min(maxHp, player.hp + Math.round(maxHp * 0.6)) }
}

function pickWildFromZone(zone) {
  const useRare = !!zone.rarePool?.length && Math.random() < (zone.rareChance ?? 0)
  const pool = useRare ? zone.rarePool : zone.pool
  const id = pool[Math.floor(Math.random() * pool.length)]
  const level = randInt(zone.min, zone.max)
  return { id, level }
}

/** 1回のエンカウントを解決。プレイヤーのhp/exp/itemsをmutateする。wipeしたらtrueを返す */
function resolveEncounter(player, zone) {
  const pSpecies = species(player.speciesId)
  const pc = makeCombatant(pSpecies, player.level, player.talent)
  pc.hp = Math.min(pc.maxHp, player.hp)
  useItemsIfNeeded(player, pc.maxHp)
  pc.hp = Math.min(pc.maxHp, player.hp)
  const pMoves = getMoveset(pSpecies, player.level)

  const wild = pickWildFromZone(zone)
  const ec = makeCombatant(species(wild.id), wild.level, rollTalent())
  const eMoves = getMoveset(species(wild.id), wild.level)

  const itemsLeft = player.items.heal + player.items.heal2
  const winner = runBattle(pc, pMoves, ec, eMoves, itemsLeft)
  player.hp = pc.hp
  if (winner === 'p') {
    applyExp(player, expReward(wild.level))
    return false
  }
  if (winner === 'fled') return false // 無傷では済まないが全滅ではない(にげるは100%成功)
  // 全滅(wipe): アジトへ戻され全回復。装備/道具は減ったまま
  player.hp = makeCombatant(pSpecies, player.level, player.talent).maxHp
  return true
}

// ─────────────────────────── 1本のダンジョンランを実行 ───────────────────────────
// chestPlan: そのランで実際に拾う宝箱(item,amount)の列。ゾーン内蔵チェスト+任意のNW/ヌシ分岐
const ZONE_CHESTS = { 1: { item: 'flask', amount: 2 }, 4: { item: 'money', amount: 300 }, 5: { item: 'heal', amount: 3 } } // B,E,F(0始まりindex)
function runDungeon(tileKey, opts) {
  const player = newPlayer(opts?.forcedStarter)
  let wipes = 0
  for (let zi = 0; zi < zones.length; zi++) {
    const z = zones[zi]
    const tiles = z[tileKey]
    for (let t = 0; t < tiles; t++) {
      if (Math.random() < ENCOUNTER_RATE) {
        const wiped = resolveEncounter(player, z)
        if (wiped) wipes++
      }
    }
    // ゾーン内蔵の宝箱(廊下沿いの部屋なので自然に拾う想定)
    const chest = ZONE_CHESTS[zi]
    if (chest) {
      if (chest.item === 'heal') player.items.heal += chest.amount
      else if (chest.item === 'heal2') player.items.heal2 += chest.amount
      // money/flaskはHP資源に直接寄与しないため無視(所持数だけ別集計してもよいが目的外)
    }
    if (opts?.thorough && zi === 2) {
      // 廊下3のヌシの間(北西袋小路+ヌシ戦)。任意ルート
      // 北西の袋小路: 上傷薬×1
      player.items.heal2 += 1
      // ヌシ(マンドラゴLv13 talent6)への挑戦
      const pSpecies = species(player.speciesId)
      const pc = makeCombatant(pSpecies, player.level, player.talent)
      pc.hp = Math.min(pc.maxHp, player.hp)
      useItemsIfNeeded(player, pc.maxHp)
      pc.hp = Math.min(pc.maxHp, player.hp)
      const pMoves = getMoveset(pSpecies, player.level)
      const ec = makeCombatant(species('mandrago'), 13, 6)
      const eMoves = getMoveset(species('mandrago'), 13)
      const itemsLeft = player.items.heal + player.items.heal2
      const winner = runBattle(pc, pMoves, ec, eMoves, itemsLeft)
      player.hp = pc.hp
      if (winner === 'p') { applyExp(player, expReward(13)); player.items.heal2 += 2 /* ヌシの間の宝箱 */ }
      else if (winner === 'fled') { /* 返り討ち覚悟せず退散。近道は未解放のまま */ }
      else { player.hp = makeCombatant(pSpecies, player.level, player.talent).maxHp; wipes++ }
    }
  }
  const finalMax = makeCombatant(species(player.speciesId), player.level, player.talent).maxHp
  return {
    hpPct: player.hp / finalMax,
    level: player.level,
    itemsLeft: player.items.heal + player.items.heal2,
    wipes,
  }
}

// ─────────────────────────── 実行 & 集計 ───────────────────────────
// wipe(全滅)は資源=100%にリセットされるため、平均HP%に混ぜると「厳しすぎる設計」が
// 逆に良く見えてしまう。wipeなしランだけの平均を主指標とし、wipe率は別枠で警告する。
function summarize(label, tileKey, opts) {
  let hpSum = 0, lvSum = 0, itemSum = 0, wipeSum = 0, wipeRuns = 0
  let cleanHpSum = 0, cleanRuns = 0
  const cleanSamples = []
  for (let i = 0; i < N; i++) {
    const r = runDungeon(tileKey, opts)
    hpSum += r.hpPct; lvSum += r.level; itemSum += r.itemsLeft; wipeSum += r.wipes
    if (r.wipes > 0) { wipeRuns++ } else { cleanHpSum += r.hpPct; cleanRuns++; cleanSamples.push(r.hpPct) }
  }
  cleanSamples.sort((a, b) => a - b)
  const cleanAvg = cleanRuns ? cleanHpSum / cleanRuns : NaN
  const median = cleanRuns ? cleanSamples[Math.floor(cleanRuns / 2)] : NaN
  const p10 = cleanRuns ? cleanSamples[Math.floor(cleanRuns * 0.1)] : NaN
  console.log(`[${label}]`)
  console.log(`  平均到達Lv: ${(lvSum / N).toFixed(1)} / 平均残り道具: ${(itemSum / N).toFixed(2)}個`)
  console.log(`  wipe(全滅)発生率: ${(wipeRuns / N * 100).toFixed(1)}% ← これが高いとHP%平均は「全滅→全回復」でごまかされるので要注意`)
  console.log(`  【主指標】wipeなしランのみのHP%: 平均${(cleanAvg * 100).toFixed(1)}% (中央値${(median * 100).toFixed(1)}% / p10=${(p10 * 100).toFixed(1)}%、n=${cleanRuns})`)
  const wipeVerdict = wipeRuns / N > 0.15 ? ' ※wipe率15%超は設計として厳しすぎる兆候' : ''
  const avg = cleanAvg
  const verdict = (avg >= 0.6 && avg <= 0.8 ? 'OK(目標70%の許容域内)' : avg > 0.8 ? 'NG: 楽すぎる(エンカ率↑ or 宝箱の回復量↓ or ゾーンLv帯を引き上げ)' : 'NG: 厳しすぎる(エンカ率↓ or 宝箱の回復量↑ or ゾーンLv帯を引き下げ)') + wipeVerdict
  console.log(`  判定: ${verdict}\n`)
  return avg
}

console.log('=== パッケージD 消耗設計シミュレーション(QUALITY_PLAN.md「ボス到達時に資源7割目標」) ===\n')
console.log(`前提: 高草マス数はゾーン矩形と廊下の重なりから min(最短通過)/typical((min+max)/2)/max(全面積踏破) の3シナリオで幅を持たせる。`)
console.log(`ゾーン別マス数(min/typical/max): ${zones.map((z) => `[${z.min}-${z.max}L]${z.minTiles}/${z.typicalTiles}/${z.maxTiles}`).join(' ')}\n`)

summarize('最短経路のみ(NW宝箱・ヌシ未挑戦)', 'minTiles', { thorough: false })
summarize('標準的な探索(NW宝箱・ヌシ未挑戦)', 'typicalTiles', { thorough: false })
summarize('くまなく探索(NW宝箱・ヌシ未挑戦)', 'maxTiles', { thorough: false })
summarize('標準的な探索+ヌシに挑戦', 'typicalTiles', { thorough: true })

console.log('=== 完了 ===')

// ═══════════════════════════ 2体パーティ版(より典型的なプレイスタイル) ═══════════════════════════
// 単独行動は「捕獲もパーティ交代もしない」最悪ケース。実際のゲームは捕獲・交代が標準機能
// (メモリ記載: パーティ運用実装済)なので、ゾーンB通過後に森属性(地/毒/風)へ強い風タイプを
// 1体仲間にし、遭遇のたびに相性の良い方を出す、というより典型的な進め方も検証する。
function partyMemberHp(m) { return m.hp }
function bestPartyMember(party, foeSp) {
  let best = party[0], bestScore = -1
  for (const m of party) {
    if (m.hp <= 0) continue
    const sp = species(m.speciesId)
    const eff = effectiveness(sp.type, [foeSp.type, foeSp.type2].filter(Boolean))
    const score = eff * 10 + m.hp / makeCombatant(sp, m.level, m.talent).maxHp
    if (score > bestScore) { best = m; bestScore = score }
  }
  return party.some((m) => m.hp > 0) ? best : party[0]
}
function resolveEncounterParty(party, zone) {
  const wild = pickWildFromZone(zone)
  const foeSp = species(wild.id)
  const member = bestPartyMember(party, foeSp)
  const pSpecies = species(member.speciesId)
  const pc = makeCombatant(pSpecies, member.level, member.talent)
  pc.hp = Math.min(pc.maxHp, member.hp)
  const sharedItems = party.items
  useItemsIfNeededCombatant(sharedItems, pc)
  const pMoves = getMoveset(pSpecies, member.level)
  const ec = makeCombatant(foeSp, wild.level, rollTalent())
  const eMoves = getMoveset(foeSp, wild.level)
  const itemsLeft = sharedItems.heal + sharedItems.heal2
  const winner = runBattle(pc, pMoves, ec, eMoves, itemsLeft)
  member.hp = pc.hp
  if (winner === 'p') { applyExp(member, expReward(wild.level)); return false }
  if (winner === 'fled') return false
  member.hp = 0 // その個体は戦闘不能(気絶)。パーティ全滅は全員hp<=0の時のみ
  if (party.every((m) => m.hp <= 0)) {
    for (const m of party) m.hp = makeCombatant(species(m.speciesId), m.level, m.talent).maxHp
    return true
  }
  return false
}
function runDungeonParty(tileKey) {
  const starter = STARTERS[Math.floor(Math.random() * STARTERS.length)]
  const talent0 = rollTalent()
  const c0 = makeCombatant(species(starter), STARTER_LEVEL, talent0)
  const party = [{ speciesId: starter, level: STARTER_LEVEL, exp: 0, talent: talent0, hp: c0.maxHp }]
  party.items = { heal: STARTER_HEAL_ITEMS, heal2: 0 }
  let joined = false
  let wipes = 0
  for (let zi = 0; zi < zones.length; zi++) {
    const z = zones[zi]
    if (!joined && zi === 2) {
      // 廊下3(ゾーンC)に入る頃には最初の1体を捕獲している想定。森の全属性に強い風タイプを迎える
      const lv = Math.max(STARTER_LEVEL, z.min)
      party.push({ speciesId: 'briezel', level: lv, exp: 0, talent: rollTalent(), hp: makeCombatant(species('briezel'), lv, 0).maxHp })
      joined = true
    }
    for (let t = 0; t < z[tileKey]; t++) {
      if (Math.random() < ENCOUNTER_RATE) { if (resolveEncounterParty(party, z)) wipes++ }
    }
    const chest = ZONE_CHESTS[zi]
    if (chest?.item === 'heal') party.items.heal += chest.amount
    else if (chest?.item === 'heal2') party.items.heal2 += chest.amount
  }
  const totalMax = party.reduce((s, m) => s + makeCombatant(species(m.speciesId), m.level, m.talent).maxHp, 0)
  const totalHp = party.reduce((s, m) => s + Math.max(0, m.hp), 0)
  return { hpPct: totalHp / totalMax, wipes, itemsLeft: party.items.heal + party.items.heal2 }
}
// useItemsIfNeededを共有アイテム+単一combatantの形にも対応させる薄いオーバーロード
function useItemsIfNeededCombatant(items, pc) {
  if (pc.hp / pc.maxHp >= 0.4) return
  if (items.heal2 > 0) { items.heal2--; pc.hp = pc.maxHp; return }
  if (items.heal > 0) { items.heal--; pc.hp = Math.min(pc.maxHp, pc.hp + Math.round(pc.maxHp * 0.6)) }
}

console.log('--- 参考: 2体パーティ版(標準的な探索・より典型的なプレイスタイル) ---')
{
  const M = 500
  let wipeRuns = 0, hpSum = 0, cleanHpSum = 0, cleanRuns = 0
  for (let i = 0; i < M; i++) {
    const r = runDungeonParty('typicalTiles')
    hpSum += r.hpPct
    if (r.wipes > 0) wipeRuns++
    else { cleanHpSum += r.hpPct; cleanRuns++ }
  }
  console.log(`  wipe率: ${(wipeRuns / M * 100).toFixed(1)}% / wipeなしランのHP%平均: ${cleanRuns ? (cleanHpSum / cleanRuns * 100).toFixed(1) : 'N/A'}% (n=${cleanRuns})`)
}

// ─── 診断: スターター別のwipe率(相性の構造的有利/不利を検出) ───
console.log('--- 診断: スターター別(標準探索シナリオ) ---')
for (const st of STARTERS) {
  let wipeRuns = 0
  const M = 300
  for (let i = 0; i < M; i++) {
    const r = runDungeon('typicalTiles', { forcedStarter: st })
    if (r.wipes > 0) wipeRuns++
  }
  console.log(`  ${st}: wipe率 ${(wipeRuns / M * 100).toFixed(1)}%`)
}
