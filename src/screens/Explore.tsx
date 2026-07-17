import { useEffect, useMemo, useState } from 'react'
import type { BattleConfig, GameState, TrainerData } from '../types'
import type { Chest, Npc, NushiSpot, RuneSwitch } from '../game/maps'
import { hasFlag, withFlag } from '../game/state'
import { systemRng } from '../engine/rng'
import { EXPLORE_WORLDS, MAP_BACKGROUNDS, type ExploreEvent, type ExploreNode } from '../game/nodes'
import { resolveQuickBattle } from '../game/quickResolve'
import { BadgeIcon, EventIcon, ItemIcon, MenuIcon, StatIcon } from '../ui'

interface Props {
  state: GameState
  setState: (updater: (s: GameState) => GameState) => void
  onHome: () => void
  onVisitMap: (mapId: string) => void
  onStartBattle: (config: BattleConfig, auto?: boolean) => void
  onTrainer: (trainer: TrainerData, biome: string) => void
  onChest: (chest: Chest) => void
  onNushi: (nushi: NushiSpot, biome: string) => void
  onSwitch: (sw: RuneSwitch) => void
  onTalk: (npc: Npc) => void
}

const worldBadgeSlug: Record<string, string> = { forest: 'verdant', sea: 'tide', volcano: 'blaze' }

function isAvailable(event: ExploreEvent, state: GameState): boolean {
  if (event.kind === 'chest') return !hasFlag(state, `chest_${event.chest.id}`)
  if (event.kind === 'nushi') return !hasFlag(state, `nushi_${event.nushi.id}`)
  if (event.kind === 'switch') return !hasFlag(state, event.sw.flag)
  if (event.kind === 'trainer') return !state.defeatedTrainers.includes(event.trainer.id)
  return true
}

function fallbackEvent(node: ExploreNode): ExploreEvent | null {
  return node.events.find((event) => event.kind === 'battle') ?? node.events[0] ?? null
}

