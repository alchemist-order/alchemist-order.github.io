import { useEffect, useMemo, useRef, useState } from 'react'
import type { BattleConfig, Combatant, GameState, Move, OwnedMonster } from '../types'
import {
  calcDamage,
  effMessage,
  effectiveSpeed,
  effectiveness,
  endTurnStatus,
  makeCombatant,
  preMoveCheck,
} from '../engine/battleEngine'
import { makeRng, systemRng, type Rng } from '../engine/rng'
import {
  DEX,
  PARTY_MAX,
  catchChance,
  expReward,
  getParty,
  grantExp,
  rarityOf,
  rollTalent,
  species,
  today,
  withCaught,
  withSeen,
} from '../game/state'
import { getMoveset, moveById } from '../game/moves'
import '../battle-fx.css'
import { ABILITIES, heldItemOf } from '../game/abilities'
import * as audio from '../game/audio'
import { BattlePortrait, GetMonsterOverlay, HpBar, Sprite, StatusBadge, TypeBadge } from '../ui'

// 倍速トグル(第2次品質スプリント): 全演出sleepにこの係数を掛ける。localStorageで永続。
let battleSpeed = Number(localStorage.getItem('ao-battle-speed')) || 1
export function setBattleSpeed(mult: number) {
  battleSpeed = mult
  localStorage.setItem('ao-battle-speed', String(mult))
}
export function getBattleSpeed() {
  return battleSpeed
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms / battleSpeed))
const STAT_JP: Record<'atk' | 'def' | 'spd' | 'mag', string> = { atk: 'こうげき', def: 'ぼうぎょ', spd: 'すばやさ', mag: 'まりょく' }
const STATUS_AURA: Record<string, string> = { やけど: 'sa-burn', どく: 'sa-psn', まひ: 'sa-para', ねむり: 'sa-sleep', こおり: 'sa-frz', 灰化: 'sa-ash' }
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// 技の最大PP(威力/カテゴリから導出)
const maxPP = (m: Move): number =>
  m.category === 'status' ? 10 : m.power >= 85 ? 5 : m.power >= 75 ? 10 : m.power <= 40 ? 35 : 20
const initPP = (moves: Move[]): Record<string, number> =>
  Object.fromEntries(moves.map((m) => [m.id, maxPP(m)]))

// 習得技＋遺伝技(id重複除く)。バトル中の進化にも対応するため data/level から組む
const withInherited = (data: Combatant['data'], level: number, inherited?: Move[]): Move[] => {
  const natural = getMoveset(data, level)
  const extra = (inherited ?? []).filter((m) => !natural.some((n) => n.id === m.id))
  return [...natural, ...extra]
}

function makeWild(playerLevel: number, config: Extract<BattleConfig, { kind: 'wild' }>, rng: Rng): Combatant {
  // DEVデモ用: localStorage.demo_enemy が指定されていればその種を出す(本番では無効)。
  // シード付きラン(塔)中は決定論を守るため無効(SPEC_RNG_REPLAY.md §8)
  if (import.meta.env.DEV && !config.seed) {
    const forced = localStorage.getItem('demo_enemy')
    if (forced) {
      const lvl = Number(localStorage.getItem('demo_enemy_level')) || playerLevel
      try {
        return makeCombatant(species(forced), lvl)
      } catch {
        /* 不明idなら通常処理 */
      }
    }
  }
  // ヌシ幻獣(パッケージD): 種/レベル/個体値を固定出現させる
  if (config.forcedSpeciesId) {
    return makeCombatant(species(config.forcedSpeciesId), config.forcedLevel ?? playerLevel, config.forcedTalent ?? 0)
  }
  const pool = config.pool?.length
    ? config.pool
    : DEX.filter((d) => d.role !== 'legendary' && d.stage <= 2).map((d) => d.id)
  const id = rng.pick(pool)
  const level =
    config.min != null && config.max != null
      ? rng.int(config.min, config.max)
      : clamp(playerLevel + rng.int(-2, 1), 2, 100)
  return makeCombatant(species(id), level, rollTalent(rng)) // 個体差をロール(良個体は約5%)
}

type Phase = 'fighting' | 'won' | 'lost' | 'caught' | 'fled'
type Side = 'p' | 'e'
interface Fx { atk?: Side; hit?: Side; flash?: boolean; strong?: boolean }
interface Popup { side: Side; text: string; cls: string; key: number }

interface Props {
  active: OwnedMonster
  config: BattleConfig
  state: GameState
  setState: (updater: (s: GameState) => GameState) => void
  onExit: (won?: boolean) => void // won=この戦闘に勝利したか(塔の階層進行に使用)
}

