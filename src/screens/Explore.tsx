import { useEffect, useMemo, useState } from 'react'
import type { BattleConfig, GameState, TrainerData } from '../types'
import type { Chest, Npc, NushiSpot, RuneSwitch } from '../game/maps'
import { hasFlag } from '../game/state'
import { systemRng } from '../engine/rng'
import { EXPLORE_WORLDS, MAP_BACKGROUNDS, type ExploreEvent, type ExploreNode } from '../game/nodes'
import { ItemIcon } from '../ui'

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

const eventIcon: Record<ExploreEvent['kind'], string> = {
  battle: '⚔️',
  chest: '🎁',
  nushi: '🐾',
  switch: '🔷',
  talk: '💬',
  trainer: '🎖',
}

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

export default function Explore({ state, onHome, onVisitMap, onStartBattle, onTrainer, onChest, onNushi, onSwitch, onTalk }: Props) {
  const unlockedWorlds = EXPLORE_WORLDS.filter((world) => !world.unlock || state.badges.includes(world.unlock))
  const [worldId, setWorldId] = useState(unlockedWorlds[0]?.id ?? EXPLORE_WORLDS[0].id)
  const world = EXPLORE_WORLDS.find((w) => w.id === worldId) ?? unlockedWorlds[0] ?? EXPLORE_WORLDS[0]
  const [nodeIndex, setNodeIndex] = useState(0)
  const node = world.nodes[Math.min(nodeIndex, world.nodes.length - 1)]
  const [eventsDone, setEventsDone] = useState(0)
  const [pending, setPending] = useState<ExploreEvent | null>(null)
  const rng = useMemo(() => systemRng(), [worldId, nodeIndex])
  const mustChoose = eventsDone > 0 && eventsDone % 3 === 0 && !pending
  const bgUrl = `${import.meta.env.BASE_URL}${node.background}`

  useEffect(() => {
    setNodeIndex(0)
    setEventsDone(0)
    setPending(null)
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
          <span>📖 {state.caught.length}</span>
          <span>🎖 {state.badges.length}</span>
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
              <span className="explore-world-icon">{unlocked ? w.icon : '🔒'}</span>
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
              <span className="explore-event-icon">{eventIcon[pending.kind]}</span>
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
              <h3>{world.icon} {world.name}</h3>
              <p>歩き回らず、次の出来事へ。戦闘・宝箱・ヌシ・出会いが待っている。</p>
              <button className="home-primary-cta" onClick={drawEvent}>
                探索を進める
                <span>{3 - (eventsDone % 3)}イベント後に 進む/帰還を選択</span>
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="moves" style={{ marginTop: 14 }}>
        <button className="move-btn subtle" onClick={returnHome}>
          <span className="move-name">🏠 拠点へ戻る</span>
          <span className="move-meta">手持ち・道具・記録を確認する</span>
        </button>
        <button className="move-btn" onClick={() => { setNodeIndex(0); setEventsDone(0); setPending(null) }}>
          <span className="move-name">🔁 この地を見直す</span>
          <span className="move-meta">探索の流れをリセット</span>
        </button>
      </div>
    </div>
  )
}