export default function Explore({ state, setState, onHome, onVisitMap, onStartBattle, onTrainer, onChest, onNushi, onSwitch, onTalk }: Props) {
  const unlockedWorlds = EXPLORE_WORLDS.filter((world) => !world.unlock || state.badges.includes(world.unlock))
  const [worldId, setWorldId] = useState(unlockedWorlds[0]?.id ?? EXPLORE_WORLDS[0].id)
  const world = EXPLORE_WORLDS.find((w) => w.id === worldId) ?? unlockedWorlds[0] ?? EXPLORE_WORLDS[0]
  const [nodeIndex, setNodeIndex] = useState(0)
  const node = world.nodes[Math.min(nodeIndex, world.nodes.length - 1)]
  const [eventsDone, setEventsDone] = useState(0)
  const [pending, setPending] = useState<ExploreEvent | null>(null)
  const [expeditionLog, setExpeditionLog] = useState<string[]>([])
  const rng = useMemo(() => systemRng(), [worldId, nodeIndex])
  const mustChoose = eventsDone > 0 && eventsDone % 3 === 0 && !pending
  const bgUrl = `${import.meta.env.BASE_URL}${node.background}`

  useEffect(() => {
    setNodeIndex(0)
    setEventsDone(0)
    setPending(null)
    setExpeditionLog([])
  }, [worldId])

  useEffect(() => {
    onVisitMap(node.mapId)
  }, [node.mapId, onVisitMap])

  const drawEvent = () => {
    if (mustChoose) return
    const available = node.events.filter((event) => isAvailable(event, state))
    setPending(available.length ? rng.pick(available) : fallbackEvent(node))
  }

  const consume = () => {
    if (!pending) return
    const event = pending
    setPending(null)
    setEventsDone((n) => n + 1)
    if (event.kind === 'battle') onStartBattle(event.config, false)
    else if (event.kind === 'trainer') onTrainer(event.trainer, event.biome)
    else if (event.kind === 'chest') onChest(event.chest)
    else if (event.kind === 'nushi') onNushi(event.nushi, event.biome)
    else if (event.kind === 'switch') onSwitch(event.sw)
    else onTalk(event.npc)
  }


  const runExpedition = () => {
    if (mustChoose || pending) return
    const available = node.events.filter((event) => isAvailable(event, state))
    const repeatable = node.events.filter((event) => event.kind === 'battle')
    const source = available.length ? available : repeatable
    if (!source.length) {
      setExpeditionLog(['この地では今できる遠征が見つからなかった。'])
      return
    }
    setPending(null)
    setState((current) => {
      let next = current
      const lines: string[] = [`${node.name}へ おまかせ遠征に出発。`]
      const picks: ExploreEvent[] = []
      for (let i = 0; i < 5; i++) {
        const pool = source.filter((event) => isAvailable(event, next))
        const fallback = repeatable.length ? repeatable : source
        picks.push(rng.pick(pool.length ? pool : fallback))
      }
      for (const event of picks) {
        if (event.kind === 'battle') {
          const resolved = resolveQuickBattle(next, event.config)
          next = resolved.state
          lines.push(`[${resolved.result.title}] ${event.title}`)
          lines.push(...resolved.result.lines.slice(0, 5))
        } else if (event.kind === 'chest') {
          const flag = `chest_${event.chest.id}`
          if (hasFlag(next, flag)) {
            lines.push('宝箱は空だった。')
          } else {
            next = withFlag(next, flag)
            if (event.chest.item === 'money') next = { ...next, money: next.money + event.chest.amount }
            else if (event.chest.item === 'flask') next = { ...next, flasks: next.flasks + event.chest.amount }
            else next = { ...next, items: { ...next.items, [event.chest.item]: next.items[event.chest.item] + event.chest.amount } }
            const label = event.chest.item === 'money' ? `${event.chest.amount}ゲル` : event.chest.item === 'flask' ? `フラスコx${event.chest.amount}` : `${event.chest.item}x${event.chest.amount}`
            lines.push(`宝箱から ${label} を入手。`)
          }
        } else if (event.kind === 'switch') {
          if (!hasFlag(next, event.sw.flag)) {
            next = withFlag(next, event.sw.flag)
            lines.push(`${event.title}を起動。近道が開いた。`)
          }
        } else if (event.kind === 'talk') {
          lines.push(`${event.title}の話を聞いた。`)
        } else if (event.kind === 'nushi') {
          lines.push('強いヌシの気配を発見。挑戦は手動で行える。')
        } else if (event.kind === 'trainer') {
          lines.push(`${event.trainer.name}を発見。記章戦は手動で挑める。`)
        }
      }
      setExpeditionLog(lines.slice(0, 24))
      return next
    })
    setEventsDone((n) => n + 5)
  }


  const goNext = () => {
    setPending(null)
    setEventsDone(0)
    setNodeIndex((i) => Math.min(world.nodes.length - 1, i + 1))
  }

  const returnHome = () => {
    setPending(null)
    setEventsDone(0)
    onHome()
  }

  return (
    <div className="screen explore-screen">
      <header className="home-header">
        <h1>探索</h1>
        <div className="home-stats">
          <span><StatIcon kind="dex" size={22} /> {state.caught.length}</span>
          <span><StatIcon kind="badge" size={22} /> {state.badges.length}</span>
          <span><ItemIcon kind="money" size={22} /> {state.money}</span>
        </div>
      </header>

      <div className="explore-backdrops" aria-hidden="true">
        {MAP_BACKGROUNDS.map((path) => (
          <span key={path} style={{ backgroundImage: `url(${import.meta.env.BASE_URL}${path})` }} />
        ))}
      </div>

      <section className="explore-worlds">
        {EXPLORE_WORLDS.map((w) => {
          const unlocked = !w.unlock || state.badges.includes(w.unlock)
          const cleared = state.defeatedTrainers.includes(w.boss)
          return (
            <button
              key={w.id}
              className={`explore-world ${w.id === world.id ? 'on' : ''}${unlocked ? '' : ' locked'}`}
              disabled={!unlocked}
              onClick={() => setWorldId(w.id)}
            >
              <span className="explore-world-icon">{unlocked ? <BadgeIcon slug={worldBadgeSlug[w.id] ?? 'verdant'} size={34} /> : <MenuIcon kind="lock" size={30} />}</span>
              <span>
                <b>{w.name}</b>
                <small>{cleared ? '踏破済み' : unlocked ? w.desc : `${w.unlock}で解放`}</small>
              </span>
            </button>
          )
        })}
      </section>

      <section className="explore-node" style={{ backgroundImage: `linear-gradient(rgba(18,15,10,0.26), rgba(18,15,10,0.82)), url(${bgUrl})` }}>
        <div className="explore-node-head">
          <div>
            <div className="home-hero-kicker">深度 {node.depth}</div>
            <h2>{node.name}</h2>
            <p>{node.subtitle}</p>
          </div>
          <div className="explore-depth-dots" aria-label="探索深度">
            {world.nodes.map((n, i) => <span key={n.id} className={i <= nodeIndex ? 'on' : ''} />)}
          </div>
        </div>

        <div className="explore-event-panel">
          {pending ? (
            <div className={`explore-event ${pending.kind}`}>
              <span className="explore-event-icon"><EventIcon kind={pending.kind} size={42} /></span>
              <div>
                <h3>{pending.title}</h3>
                <p>{pending.desc}</p>
              </div>
              <div className="explore-event-actions">
                {pending.kind === 'battle' && (
                  <button className="home-primary-cta" onClick={() => { const ev = pending; setPending(null); setEventsDone((n) => n + 1); onStartBattle(ev.config, true) }}>
                    オートで戦う
                    <span>観るだけで決着・捕獲チャンスあり</span>
                  </button>
                )}
                <button className="home-secondary-cta" onClick={consume}>
                  {pending.kind === 'battle' ? '手動で戦う' : pending.kind === 'trainer' || pending.kind === 'nushi' ? '挑む' : '対応する'}
                </button>
              </div>
            </div>
          ) : mustChoose ? (
            <div className="explore-choice">
              <h3>探索を区切る</h3>
              <p>3つの出来事を越えた。さらに奥へ進むほど、出会いは濃くなる。</p>
              <div className="home-hero-actions">
                <button className="home-primary-cta" onClick={goNext} disabled={nodeIndex >= world.nodes.length - 1}>
                  さらに進む
                  <span>{nodeIndex >= world.nodes.length - 1 ? 'この地の最奥です' : '深度を1つ上げる'}</span>
                </button>
                <button className="home-secondary-cta" onClick={returnHome}>帰還する</button>
              </div>
            </div>
          ) : (
            <div className="explore-choice">
              <h3><BadgeIcon slug={worldBadgeSlug[world.id] ?? 'verdant'} size={30} /> {world.name}</h3>
              <p>歩き回らず、次の出来事へ。戦闘・宝箱・ヌシ・出会いが待っている。</p>
              <div className="home-hero-actions">
                <button className="home-primary-cta" onClick={runExpedition}>
                  おまかせ遠征
                  <span>5回ぶんの戦闘・捕獲・収集をまとめて処理</span>
                </button>
                <button className="home-secondary-cta" onClick={drawEvent}>
                  1件ずつ探索
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {expeditionLog.length > 0 && (
        <section className="items-pane" style={{ marginTop: 14 }}>
          <h3 className="section-title"><MenuIcon kind="field" size={24} /> 遠征結果</h3>
          {expeditionLog.map((line, i) => (
            <div className="item-row" key={`${i}-${line}`}>
              <span className="item-ico"><EventIcon kind={i === 0 ? 'switch' : 'battle'} size={30} /></span>
              <div className="grow"><div className="item-desc">{line}</div></div>
            </div>
          ))}
        </section>
      )}

      <div className="moves" style={{ marginTop: 14 }}>
        <button className="move-btn subtle" onClick={returnHome}>
          <span className="move-name"><MenuIcon kind="home" size={24} /> 拠点へ戻る</span>
          <span className="move-meta">手持ち・道具・記録を確認する</span>
        </button>
        <button className="move-btn" onClick={() => { setNodeIndex(0); setEventsDone(0); setPending(null) }}>
          <span className="move-name"><MenuIcon kind="refresh" size={24} /> この地を見直す</span>
          <span className="move-meta">探索の流れをリセット</span>
        </button>
      </div>
    </div>
  )
}
