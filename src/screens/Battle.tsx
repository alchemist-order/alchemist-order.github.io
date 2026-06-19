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
  withCaught,
  withSeen,
} from '../game/state'
import { getMoveset } from '../game/moves'
import { HpBar, Sprite, StatusBadge, TypeBadge } from '../ui'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const randInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1))

function makeWild(playerLevel: number, config: Extract<BattleConfig, { kind: 'wild' }>): Combatant {
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

  const [player, setPlayer] = useState<Combatant>(() => makeCombatant(species(active.speciesId), active.level))
  const [enemy, setEnemy] = useState<Combatant>(() =>
    config.kind === 'trainer' ? teamRef.current[0] : makeWild(active.level, config),
  )
  const [enemyIndex, setEnemyIndex] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('fighting')
  const [acting, setActing] = useState(false)
  const [fx, setFx] = useState<Fx>({})
  const [popup, setPopup] = useState<Popup | null>(null)
  const busy = useRef(false)
  const popupKey = useRef(0)
  const logEndRef = useRef<HTMLDivElement>(null)

  const playerMoves = useMemo(() => getMoveset(player.data, player.level), [player.data, player.level])

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
      setState((s) => ({
        ...s,
        wins: s.wins + 1,
        badges: s.badges.includes(config.trainer.badge) ? s.badges : [...s.badges, config.trainer.badge],
        defeatedTrainers: s.defeatedTrainers.includes(config.trainer.id)
          ? s.defeatedTrainers
          : [...s.defeatedTrainers, config.trainer.id],
      }))
      pushLog(`${enemy.data.name}を たおした！`, ...expMsgs, `${config.trainer.name}に かった！`, `🎖 ${config.trainer.badge}を 手に入れた！`)
      setPhase('won')
      return
    }
    setState((s) => ({ ...s, wins: s.wins + 1, flasks: s.flasks + 1 }))
    pushLog(`野生の ${enemy.data.name} を たおした！`, ...expMsgs, '🔮 封獣フラスコを 1個 拾った！')
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

  async function takeTurn(pMove: Move) {
    if (busy.current || phase !== 'fighting') return
    busy.current = true
    setActing(true)

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
      sync(defSide)
      const msg = effMessage(r.eff)
      if (msg) pushLog(msg)
      await sleep(440)
      setFx({})
      if (defender.hp > 0 && move.inflict && Math.random() < move.inflict.chance) {
        applyInflict(defSide, move.inflict.status)
        await sleep(250)
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
      pushLog(`${player.data.name}は たおれてしまった……`, '💀 アジトに もどされた。')
      setPhase('lost')
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
      pushLog(`やった！ 野生の ${enemy.data.name}を 捕まえた！`, '🔮 図鑑に 登録された。')
      setPhase('caught')
    } else {
      pushLog('ああっ！ 幻獣が フラスコから 出てしまった！')
      await sleep(400)
      const e = { ...enemy }
      const p = { ...player }
      const eMove = chooseEnemyMove(p, e)
      setFx({ atk: 'e' })
      await sleep(160)
      pushLog(`野生の ${e.data.name}の ${eMove.name}！`)
      if (eMove.category !== 'status' && Math.random() <= eMove.acc) {
        const r = calcDamage(e, p, eMove)
        const pHp = Math.max(0, p.hp - r.damage)
        setPlayer((prev) => ({ ...prev, hp: pHp }))
        setFx({ hit: 'p', flash: r.eff >= 2 })
        showPopup('p', `-${r.damage}`, r.eff >= 2 ? 'crit' : 'dmg')
        const msg = effMessage(r.eff)
        if (msg) pushLog(msg)
        await sleep(440)
        if (pHp <= 0) {
          pushLog(`${player.data.name}は たおれてしまった……`)
          setPhase('lost')
        }
      }
      setFx({})
    }
    busy.current = false
    setActing(false)
  }

  function flee() {
    if (busy.current || phase !== 'fighting' || config.kind !== 'wild') return
    pushLog('うまく にげきった！')
    setPhase('fled')
  }

  const remaining = isTrainer ? teamRef.current.length - enemyIndex : 0

  const card = (c: Combatant, side: Side) => (
    <div
      className={`card ${side === 'e' ? 'enemy' : 'player'} ${fx.hit === side ? 'fx-hit' : ''} ${
        fx.atk === side ? `fx-atk-${side}` : ''
      } ${c.hp <= 0 ? 'fainted' : ''}`}
    >
      {popup?.side === side && (
        <span key={popup.key} className={`dmg-popup ${popup.cls}`}>
          {popup.text}
        </span>
      )}
      <div className="card-head">
        <span className="mon-name">{c.data.name}</span>
        <span className="mon-lv">Lv.{c.level}</span>
      </div>
      <div className="row">
        <Sprite id={c.data.id} type={c.data.type} size={64} />
        <div className="grow">
          <div className="badges">
            <TypeBadge t={c.data.type} />
            {c.data.type2 && <TypeBadge t={c.data.type2} />}
            <StatusBadge status={c.status} />
          </div>
          <HpBar c={c} />
        </div>
      </div>
    </div>
  )

  return (
    <div className="screen">
      {isTrainer && config.kind === 'trainer' && (
        <div className="trainer-banner">
          ⚔ {config.trainer.name} — 残り {remaining} 体
        </div>
      )}
      <div className={`battlefield bg-${player.data.type} ${fx.flash ? 'flash' : ''}`}>
        {card(enemy, 'e')}
        <div className="vs">VS</div>
        {card(player, 'p')}
      </div>

      <div className="log">
        {log.map((l, i) => (
          <div key={i} className="log-line">
            {l}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      {phase === 'fighting' ? (
        <>
          <div className="moves moves-grid">
            {playerMoves.map((mv) => (
              <button key={mv.id} className="move-btn" disabled={acting} onClick={() => takeTurn(mv)} title={mv.desc}>
                <span className="move-name">{mv.name}</span>
                <span className="move-meta">
                  <TypeBadge t={mv.type} />
                  {mv.category === 'status'
                    ? mv.heal
                      ? '回復'
                      : '状態'
                    : `威力${mv.power}`}
                  ・命中{Math.round(mv.acc * 100)}
                </span>
              </button>
            ))}
          </div>
          {config.kind === 'wild' && (
            <div className="moves" style={{ marginTop: 10 }}>
              <button className="move-btn" disabled={acting || state.flasks <= 0} onClick={throwFlask}>
                <span className="move-name">封獣フラスコを投げる</span>
                <span className="move-meta">残り{state.flasks}個・捕獲率およそ{Math.round(catchChance(enemy) * 100)}%</span>
              </button>
              <button className="move-btn ghost" disabled={acting} onClick={flee}>
                にげる
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="result-actions">
          <button className="move-btn" onClick={onExit}>
            フィールドに もどる
          </button>
        </div>
      )}
    </div>
  )
}