export default function Battle({ active, config, state, setState, onExit }: Props) {
  const isTrainer = config.kind === 'trainer'
  const isTower = config.kind === 'wild' && !!config.tower
  // 乱数ストリーム(SPEC_RNG_REPLAY.md §3): 塔=シード付き(敵生成=floor/バトル内=battle)、他=非シード。
  // 塔は階ごとにkey再マウントされるため、マウント毎にfloor:<階>から派生し直す。
  const rngRef = useRef<{ floor: Rng; battle: Rng } | null>(null)
  if (!rngRef.current) {
    if (config.kind === 'wild' && config.seed) {
      const floor = makeRng(config.seed).fork(`floor:${config.floor ?? 0}`)
      rngRef.current = { floor, battle: floor.fork('battle') }
    } else {
      const sysR = systemRng()
      rngRef.current = { floor: sysR, battle: sysR }
    }
  }
  const brng = rngRef.current.battle
  const teamRef = useRef<Combatant[]>(
    config.kind === 'trainer'
      ? config.trainer.team.map((t) => makeCombatant(species(t.speciesId), t.level, t.talent ?? 0, t.heldItem))
      : [],
  )
  // 守護者のカスタム技リスト(moves指定があればそれ、無ければレベル既定)
  const teamMovesRef = useRef<Move[][]>(
    config.kind === 'trainer'
      ? config.trainer.team.map((t) => {
          const sp = species(t.speciesId)
          const custom = t.moves?.map((id) => moveById(id, sp)).filter(Boolean) as Move[] | undefined
          return custom && custom.length ? custom : getMoveset(sp, t.level)
        })
      : [],
  )
  const ownedRef = useRef<OwnedMonster>({ ...active })

  const [player, setPlayer] = useState<Combatant>(() => {
    const c = makeCombatant(species(active.speciesId), active.level, active.talent ?? 0, active.heldItem)
    if (typeof active.hp === 'number' && active.hp > 0) c.hp = Math.min(c.maxHp, active.hp)
    return c
  })
  const [enemy, setEnemy] = useState<Combatant>(() =>
    config.kind === 'trainer' ? teamRef.current[0] : makeWild(active.level, config, rngRef.current!.floor),
  )
  const [enemyIndex, setEnemyIndex] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('fighting')
  const [menu, setMenu] = useState<'root' | 'fight' | 'switch' | 'item'>('root')
  const [curUid, setCurUid] = useState(active.uid)
  const [mustSwitch, setMustSwitch] = useState(false)
  const [acting, setActing] = useState(false)
  const [caught, setCaught] = useState<{ id: string; name: string; type: string; talent?: number } | null>(null)
  const [speed, setSpeed] = useState(getBattleSpeed())
  // 捕獲演出(第2次品質スプリント): 敵が吸い込まれ→フラスコが揺れ→確定 or 脱出
  const [capture, setCapture] = useState<null | 'suck' | 'shake' | 'caught' | 'break'>(null)

  // 手持ちの生存メンバー(現在出ている個体を除く)
  const mk = (o: OwnedMonster): Combatant => {
    const c = makeCombatant(species(o.speciesId), o.level, o.talent ?? 0, o.heldItem)
    if (typeof o.hp === 'number' && o.hp > 0) c.hp = Math.min(c.maxHp, o.hp)
    return c
  }
  // 交代対象は「パーティ内」の生存個体のみ(預かりボックスは戦闘に出せない)
  const party = getParty(state)
  const switchTargets = state.collection.filter((o) => party.includes(o.uid) && o.uid !== curUid && (o.hp == null || o.hp > 0))
  const [fx, setFx] = useState<Fx>({})
  const [popup, setPopup] = useState<Popup | null>(null)
  const [burst, setBurst] = useState<{ type: string; side: Side; strong: boolean; key: number } | null>(null)
  const busy = useRef(false)
  const burstKey = useRef(0)
  const popupKey = useRef(0)
  const logEndRef = useRef<HTMLDivElement>(null)

  const playerMoves = useMemo(
    () => withInherited(player.data, player.level, state.collection.find((o) => o.uid === curUid)?.inheritedMoves),
    [player.data, player.level, curUid, state.collection],
  )
  const [pp, setPp] = useState<Record<string, number>>(() => initPP(withInherited(player.data, player.level, active.inheritedMoves)))
  const struggle: Move = { id: 'struggle', name: 'あがき', type: player.data.type, category: 'phys', power: 30, acc: 1, desc: 'PPが尽きたときの最後のあがき。少し反動を受ける。' }
  const ppOf = (mv: Move) => pp[mv.id] ?? maxPP(mv)
  const allEmpty = playerMoves.every((mv) => ppOf(mv) <= 0)

  useEffect(() => {
    if (config.kind === 'trainer') {
      setLog([
        `${config.trainer.name}が しょうぶを しかけてきた！`,
        `${config.trainer.name}は ${enemy.data.name}を くりだした！`,
        `ゆけ、${player.data.name}！`,
      ])
      setState((s) => config.trainer.team.reduce((acc, t) => withSeen(acc, t.speciesId), s))
    } else {
      setLog([`あ！ 野生の ${enemy.data.name} が あらわれた！`, `ゆけ、${player.data.name}！`])
      setState((s) => withSeen(s, enemy.data.id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 溜め技の自動解放: プレイヤーが溜め中なら次の自ターンで自動発動(選択不要)
  useEffect(() => {
    if (player.charging && phase === 'fighting' && !busy.current && !mustSwitch) {
      const mv = playerMoves.find((m) => m.id === player.charging)
      if (mv) void takeTurn(mv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.charging, phase])

  function pushLog(...lines: string[]) {
    setLog((prev) => [...prev, ...lines])
    requestAnimationFrame(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }))
  }
  function showPopup(side: Side, text: string, cls: string) {
    popupKey.current += 1
    setPopup({ side, text, cls, key: popupKey.current })
    setTimeout(() => setPopup((p) => (p && p.key === popupKey.current ? null : p)), 850)
  }
  // 被弾側にタイプ別エフェクトを重ねる
  function fireBurst(type: string, side: Side, strong: boolean) {
    burstKey.current += 1
    const k = burstKey.current
    setBurst({ type, side, strong, key: k })
    setTimeout(() => setBurst((b) => (b && b.key === k ? null : b)), 560)
  }

  function gainExp(reward: number): string[] {
    const prevSpecies = ownedRef.current.speciesId
    const msgs = grantExp(ownedRef.current, reward)
    const evolvedTo = ownedRef.current.speciesId !== prevSpecies ? ownedRef.current.speciesId : null
    setState((s) => {
      let next: GameState = {
        ...s,
        collection: s.collection.map((o) => (o.uid === ownedRef.current.uid ? { ...ownedRef.current } : o)),
      }
      if (evolvedTo) next = withCaught(withSeen(next, evolvedTo), evolvedTo)
      return next
    })
    return [`${player.data.name}は ${reward} の経験値を得た！`, ...msgs]
  }

  function onEnemyDown() {
    audio.sfx('faint')
    const expMsgs = gainExp(expReward(enemy.level))
    if (config.kind === 'trainer') {
      const team = teamRef.current
      if (enemyIndex + 1 < team.length) {
        const next = team[enemyIndex + 1]
        setEnemyIndex(enemyIndex + 1)
        setEnemy(next)
        pushLog(`${enemy.data.name}を たおした！`, ...expMsgs, `${config.trainer.name}は ${next.data.name}を くりだした！`)
        return
      }
      const prize = 150 + enemy.level * 12
      setState((s) => ({
        ...s,
        wins: s.wins + 1,
        money: s.money + prize,
        badges: s.badges.includes(config.trainer.badge) ? s.badges : [...s.badges, config.trainer.badge],
        defeatedTrainers: s.defeatedTrainers.includes(config.trainer.id)
          ? s.defeatedTrainers
          : [...s.defeatedTrainers, config.trainer.id],
      }))
      pushLog(`${enemy.data.name}を たおした！`, ...expMsgs, `${config.trainer.name}に かった！`, `🎖 ${config.trainer.badge}を 手に入れた！`, `💰 ${prize}ゲルを 手に入れた！`)
      audio.sfx('badge')
      audio.playVictory()
      setPhase('won')
      return
    }
    const prize = 10 + enemy.level * 3
    setState((s) => ({
      ...s,
      wins: s.wins + 1,
      flasks: s.flasks + 1,
      money: s.money + prize,
      daily: s.daily && s.daily.date === today() ? { ...s.daily, wild: s.daily.wild + 1 } : s.daily,
    }))
    pushLog(`野生の ${enemy.data.name} を たおした！`, ...expMsgs, `🔮 封獣フラスコ＋1 / 💰 ${prize}ゲル`)
    audio.playVictory()
    setPhase('won')
  }

  // 敵(現在出ている個体)の技リスト: トレーナーはカスタム/既定、野生はレベル既定
  const enemyMoveList = (e: Combatant): Move[] => (isTrainer ? teamMovesRef.current[enemyIndex] : null) ?? getMoveset(e.data, e.level)

  function chooseEnemyMove(p: Combatant, e: Combatant): Move {
    const ms = enemyMoveList(e)
    // 溜め中は解放を強制
    if (e.charging) { const c = ms.find((x) => x.id === e.charging); if (c) return c }
    const r = brng.next()
    const totalStage = e.stages.atk + e.stages.def + e.stages.spd + e.stages.mag
    const status = ms.filter((x) => x.category === 'status')
    // ボス開幕ギミック: エース登場初ターンにauraを使う(auraがあれば)
    if (isTrainer && enemyIndex === teamRef.current.length - 1 && (e.lastMoveId == null) && (e.hp === e.maxHp)) {
      const aura = status.find((x) => x.buffs?.some((b) => b.target === 'self') || x.guard)
      if (aura) return aura
    }
    for (const sm of status) {
      if (sm.heal && e.hp < e.maxHp * 0.4 && r < 0.6) return sm
      if (sm.guard && e.hp < e.maxHp * 0.4 && e.lastMoveId !== sm.id && r < 0.3) return sm
      if (sm.resetStages && (p.stages.atk + p.stages.def + p.stages.spd + p.stages.mag) >= 3) return sm
      if (sm.buffs?.some((b) => b.target === 'self') && e.hp > e.maxHp * 0.7 && totalStage < 4 && r < 0.4) return sm
      if (sm.buffs?.some((b) => b.target === 'foe') && r < 0.3) return sm
      if (sm.inflict && !p.status && r < 0.35) return sm
    }
    const dmg = ms.filter((x) => x.category !== 'status')
    const pTypes = [p.data.type, p.data.type2].filter(Boolean) as string[]
    let best = dmg[0]
    let bestScore = -1
    for (const mv of dmg) {
      if (mv.charge && e.hp < e.maxHp * 0.5) continue // 低HPでは溜め技を避ける
      const score = mv.power * effectiveness(mv.type, pTypes) * (mv.type === e.data.type || mv.type === e.data.type2 ? 1.5 : 1)
      if (score > bestScore) {
        bestScore = score
        best = mv
      }
    }
    return best ?? ms[0]
  }

  // プレイヤーの個体が倒れた時: 生存仲間がいれば交代を促し、いなければ敗北
  function handlePlayerDown(msg: string) {
    audio.sfx('faint')
    pushLog(msg)
    if (switchTargets.length > 0) {
      pushLog('次の幻獣を 選ぼう！')
      setMustSwitch(true)
      setMenu('switch')
    } else {
      pushLog('💀 手持ちが 全滅した……アジトに もどされた。')
      setPhase('lost')
    }
  }

  // 敵の1ターン(交代/どうぐ/捕獲失敗後に共通使用)。倒れたら handlePlayerDown
  async function enemyTurn(p: Combatant) {
    const e = { ...enemy }
    const pre = preMoveCheck(e, brng)
    if (pre.status !== e.status || pre.statusTurns !== e.statusTurns) {
      setEnemy((prev) => ({ ...prev, status: pre.status, statusTurns: pre.statusTurns }))
    }
    if (pre.msg) pushLog(pre.msg)
    if (!pre.act) return
    const eMove = chooseEnemyMove(p, e)
    setFx({ atk: 'e' })
    await sleep(160)
    pushLog(`${isTrainer ? '' : '野生の '}${e.data.name}の ${eMove.name}！`)
    if (!brng.chance(eMove.acc)) {
      pushLog('しかし 当たらなかった！')
      setFx({})
      await sleep(250)
      return
    }
    if (eMove.category === 'status') {
      if (eMove.heal) {
        setEnemy((prev) => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + Math.floor(prev.maxHp * (eMove.heal ?? 0))) }))
        audio.sfx('heal')
        pushLog(`${e.data.name}は HPを 回復した！`)
      } else if (eMove.inflict && !p.status) {
        const st = eMove.inflict.status
        setPlayer((prev) => ({ ...prev, status: st, statusTurns: st === 'ねむり' ? brng.int(2, 3) : 0 }))
        pushLog(st === '灰化' ? `${p.data.name}は 灰化しはじめた……` : `${p.data.name}は ${st}状態になった！`)
      }
      setFx({})
      await sleep(300)
      return
    }
    const r = calcDamage(e, p, eMove, 0.85 + brng.next() * 0.15, brng.next())
    let dealt = r.damage
    const sturdyHeld = p.ability === 'sturdy' && p.hp === p.maxHp && dealt >= p.hp
    if (sturdyHeld) dealt = p.hp - 1
    let pHp = Math.max(0, p.hp - dealt)
    const eStrong = r.crit || r.eff >= 2
    setFx({ hit: 'p', flash: eStrong, strong: eStrong })
    fireBurst(eMove.type, 'p', eStrong)
    showPopup('p', `-${dealt}`, eStrong ? 'crit' : 'dmg')
    audio.sfx(eStrong ? 'crit' : 'hit')
    if (r.crit) pushLog('急所に 当たった！')
    const msg = effMessage(r.eff)
    if (msg) pushLog(msg)
    // もちもの:回復の実(プレイヤー)
    const berry = heldItemOf(p.heldItem)
    let usedBerry = false
    if (berry?.pinchHeal && !p.berryUsed && pHp > 0 && pHp <= p.maxHp * 0.25) {
      pHp = Math.min(p.maxHp, pHp + Math.floor(p.maxHp * berry.pinchHeal))
      usedBerry = true
    }
    p.hp = pHp
    if (usedBerry) p.berryUsed = true
    setPlayer((prev) => ({ ...prev, hp: pHp, berryUsed: prev.berryUsed || usedBerry }))
    await sleep(440)
    setFx({})
    if (sturdyHeld) { pushLog(`${p.data.name}は ふんばって 耐えた！(頑丈)`); await sleep(220) }
    if (usedBerry) { audio.sfx('heal'); showPopup('p', `+${Math.floor(p.maxHp * (berry?.pinchHeal ?? 0))}`, 'heal'); pushLog(`${p.data.name}は ${berry?.name}で HPを回復した！`); await sleep(280) }
    if (pHp <= 0) handlePlayerDown(`${p.data.name}は たおれてしまった……`)
  }

  // 手持ちを交代。forced(気絶後)は敵ターンなし、任意交代は敵が1手行動
  async function doSwitch(uid: string) {
    if (busy.current) return
    const target = state.collection.find((o) => o.uid === uid)
    if (!target) return
    const forced = mustSwitch
    busy.current = true
    setActing(true)
    const outUid = curUid
    const outHp = player.hp
    setState((s) => ({ ...s, collection: s.collection.map((o) => (o.uid === outUid ? { ...o, hp: outHp } : o)) }))
    ownedRef.current = { ...target }
    setCurUid(uid)
    const newC = mk(target)
    setPlayer(newC)
    setPp(initPP(withInherited(newC.data, newC.level, target.inheritedMoves)))
    pushLog(`ゆけ、${newC.data.name}！`)
    setMustSwitch(false)
    setMenu('root')
    if (!forced) {
      await sleep(300)
      await enemyTurn(newC)
    }
    busy.current = false
    setActing(false)
  }

  async function takeTurn(pMove: Move) {
    if (busy.current || phase !== 'fighting') return
    busy.current = true
    setActing(true)
    setMenu('root')
    if (pMove.id !== 'struggle') setPp((prev) => ({ ...prev, [pMove.id]: Math.max(0, (prev[pMove.id] ?? maxPP(pMove)) - 1) }))

    const p: Combatant = { ...player }
    const e: Combatant = { ...enemy }
    const sync = (side: Side) => (side === 'p' ? setPlayer({ ...p }) : setEnemy({ ...e }))

    const applyInflict = (side: Side, status: NonNullable<Combatant['status']>) => {
      const tgt = side === 'p' ? p : e
      if (tgt.status) {
        pushLog(`しかし ${tgt.data.name}には 効果がなかった！`)
        return
      }
      tgt.status = status
      tgt.statusTurns = status === 'ねむり' ? brng.int(2, 3) : 0
      sync(side)
      pushLog(status === '灰化' ? `${tgt.data.name}は 灰化しはじめた……` : `${tgt.data.name}は ${status}状態になった！`)
    }

    // 能力ランク操作
    const applyBuffs = (buffs: NonNullable<Move['buffs']>, atkSide: Side, defSide: Side) => {
      for (const b of buffs) {
        const side = b.target === 'self' ? atkSide : defSide
        const tgt = side === 'p' ? p : e
        const cur = tgt.stages[b.stat]
        const nv = Math.max(-3, Math.min(3, cur + b.delta))
        if (nv === cur) {
          pushLog(`${tgt.data.name}の ${STAT_JP[b.stat]}は もう ${b.delta > 0 ? '上がらない' : '下がらない'}！`)
          continue
        }
        tgt.stages[b.stat] = nv
        sync(side)
        const up = b.delta > 0
        const big = Math.abs(b.delta) >= 2
        pushLog(`${tgt.data.name}の ${STAT_JP[b.stat]}が ${big ? (up ? 'ぐーんと上がった' : 'がくっと下がった') : up ? '上がった' : '下がった'}！`)
      }
    }

    const doMove = async (side: Side, move: Move) => {
      const atkSide = side
      const defSide: Side = side === 'p' ? 'e' : 'p'
      const attacker = side === 'p' ? p : e
      const defender = side === 'p' ? e : p

      // 自分の行動開始時にガードを解除＋最後の技を記録
      if (attacker.guarding) attacker.guarding = false
      attacker.lastMoveId = move.id
      sync(atkSide)

      // 溜め技: 溜めターン(まだ溜めていない)なら溜めて終了
      if (move.charge && attacker.charging !== move.id) {
        attacker.charging = move.id
        sync(atkSide)
        setFx({ atk: atkSide })
        pushLog(`${attacker.data.name}は 力を 溜めている……！`)
        await sleep(500)
        setFx({})
        return
      }
      if (attacker.charging === move.id) { attacker.charging = undefined; sync(atkSide) } // 解放

      setFx({ atk: atkSide })
      await sleep(160)
      pushLog(`${attacker.data.name}の ${move.name}！`)

      if (!brng.chance(move.acc)) {
        setFx({})
        pushLog('しかし 当たらなかった！')
        await sleep(250)
        return
      }

      if (move.category === 'status') {
        if (move.guard) {
          attacker.guarding = true
          sync(atkSide)
          pushLog(`${attacker.data.name}は 身を 固めた！`)
        } else if (move.heal) {
          const amt = Math.min(attacker.maxHp - attacker.hp, Math.floor(attacker.maxHp * move.heal))
          attacker.hp += amt
          if (move.cures && attacker.status) {
            attacker.status = null
            attacker.statusTurns = 0
          }
          sync(atkSide)
          showPopup(atkSide, `+${amt}`, 'heal')
          audio.sfx('heal')
          pushLog(`${attacker.data.name}は HPを 回復した！`)
        } else if (move.resetStages) {
          defender.stages = { atk: 0, def: 0, spd: 0, mag: 0 }
          sync(defSide)
          pushLog(`${defender.data.name}の 能力変化が 打ち消された！`)
        } else if (move.inflict) {
          applyInflict(defSide, move.inflict.status)
        }
        if (move.buffs) applyBuffs(move.buffs, atkSide, defSide)
        await sleep(420)
        setFx({})
        return
      }

      // ダメージ技(連続対応)
      const hits = move.multi ? brng.int(move.multi[0], move.multi[1]) : 1
      let total = 0
      let anyCrit = false
      let lastEff = 1
      let sturdyHeld = false
      for (let h = 0; h < hits; h++) {
        if (defender.hp <= 0) break
        const r = calcDamage(attacker, defender, move, 0.85 + brng.next() * 0.15, brng.next())
        lastEff = r.eff
        let dealt = r.damage
        if (defender.ability === 'sturdy' && defender.hp === defender.maxHp && dealt >= defender.hp) { dealt = defender.hp - 1; sturdyHeld = true }
        defender.hp = Math.max(0, defender.hp - dealt)
        total += dealt
        if (r.crit) anyCrit = true
        const strong = r.crit || r.eff >= 2
        setFx({ hit: defSide, flash: strong, strong })
        fireBurst(move.type, defSide, strong)
        showPopup(defSide, `-${dealt}`, strong ? 'crit' : 'dmg')
        audio.sfx(strong ? 'crit' : 'hit')
        sync(defSide)
        await sleep(hits > 1 ? 240 : 440)
      }
      setFx({})
      if (hits > 1 && total > 0) pushLog(`${hits}回 当たった！`)
      if (anyCrit) pushLog('急所に 当たった！')
      const msg = effMessage(lastEff)
      if (msg) pushLog(msg)
      if (sturdyHeld) { pushLog(`${defender.data.name}は ふんばって 耐えた！`); await sleep(220) }

      // 吸収
      if (move.drain && total > 0 && attacker.hp > 0) {
        const heal = Math.min(attacker.maxHp - attacker.hp, Math.max(1, Math.floor(total * move.drain)))
        if (heal > 0) {
          attacker.hp += heal
          sync(atkSide)
          showPopup(atkSide, `+${heal}`, 'heal')
          audio.sfx('heal')
          pushLog(`${defender.data.name}から 体力を 吸い取った！`)
          await sleep(300)
        }
      }
      // 反動(タグ or あがき)
      const recoilRate = move.recoil ?? (move.id === 'struggle' ? 0.25 : 0)
      if (recoilRate > 0 && total > 0 && attacker.hp > 0) {
        const rec = Math.max(1, Math.floor(total * recoilRate))
        attacker.hp = Math.max(0, attacker.hp - rec)
        sync(atkSide)
        showPopup(atkSide, `-${rec}`, 'dmg')
        pushLog(`${attacker.data.name}は 反動を 受けた！`)
        await sleep(320)
      }
      // もちもの:回復の実
      const berry = heldItemOf(defender.heldItem)
      if (berry?.pinchHeal && !defender.berryUsed && defender.hp > 0 && defender.hp <= defender.maxHp * 0.25) {
        const heal = Math.floor(defender.maxHp * berry.pinchHeal)
        defender.hp = Math.min(defender.maxHp, defender.hp + heal)
        defender.berryUsed = true
        sync(defSide)
        showPopup(defSide, `+${heal}`, 'heal')
        audio.sfx('heal')
        pushLog(`${defender.data.name}は ${berry.name}で HPを回復した！`)
        await sleep(320)
      }
      // 特性:毒手
      if (defender.hp > 0 && attacker.ability === 'toxictouch' && move.category === 'phys' && !defender.status && brng.chance(0.3)) {
        applyInflict(defSide, 'どく')
        await sleep(250)
      }
      // 追加効果(状態異常)
      if (defender.hp > 0 && move.inflict && brng.chance(move.inflict.chance)) {
        applyInflict(defSide, move.inflict.status)
        await sleep(250)
      }
      // 攻撃技のランク操作(うずしお等)
      if (move.buffs && (defender.hp > 0 || move.buffs.some((b) => b.target === 'self'))) {
        applyBuffs(move.buffs, atkSide, defSide)
        await sleep(250)
      }
    }

    const eMove = chooseEnemyMove(p, e)
    // 行動順: 優先度 → 実効すばやさ → プレイヤー優先
    const pPri = pMove.priority ?? 0
    const ePri = eMove.priority ?? 0
    const pFirst = pPri !== ePri ? pPri > ePri : effectiveSpeed(p) >= effectiveSpeed(e)
    const queue: [Side, Move][] = pFirst ? [['p', pMove], ['e', eMove]] : [['e', eMove], ['p', pMove]]
    let outcome: 'none' | 'enemyDown' | 'playerDown' = 'none'

    for (const [side, mv] of queue) {
      if (outcome !== 'none') break
      const actor = side === 'p' ? p : e
      if (actor.hp <= 0) continue
      await sleep(420)
      const pre = preMoveCheck(actor, brng)
      actor.status = pre.status
      actor.statusTurns = pre.statusTurns
      sync(side)
      if (pre.msg) pushLog(pre.msg)
      if (!pre.act) continue
      await doMove(side, mv)
      if (e.hp <= 0) outcome = 'enemyDown'
      else if (p.hp <= 0) outcome = 'playerDown'
    }

    if (outcome === 'none') {
      for (const side of pFirst ? (['p', 'e'] as Side[]) : (['e', 'p'] as Side[])) {
        const c = side === 'p' ? p : e
        const st = endTurnStatus(c)
        if (st.dmg > 0) {
          c.hp = Math.max(0, c.hp - st.dmg)
          sync(side)
          showPopup(side, `-${st.dmg}`, 'dmg')
          if (st.msg) pushLog(st.msg)
          await sleep(500)
        }
        // 特性:自然回復 — ターン終了時にHPを1/16回復
        if (c.ability === 'regen' && c.hp > 0 && c.hp < c.maxHp) {
          const heal = Math.max(1, Math.floor(c.maxHp / 16))
          c.hp = Math.min(c.maxHp, c.hp + heal)
          sync(side)
          showPopup(side, `+${heal}`, 'heal')
          await sleep(300)
        }
        if (e.hp <= 0) {
          outcome = 'enemyDown'
          break
        }
        if (p.hp <= 0) {
          outcome = 'playerDown'
          break
        }
      }
    }

    if (outcome === 'enemyDown') {
      await sleep(350)
      onEnemyDown()
    } else if (outcome === 'playerDown') {
      await sleep(350)
      handlePlayerDown(`${p.data.name}は たおれてしまった……`)
    }

    busy.current = false
    setActing(false)
  }

  async function throwFlask() {
    if (busy.current || phase !== 'fighting' || config.kind !== 'wild') return
    if (state.flasks <= 0) {
      pushLog('封獣フラスコを 持っていない！')
      return
    }
    busy.current = true
    setActing(true)
    setState((s) => ({ ...s, flasks: s.flasks - 1 }))
    pushLog('封獣フラスコを なげた！')
    // 演出: 敵が吸い込まれる→フラスコが揺れる(揺れごとにポン、と音)
    const success = brng.chance(catchChance(enemy))
    setCapture('suck')
    await sleep(520)
    setCapture('shake')
    pushLog('クルクル……')
    const shakes = success ? 3 : brng.int(1, 2) // 成功は3回粘る、失敗は途中で出る
    for (let i = 0; i < shakes; i++) {
      audio.sfx('select')
      await sleep(460)
    }

    if (success) {
      setCapture('caught')
      audio.sfx('catch')
      await sleep(600)
      setCapture(null)
      const caught: OwnedMonster = {
        uid: `m${Date.now().toString(36)}_c`,
        speciesId: enemy.data.id,
        level: enemy.level,
        exp: 0,
        talent: enemy.talent ?? 0, // 野生個体の質を引き継ぐ(レア個体はそのまま捕獲)
      }
      setState((s) => {
        const pty = getParty(s)
        const np = pty.length < PARTY_MAX ? [...pty, caught.uid] : pty // 空きがあればパーティへ、無ければ預かり
        return withCaught({ ...s, collection: [...s.collection, caught], party: np }, enemy.data.id)
      })
      const toParty = getParty(state).length < PARTY_MAX
      pushLog(`やった！ 野生の ${enemy.data.name}を 捕まえた！`, toParty ? '🔮 図鑑に 登録された。' : '🔮 図鑑に 登録された。(パーティが満員のため 預かり所へ)')
      setCaught({ id: enemy.data.id, name: enemy.data.name, type: enemy.data.type, talent: enemy.talent ?? 0 })
      setPhase('caught')
    } else {
      setCapture('break')
      audio.sfx('cancel')
      pushLog('ああっ！ 幻獣が フラスコから 出てしまった！')
      await sleep(500)
      setCapture(null)
      await enemyTurn({ ...player })
    }
    busy.current = false
    setActing(false)
  }

  function flee() {
    if (busy.current || phase !== 'fighting' || config.kind !== 'wild') return
    pushLog('うまく にげきった！')
    setPhase('fled')
  }

  // どうぐ(傷薬/上傷薬)を使う。回復して相手のターン
  async function useItem(kind: 'heal' | 'heal2') {
    if (busy.current || phase !== 'fighting') return
    if (state.items[kind] <= 0) {
      pushLog('どうぐを 持っていない！')
      return
    }
    busy.current = true
    setActing(true)
    setMenu('root')
    setState((s) => ({ ...s, items: { ...s.items, [kind]: s.items[kind] - 1 } }))
    const before = player.hp
    const amt = kind === 'heal2' ? player.maxHp : Math.floor(player.maxHp * 0.6)
    const nh = Math.min(player.maxHp, before + amt)
    setPlayer((p) => ({ ...p, hp: nh }))
    showPopup('p', `+${nh - before}`, 'heal')
    audio.sfx('heal')
    pushLog(`${kind === 'heal2' ? '上傷薬' : '傷薬'}を つかった！ ${player.data.name}の HPが 回復した。`)
    await sleep(700)
    await enemyTurn({ ...player, hp: nh })
    busy.current = false
    setActing(false)
  }

  // バトル終了時に現在HPを手持ちへ保存(敗北は満タンに回復して戻す)
  function exitBattle() {
    setState((s) => {
      const collection = s.collection.map((o) => {
        if (phase === 'lost') return { ...o, hp: undefined } // 全滅→全回復して村へ
        if (o.uid === curUid) return { ...o, hp: player.hp }
        return o
      })
      // 終了時のアクティブを、最後に出していた生存個体へ寄せる(塔の連戦・次エンカに引き継ぐ)
      let activeUid = s.activeUid
      if (phase !== 'lost') {
        const pty = getParty(s)
        const cur = collection.find((o) => o.uid === curUid)
        if (cur && pty.includes(curUid) && (cur.hp == null || cur.hp > 0)) activeUid = curUid
        else {
          const living = collection.find((o) => pty.includes(o.uid) && (o.hp == null || o.hp > 0))
          if (living) activeUid = living.uid
        }
      }
      return { ...s, collection, activeUid }
    })
    onExit(phase === 'won' || phase === 'caught') // 捕獲もヌシ解放等の「勝利扱い」に含める(パッケージD)
  }

  const remaining = isTrainer ? teamRef.current.length - enemyIndex : 0
  const biome = config.biome
  const fieldStyle = biome
    ? {
        backgroundColor: '#1c1812',
        backgroundImage: `linear-gradient(rgba(18,15,10,0.42), rgba(18,15,10,0.72)), url(${import.meta.env.BASE_URL}bg/battle/${biome}.jpg)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : undefined

  const plate = (c: Combatant, who: Side) => (
    <div className={`info-plate ${who === 'e' ? 'enemy-plate' : 'player-plate'}`}>
      <div className="ip-role">{who === 'e' ? '敵' : 'みかた'}</div>
      <div className="ip-head">
        <span className="ip-name">{c.data.name}</span>
        {(() => {
          const rar = rarityOf(c.talent)
          return rar ? <span style={{ color: rar.color, fontSize: 12, fontWeight: 700, letterSpacing: -1 }} title={rar.name}>{rar.stars}</span> : null
        })()}
        <span className="ip-lv">Lv.{c.level}</span>
      </div>
      <div className="ip-badges">
        <TypeBadge t={c.data.type} />
        {c.data.type2 && <TypeBadge t={c.data.type2} />}
        <StatusBadge status={c.status} />
        {c.ability && ABILITIES[c.ability] && <span className="cmd-sub" style={{ fontSize: 10 }}>✦{ABILITIES[c.ability].name}</span>}
        {c.guarding && <span className="cmd-sub" style={{ fontSize: 10, color: '#6fb3e2' }}>🛡防御</span>}
      </div>
      {(() => {
        const chips = (['atk', 'def', 'spd', 'mag'] as const)
          .filter((k) => c.stages?.[k])
          .map((k) => {
            const v = c.stages[k]
            const arrows = (v > 0 ? '▲' : '▼').repeat(Math.min(3, Math.abs(v)))
            return `${STAT_JP[k]}${arrows}`
          })
        return chips.length ? (
          <div className="ip-badges" style={{ fontSize: 10, fontWeight: 700 }}>
            {chips.map((t, i) => (
              <span key={i} style={{ color: t.includes('▲') ? '#e2563b' : '#6fb3e2' }}>{t}</span>
            ))}
          </div>
        ) : null
      })()}
      <HpBar c={c} />
    </div>
  )

  const combatant = (c: Combatant, who: Side) => {
    const auraCls = c.hp > 0 && c.status ? STATUS_AURA[c.status] : null
    const cap = who === 'e' ? capture : null // 捕獲演出は敵側のみ
    const spriteCapCls = cap === 'suck' || cap === 'shake' || cap === 'caught' ? 'sprite-captured' : cap === 'break' ? 'sprite-broke' : ''
    return (
    <div
      className={`combatant ${who === 'e' ? 'enemy-side' : 'player-side'} ${fx.hit === who ? (fx.strong ? 'fx-hit fx-hit-strong' : 'fx-hit') : ''} ${
        fx.atk === who ? `fx-atk-${who}` : ''
      } ${c.hp <= 0 ? 'fainted' : ''}`}
    >
      {popup?.side === who && (
        <span key={`pop${popup.key}`} className={`dmg-popup ${popup.cls}`}>
          {popup.text}
        </span>
      )}
      {auraCls && <span className={`status-aura ${auraCls}`} aria-hidden />}
      {burst?.side === who && <span key={`fx${burst.key}`} className={`move-fx fx-${burst.type}`} aria-hidden />}
      <div className={spriteCapCls}>
        <Sprite id={c.data.id} type={c.data.type} size={who === 'e' ? 146 : 166} bare flip={who === 'e'} />
      </div>
      {cap && <span className={`capture-flask cap-${cap}`} aria-hidden>🔮</span>}
      {cap === 'caught' && <span className="capture-stars" aria-hidden>✦✦✦</span>}
      <div className="ground-shadow" />
    </div>
    )
  }

  return (
    <div className="screen battle-screen">
      <div className={`battle-scene ${fx.flash ? 'flash' : ''}`} style={fieldStyle}>
        <div className="scene-intro" />
        <button
          className={`speed-toggle ${speed > 1 ? 'on' : ''}`}
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 20 }}
          onClick={() => { const n = speed > 1 ? 1 : 2; setBattleSpeed(n); setSpeed(n) }}
          title="戦闘演出の速さを切り替え"
        >
          {speed > 1 ? '⏩ 2倍速' : '▶ 等速'}
        </button>
        {isTrainer && config.kind === 'trainer' && (
          <>
            <div className="trainer-tag">⚔ {config.trainer.name}・残り{remaining}体</div>
            <div className="trainer-portrait">
              <BattlePortrait trainerId={config.trainer.id} size={132} />
            </div>
          </>
        )}
        {combatant(enemy, 'e')}
        {combatant(player, 'p')}
      </div>

      <div className="info-row">
        {plate(enemy, 'e')}
        {plate(player, 'p')}
      </div>

      <div className="battle-ui">
        <div className="msg-box">
          {log.slice(-3).map((l, i) => (
            <div key={i} className="log-line">
              {l}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>

        <div className="cmd-box">
          {phase !== 'fighting' ? (
            <button className="cmd-btn wide" onClick={exitBattle}>
              {isTower ? (phase === 'won' ? '次の階へ ▶' : '結果を見る ▶') : 'フィールドに もどる'}
            </button>
          ) : menu === 'item' ? (
            <div className="cmd-grid">
              <button className="cmd-btn move" disabled={acting || state.items.heal <= 0} onClick={() => useItem('heal')}>
                <span className="m-name">傷薬</span>
                <span className="m-meta">HP60%回復・所持{state.items.heal}</span>
              </button>
              <button className="cmd-btn move" disabled={acting || state.items.heal2 <= 0} onClick={() => useItem('heal2')}>
                <span className="m-name">上傷薬</span>
                <span className="m-meta">HP全回復・所持{state.items.heal2}</span>
              </button>
              <button className="cmd-btn back" disabled={acting} onClick={() => setMenu('root')}>
                ← もどる
              </button>
            </div>
          ) : menu === 'switch' ? (
            <div className="cmd-grid">
              {mustSwitch && <div className="cmd-sub" style={{ gridColumn: '1 / -1' }}>つぎに たたかう幻獣を 選んで！</div>}
              {switchTargets.map((o) => {
                const sp = species(o.speciesId)
                const maxhp = makeCombatant(sp, o.level, o.talent ?? 0).maxHp
                const hp = o.hp == null ? maxhp : o.hp
                return (
                  <button key={o.uid} className="cmd-btn move" disabled={acting} onClick={() => doSwitch(o.uid)}>
                    <span className="m-name">{sp.name}</span>
                    <span className="m-meta">
                      <TypeBadge t={sp.type} />Lv.{o.level}・HP {hp}/{maxhp}
                    </span>
                  </button>
                )
              })}
              {switchTargets.length === 0 && <div className="cmd-sub" style={{ gridColumn: '1 / -1' }}>交代できる仲間がいない</div>}
              {!mustSwitch && (
                <button className="cmd-btn back" disabled={acting} onClick={() => setMenu('root')}>
                  ← もどる
                </button>
              )}
            </div>
          ) : menu === 'root' ? (
            <div className="cmd-grid">
              <button className="cmd-btn" disabled={acting} onClick={() => setMenu('fight')}>
                たたかう
              </button>
              <button
                className="cmd-btn"
                disabled={acting || (state.items.heal <= 0 && state.items.heal2 <= 0)}
                onClick={() => setMenu('item')}
              >
                どうぐ<span className="cmd-sub">傷薬{state.items.heal}/上{state.items.heal2}</span>
              </button>
              <button className="cmd-btn" disabled={acting || switchTargets.length === 0} onClick={() => setMenu('switch')}>
                いれかえ<span className="cmd-sub">仲間{switchTargets.length}</span>
              </button>
              {config.kind === 'wild' && !config.tower && (
                <button className="cmd-btn" disabled={acting || state.flasks <= 0} onClick={throwFlask}>
                  つかまえる<span className="cmd-sub">フラスコ{state.flasks}</span>
                </button>
              )}
              {config.kind === 'wild' && !config.tower && (
                <button className="cmd-btn" disabled={acting} onClick={flee}>
                  にげる
                </button>
              )}
            </div>
          ) : (
            <div className="cmd-grid moves">
              {allEmpty ? (
                <button className="cmd-btn move struggle" disabled={acting} onClick={() => takeTurn(struggle)} title={struggle.desc}>
                  <span className="m-name">あがき</span>
                  <span className="m-meta">技のPPが 尽きた……反動あり</span>
                </button>
              ) : (
                playerMoves.map((mv) => {
                  const cur = ppOf(mv)
                  const lowPP = cur <= Math.ceil(maxPP(mv) * 0.25)
                  const guardBlocked = !!mv.guard && player.lastMoveId === mv.id // ガードは連続使用不可
                  // 相性ヒント(第2次品質スプリント): 攻撃技に対し敵への効き目を◎/△/✕で可視化。
                  // パッケージAで入れた相性の駆け引きを新規プレイヤーにも「見える」ようにする最安の一手。
                  const eff = mv.power > 0 ? effectiveness(mv.type, [enemy.data.type, enemy.data.type2].filter(Boolean) as string[]) : 1
                  const effTag = mv.power <= 0 ? null : eff === 0 ? { cls: 'eff-no', mark: '✕', label: '効果がない' } : eff >= 2 ? { cls: 'eff-good', mark: '◎', label: 'ばつぐん' } : eff < 1 ? { cls: 'eff-bad', mark: '△', label: 'いまひとつ' } : null
                  return (
                    <button key={mv.id} className="cmd-btn move" disabled={acting || cur <= 0 || guardBlocked} onClick={() => takeTurn(mv)} title={guardBlocked ? '連続では 使えない' : effTag ? `${mv.desc}（${effTag.label}）` : mv.desc}>
                      <span className="m-name">
                        {mv.name}
                        {effTag && <span className={`eff-tag ${effTag.cls}`} aria-label={effTag.label}>{effTag.mark}</span>}
                      </span>
                      <span className="m-meta">
                        <TypeBadge t={mv.type} />
                        {mv.category === 'status' ? (mv.guard ? '防御' : mv.heal ? '回復' : mv.buffs || mv.resetStages ? '能力' : '状態') : `威${mv.power}`}
                        <span className={`pp-tag${lowPP ? ' low' : ''}`}>PP {cur}/{maxPP(mv)}</span>
                      </span>
                    </button>
                  )
                })
              )}
              <button className="cmd-btn back" disabled={acting} onClick={() => setMenu('root')}>
                ← もどる
              </button>
            </div>
          )}
        </div>
      </div>

      {caught && (
        <GetMonsterOverlay id={caught.id} name={caught.name} type={caught.type} talent={caught.talent} onClose={() => setCaught(null)} />
      )}
    </div>
  )
}
