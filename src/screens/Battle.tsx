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
import {
  DEX,
  catchChance,
  expReward,
  grantExp,
  species,
  today,
  withCaught,
  withSeen,
} from '../game/state'
import { getMoveset } from '../game/moves'
import * as audio from '../game/audio'
import { BattlePortrait, GetMonsterOverlay, HpBar, Sprite, StatusBadge, TypeBadge } from '../ui'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const randInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1))

// 技の最大PP(威力/カテゴリから導出)
const maxPP = (m: Move): number =>
  m.category === 'status' ? 10 : m.power >= 85 ? 5 : m.power >= 75 ? 10 : m.power <= 40 ? 35 : 20
const initPP = (moves: Move[]): Record<string, number> =>
  Object.fromEntries(moves.map((m) => [m.id, maxPP(m)]))

function makeWild(playerLevel: number, config: Extract<BattleConfig, { kind: 'wild' }>): Combatant {
  // DEVデモ用: localStorage.demo_enemy が指定されていればその種を出す(本番では無効)
  if (import.meta.env.DEV) {
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
  const pool = config.pool?.length
    ? config.pool
    : DEX.filter((d) => d.role !== 'legendary' && d.stage <= 2).map((d) => d.id)
  const id = pool[Math.floor(Math.random() * pool.length)]
  const level =
    config.min != null && config.max != null
      ? randInt(config.min, config.max)
      : clamp(playerLevel + Math.floor(Math.random() * 4) - 2, 2, 100)
  return makeCombatant(species(id), level)
}

type Phase = 'fighting' | 'won' | 'lost' | 'caught' | 'fled'
type Side = 'p' | 'e'
interface Fx { atk?: Side; hit?: Side; flash?: boolean }
interface Popup { side: Side; text: string; cls: string; key: number }

interface Props {
  active: OwnedMonster
  config: BattleConfig
  state: GameState
  setState: (updater: (s: GameState) => GameState) => void
  onExit: () => void
}

export default function Battle({ active, config, state, setState, onExit }: Props) {
  const isTrainer = config.kind === 'trainer'
  const teamRef = useRef<Combatant[]>(
    config.kind === 'trainer'
      ? config.trainer.team.map((t) => makeCombatant(species(t.speciesId), t.level))
      : [],
  )
  const ownedRef = useRef<OwnedMonster>({ ...active })

  const [player, setPlayer] = useState<Combatant>(() => {
    const c = makeCombatant(species(active.speciesId), active.level)
    if (typeof active.hp === 'number' && active.hp > 0) c.hp = Math.min(c.maxHp, active.hp)
    return c
  })
  const [enemy, setEnemy] = useState<Combatant>(() =>
    config.kind === 'trainer' ? teamRef.current[0] : makeWild(active.level, config),
  )
  const [enemyIndex, setEnemyIndex] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('fighting')
  const [menu, setMenu] = useState<'root' | 'fight' | 'switch' | 'item'>('root')
  const [curUid, setCurUid] = useState(active.uid)
  const [mustSwitch, setMustSwitch] = useState(false)
  const [acting, setActing] = useState(false)
  const [caught, setCaught] = useState<{ id: string; name: string; type: string } | null>(null)

  // 手持ちの生存メンバー(現在出ている個体を除く)
  const mk = (o: OwnedMonster): Combatant => {
    const c = makeCombatant(species(o.speciesId), o.level)
    if (typeof o.hp === 'number' && o.hp > 0) c.hp = Math.min(c.maxHp, o.hp)
    return c
  }
  const switchTargets = state.collection.filter((o) => o.uid !== curUid && (o.hp == null || o.hp > 0))
  const [fx, setFx] = useState<Fx>({})
  const [popup, setPopup] = useState<Popup | null>(null)
  const busy = useRef(false)
  const popupKey = useRef(0)
  const logEndRef = useRef<HTMLDivElement>(null)

  const playerMoves = useMemo(() => getMoveset(player.data, player.level), [player.data, player.level])
  const [pp, setPp] = useState<Record<string, number>>(() => initPP(getMoveset(player.data, player.level)))
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

  function pushLog(...lines: string[]) {
    setLog((prev) => [...prev, ...lines])
    requestAnimationFrame(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }))
  }
  function showPopup(side: Side, text: string, cls: string) {
    popupKey.current += 1
    setPopup({ side, text, cls, key: popupKey.current })
    setTimeout(() => setPopup((p) => (p && p.key === popupKey.current ? null : p)), 850)
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

  function chooseEnemyMove(p: Combatant, e: Combatant): Move {
    const ms = getMoveset(e.data, e.level)
    const r = Math.random()
    for (const sm of ms.filter((x) => x.category === 'status')) {
      if (sm.heal && e.hp < e.maxHp * 0.4 && r < 0.6) return sm
      if (sm.inflict && !p.status && r < 0.35) return sm
    }
    const dmg = ms.filter((x) => x.category !== 'status')
    const pTypes = [p.data.type, p.data.type2].filter(Boolean) as string[]
    let best = dmg[0]
    let bestScore = -1
    for (const mv of dmg) {
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
    const pre = preMoveCheck(e)
    if (pre.status !== e.status || pre.statusTurns !== e.statusTurns) {
      setEnemy((prev) => ({ ...prev, status: pre.status, statusTurns: pre.statusTurns }))
    }
    if (pre.msg) pushLog(pre.msg)
    if (!pre.act) return
    const eMove = chooseEnemyMove(p, e)
    setFx({ atk: 'e' })
    await sleep(160)
    pushLog(`${isTrainer ? '' : '野生の '}${e.data.name}の ${eMove.name}！`)
    if (Math.random() > eMove.acc) {
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
        setPlayer((prev) => ({ ...prev, status: st, statusTurns: st === 'ねむり' ? randInt(2, 3) : 0 }))
        pushLog(st === '灰化' ? `${p.data.name}は 灰化しはじめた……` : `${p.data.name}は ${st}状態になった！`)
      }
      setFx({})
      await sleep(300)
      return
    }
    const r = calcDamage(e, p, eMove)
    const pHp = Math.max(0, p.hp - r.damage)
    setPlayer((prev) => ({ ...prev, hp: pHp }))
    setFx({ hit: 'p', flash: r.eff >= 2 })
    showPopup('p', `-${r.damage}`, r.eff >= 2 ? 'crit' : 'dmg')
    audio.sfx(r.eff >= 2 ? 'crit' : 'hit')
    const msg = effMessage(r.eff)
    if (msg) pushLog(msg)
    await sleep(440)
    setFx({})
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
    setPp(initPP(getMoveset(newC.data, newC.level)))
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
      tgt.statusTurns = status === 'ねむり' ? randInt(2, 3) : 0
      sync(side)
      pushLog(status === '灰化' ? `${tgt.data.name}は 灰化しはじめた……` : `${tgt.data.name}は ${status}状態になった！`)
    }

    const doMove = async (side: Side, move: Move) => {
      const atkSide = side
      const defSide: Side = side === 'p' ? 'e' : 'p'
      const attacker = side === 'p' ? p : e
      const defender = side === 'p' ? e : p

      setFx({ atk: atkSide })
      await sleep(160)
      pushLog(`${attacker.data.name}の ${move.name}！`)

      if (Math.random() > move.acc) {
        setFx({})
        pushLog('しかし 当たらなかった！')
        await sleep(250)
        return
      }

      if (move.category === 'status') {
        if (move.heal) {
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
        } else if (move.inflict) {
          applyInflict(defSide, move.inflict.status)
        }
        await sleep(420)
        setFx({})
        return
      }

      const r = calcDamage(attacker, defender, move)
      defender.hp = Math.max(0, defender.hp - r.damage)
      setFx({ hit: defSide, flash: r.eff >= 2 })
      showPopup(defSide, `-${r.damage}`, r.eff >= 2 ? 'crit' : 'dmg')
      audio.sfx(r.eff >= 2 ? 'crit' : 'hit')
      sync(defSide)
      const msg = effMessage(r.eff)
      if (msg) pushLog(msg)
      await sleep(440)
      setFx({})
      if (defender.hp > 0 && move.inflict && Math.random() < move.inflict.chance) {
        applyInflict(defSide, move.inflict.status)
        await sleep(250)
      }
      if (move.id === 'struggle' && attacker.hp > 0) {
        const rec = Math.max(1, Math.floor(r.damage * 0.25))
        attacker.hp = Math.max(0, attacker.hp - rec)
        sync(atkSide)
        showPopup(atkSide, `-${rec}`, 'dmg')
        pushLog(`${attacker.data.name}は 反動を受けた！`)
        await sleep(320)
      }
    }

    const eMove = chooseEnemyMove(p, e)
    const pFirst = effectiveSpeed(p) >= effectiveSpeed(e)
    const queue: [Side, Move][] = pFirst ? [['p', pMove], ['e', eMove]] : [['e', eMove], ['p', pMove]]
    let outcome: 'none' | 'enemyDown' | 'playerDown' = 'none'

    for (const [side, mv] of queue) {
      if (outcome !== 'none') break
      const actor = side === 'p' ? p : e
      if (actor.hp <= 0) continue
      await sleep(420)
      const pre = preMoveCheck(actor)
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
    pushLog('封獣フラスコを なげた！ ……', 'クルクル……')
    await sleep(900)

    if (Math.random() < catchChance(enemy)) {
      const caught: OwnedMonster = {
        uid: `m${Date.now().toString(36)}_c`,
        speciesId: enemy.data.id,
        level: enemy.level,
        exp: 0,
      }
      setState((s) => withCaught({ ...s, collection: [...s.collection, caught] }, enemy.data.id))
      audio.sfx('catch')
      pushLog(`やった！ 野生の ${enemy.data.name}を 捕まえた！`, '🔮 図鑑に 登録された。')
      setCaught({ id: enemy.data.id, name: enemy.data.name, type: enemy.data.type })
      setPhase('caught')
    } else {
      pushLog('ああっ！ 幻獣が フラスコから 出てしまった！')
      await sleep(400)
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
    setState((s) => ({
      ...s,
      collection: s.collection.map((o) => {
        if (phase === 'lost') return { ...o, hp: undefined } // 全滅→全回復して村へ
        if (o.uid === curUid) return { ...o, hp: player.hp }
        return o
      }),
    }))
    onExit()
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
        <span className="ip-lv">Lv.{c.level}</span>
      </div>
      <div className="ip-badges">
        <TypeBadge t={c.data.type} />
        {c.data.type2 && <TypeBadge t={c.data.type2} />}
        <StatusBadge status={c.status} />
      </div>
      <HpBar c={c} />
    </div>
  )

  const combatant = (c: Combatant, who: Side) => (
    <div
      className={`combatant ${who === 'e' ? 'enemy-side' : 'player-side'} ${fx.hit === who ? 'fx-hit' : ''} ${
        fx.atk === who ? `fx-atk-${who}` : ''
      } ${c.hp <= 0 ? 'fainted' : ''}`}
    >
      {popup?.side === who && (
        <span key={popup.key} className={`dmg-popup ${popup.cls}`}>
          {popup.text}
        </span>
      )}
      <Sprite id={c.data.id} type={c.data.type} size={who === 'e' ? 146 : 166} bare flip={who === 'e'} />
      <div className="ground-shadow" />
    </div>
  )

  return (
    <div className="screen battle-screen">
      <div className={`battle-scene ${fx.flash ? 'flash' : ''}`} style={fieldStyle}>
        <div className="scene-intro" />
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
              フィールドに もどる
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
                const maxhp = makeCombatant(sp, o.level).maxHp
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
              {config.kind === 'wild' && (
                <button className="cmd-btn" disabled={acting || state.flasks <= 0} onClick={throwFlask}>
                  つかまえる<span className="cmd-sub">フラスコ{state.flasks}</span>
                </button>
              )}
              {config.kind === 'wild' && (
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
                  return (
                    <button key={mv.id} className="cmd-btn move" disabled={acting || cur <= 0} onClick={() => takeTurn(mv)} title={mv.desc}>
                      <span className="m-name">{mv.name}</span>
                      <span className="m-meta">
                        <TypeBadge t={mv.type} />
                        {mv.category === 'status' ? (mv.heal ? '回復' : '状態') : `威${mv.power}`}
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
        <GetMonsterOverlay id={caught.id} name={caught.name} type={caught.type} onClose={() => setCaught(null)} />
      )}
    </div>
  )
}
