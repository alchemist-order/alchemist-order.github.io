import { useEffect, useMemo, useState } from 'react'
import type { BattleConfig, GameState, TrainerData } from '../types'
import type { Chest, Npc, NushiSpot, RuneSwitch } from '../game/maps'
import { grantReward, hasFlag, species, withFlag } from '../game/state'
import { systemRng } from '../engine/rng'
import { EXPLORE_WORLDS, type ExploreEvent, type ExploreNode } from '../game/nodes'
import { resolveQuickBattle } from '../game/quickResolve'
import { BadgeIcon, EventIcon, ItemIcon, MenuIcon, Sprite, StatIcon, TypeBadge } from '../ui'

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

interface ExploreSummary {
  battles: number
  catches: number
  newDex: number
  gold: number
  chain?: string
  captured: { id: string; name: string; type: string; talent: number; mutant?: boolean; newDex: boolean }[]
  drops: { kind: string; label: string; amount: number }[]
}

function sessionSnapshot(s: GameState) {
  return {
    wins: s.wins,
    caught: s.caught.length,
    caughtIds: [...s.caught],
    collection: s.collection.length,
    money: s.money,
    flasks: s.flasks,
    items: { ...s.items },
    mats: { ...(s.mats ?? { talentStone: 0, slotCharm: 0 }) },
  }
}

const worldBadgeSlug: Record<string, string> = { forest: 'verdant', sea: 'tide', volcano: 'blaze', deep: 'alchemy' }

function dropRateLabel(rate: number): string {
  if (rate >= 0.12) return 'よく出る'
  if (rate >= 0.06) return 'ときどき'
  return 'まれに'
}

const DROP_LABELS: Record<string, string> = {
  money: 'ゲル',
  flask: '封獣フラスコ',
  heal: '傷薬',
  heal2: '上傷薬',
  heal3: '特上傷薬',
  exp_tome: '経験の書',
  evo_dust: '進化の香粉',
  trait_elixir: '特性霊薬',
  catch_charm: '捕獲の護符',
  revive: '蘇生薬',
  evo_incense: '進化の秘香',
  talentStone: '才能石',
  slotCharm: 'スロット護符',
}
function dropLabel(key: string): string { return DROP_LABELS[key] ?? key }

function grantStageDrop(state: GameState, key: string): GameState {
  if (key === 'money') return grantReward(state, { money: 100 })
  if (key === 'flask') return grantReward(state, { flask: 1 })
  if (key === 'heal') return grantReward(state, { heal: 1 })
  if (key === 'heal2') return grantReward(state, { heal2: 1 })
  if (key === 'heal3') return grantReward(state, { heal3: 1 })
  if (key === 'exp_tome') return grantReward(state, { exp_tome: 1 })
  if (key === 'evo_dust') return grantReward(state, { evo_dust: 1 })
  if (key === 'trait_elixir') return grantReward(state, { trait_elixir: 1 })
  if (key === 'catch_charm') return grantReward(state, { catch_charm: 1 })
  if (key === 'revive') return grantReward(state, { revive: 1 })
  if (key === 'evo_incense') return grantReward(state, { evo_incense: 1 })
  if (key === 'talentStone') return grantReward(state, { talentStone: 1 })
  if (key === 'slotCharm') return grantReward(state, { slotCharm: 1 })
  return state
}

function stageUnlocked(stage: ExploreNode['stage'], state: GameState): boolean {
  const unlock = stage.unlock
  if (unlock.prev && !hasFlag(state, `visited_node_${unlock.prev}`)) return false
  if (unlock.badge && !state.badges.includes(unlock.badge)) return false
  if (unlock.badges && state.badges.length < unlock.badges) return false
  return true
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

export default function Explore({ state, setState, onHome, onVisitMap, onStartBattle, onTrainer, onChest, onNushi, onSwitch, onTalk }: Props) {
  const unlockedWorlds = EXPLORE_WORLDS.filter((world) => !world.unlock || state.badges.includes(world.unlock))
  const [worldId, setWorldId] = useState(unlockedWorlds[0]?.id ?? EXPLORE_WORLDS[0].id)
  const world = EXPLORE_WORLDS.find((w) => w.id === worldId) ?? unlockedWorlds[0] ?? EXPLORE_WORLDS[0]
  const [nodeIndex, setNodeIndex] = useState(0)
  const node = world.nodes[Math.min(nodeIndex, world.nodes.length - 1)]
  const [eventsDone, setEventsDone] = useState(0)
  const [pending, setPending] = useState<ExploreEvent | null>(null)
  const [expeditionLog, setExpeditionLog] = useState<string[]>([])
  const [summary, setSummary] = useState<ExploreSummary | null>(null)
  const [sessionStart, setSessionStart] = useState(() => sessionSnapshot(state))
  const rng = useMemo(() => systemRng(), [worldId, nodeIndex])
  const mustChoose = eventsDone > 0 && eventsDone % 3 === 0 && !pending
  const bgUrl = `${import.meta.env.BASE_URL}${node.background}`
  const visitedFlag = `visited_node_${node.id}`

  useEffect(() => {
    setNodeIndex(0)
    setEventsDone(0)
    setPending(null)
    setExpeditionLog([])
    setSummary(null)
    setSessionStart(sessionSnapshot(state))
  }, [worldId])

  useEffect(() => {
    onVisitMap(node.mapId)
  }, [node.mapId, onVisitMap])
  const buildSummary = (from: typeof sessionStart, to: GameState): ExploreSummary | null => {
    const captured = to.collection.slice(from.collection).map((owned) => {
      const sp = species(owned.speciesId)
      return { id: owned.speciesId, name: sp.name, type: sp.type, talent: owned.talent ?? 0, mutant: owned.mutant, newDex: !from.caughtIds.includes(owned.speciesId) }
    })
    const drops: ExploreSummary['drops'] = []
    const flaskDelta = Math.max(0, to.flasks - from.flasks)
    if (flaskDelta) drops.push({ kind: 'flask', label: dropLabel('flask'), amount: flaskDelta })
    for (const [kind, amount] of Object.entries(to.items)) {
      const delta = Math.max(0, amount - (from.items[kind as keyof typeof from.items] ?? 0))
      if (delta) drops.push({ kind, label: dropLabel(kind), amount: delta })
    }
    for (const [kind, amount] of Object.entries(to.mats ?? {})) {
      const delta = Math.max(0, amount - (from.mats[kind as keyof typeof from.mats] ?? 0))
      if (delta) drops.push({ kind, label: dropLabel(kind), amount: delta })
    }
    const next: ExploreSummary = {
      battles: Math.max(0, to.wins - from.wins),
      catches: Math.max(0, to.collection.length - from.collection),
      newDex: Math.max(0, to.caught.length - from.caught),
      gold: Math.max(0, to.money - from.money),
      chain: to.chain ? `${speciesName(to.chain.speciesId)} ?${to.chain.count}` : undefined,
      captured,
      drops,
    }
    return next.battles || next.catches || next.newDex || next.gold || next.drops.length ? next : null
  }

  const speciesName = (id: string): string => species(id).name

  const drawEvent = () => {
    if (mustChoose) return
    const available = node.events.filter((event) => isAvailable(event, state))
    setPending(available.length ? rng.pick(available) : fallbackEvent(node))
  }

  const consume = () => {
    if (!pending) return
    const event = pending
    setState((s) => withFlag(withFlag(s, visitedFlag), 'ftue_explored'))
    setPending(null)
    setEventsDone((n) => n + 1)
    if (event.kind === 'battle') onStartBattle({ ...event.config, chain: state.chain }, false)
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
      let next = withFlag(withFlag(current, visitedFlag), 'ftue_explored')
      const lines: string[] = [`${node.name}へ おまかせ遠征に出発。`]
      const picks: ExploreEvent[] = []
      for (let i = 0; i < 5; i++) {
        const pool = source.filter((event) => isAvailable(event, next))
        const fallback = repeatable.length ? repeatable : source
        picks.push(rng.pick(pool.length ? pool : fallback))
      }
      for (const event of picks) {
        if (event.kind === 'battle') {
          const resolved = resolveQuickBattle(next, { ...event.config, chain: next.chain })
          next = resolved.state
          lines.push(`[${resolved.result.title}] ${event.title}`)
          lines.push(...resolved.result.lines.slice(0, 5))
          if (resolved.result.won) {
            for (const drop of node.stage.dropTable) {
              if (rng.chance(drop.rate)) {
                next = grantStageDrop(next, drop.key)
                lines.push(`${dropLabel(drop.key)}を拾った。`)
              }
            }
          }
        } else if (event.kind === 'chest') {
          const flag = `chest_${event.chest.id}`
          if (hasFlag(next, flag)) {
            lines.push('宝箱は空だった。')
          } else {
            next = withFlag(next, flag)
            if (event.chest.item === 'money') next = { ...next, money: next.money + event.chest.amount }
            else if (event.chest.item === 'flask') next = { ...next, flasks: next.flasks + event.chest.amount }
            else next = { ...next, items: { ...next.items, [event.chest.item]: next.items[event.chest.item] + event.chest.amount } }
            const label = event.chest.item === 'money' ? `${event.chest.amount}ゲル` : event.chest.item === 'flask' ? `封獣フラスコ×${event.chest.amount}` : `${dropLabel(event.chest.item)}×${event.chest.amount}`
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
      setSummary(buildSummary(sessionStart, next))
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
    const result = summary ?? buildSummary(sessionStart, state)
    if (result) { setSummary(result); return }
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

      <section className="explore-stage-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 10 }}>
        {world.nodes.map((n, i) => {
          const unlocked = stageUnlocked(n.stage, state)
          const cleared = hasFlag(state, `visited_node_${n.id}`)
          return (
            <button key={n.id} className={`home-todo ${i === nodeIndex ? 'hot' : ''}`} disabled={!unlocked} onClick={() => { setNodeIndex(i); setEventsDone(0); setPending(null); setExpeditionLog([]); setSummary(null) }}>
              <span>{cleared ? '踏破済' : unlocked ? '探索地' : '未解放'}</span>
              <b>{n.name}</b>
              <small>Lv.{n.stage.band[0]}-{n.stage.band[1]}</small>
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

        <div className="stage-monster-preview" style={{ display: 'grid', gap: 10, margin: '10px 0' }}>
          <div className="item-row" style={{ alignItems: 'flex-start' }}>
            <span className="item-ico"><MenuIcon kind="dex" size={32} /></span>
            <div className="grow">
              <div className="item-name">出現する幻獣</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {node.events.find((e) => e.kind === 'battle')?.kind === 'battle' && node.events.find((e) => e.kind === 'battle')!.config.pool?.slice(0, 12).map((id) => {
                  const sp = species(id)
                  const known = state.seen.includes(id) || state.caught.includes(id)
                  return (
                    <span key={id} className="move-chip" style={{ minWidth: 74, textAlign: 'center', filter: known ? undefined : 'brightness(0)' }} title={known ? sp.name : '？？？'}>
                      <Sprite id={id} type={sp.type} size={32} />
                      <span className="dex-text" style={{ display: 'block', fontSize: 10 }}>{known ? sp.name : '？？？'}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="item-row">
            <span className="item-ico"><ItemIcon kind="flask" size={30} /></span>
            <div className="grow">
              <div className="item-name">落ちるもの</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {node.stage.dropTable.map((drop) => <span key={drop.key} className="move-chip"><ItemIcon kind={drop.key} size={20} /> {dropRateLabel(drop.rate)}</span>)}
              </div>
            </div>
            <TypeBadge t={Object.keys(node.stage.typeWeights)[0]} />
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
                  <button className="home-primary-cta" onClick={() => { const ev = pending; setPending(null); setEventsDone((n) => n + 1); onStartBattle({ ...ev.config, chain: state.chain }, true) }}>
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
                  遠征に出る
                  <span>戦闘・捕獲・収集をまとめて処理</span>
                </button>
                <button className="home-secondary-cta" onClick={drawEvent}>
                  1件ずつ見る
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


      {summary && (
        <div className="modal-backdrop" onClick={() => setSummary(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-head">
              <span className="mon-name">探索の成果</span>
              <button className="modal-close" onClick={() => setSummary(null)}>×</button>
            </div>
            <div className="item-row"><span className="item-ico"><EventIcon kind="battle" size={32} /></span><div className="grow"><div className="item-name">戦闘 {summary.battles}勝</div></div></div>
            <div className="item-row"><span className="item-ico"><StatIcon kind="dex" size={32} /></span><div className="grow"><div className="item-name">捕獲 {summary.catches}体 / 初登録 {summary.newDex}</div></div></div>
            <div className="item-row"><span className="item-ico"><ItemIcon kind="money" size={32} /></span><div className="grow"><div className="item-name">+{summary.gold}ゲル</div></div></div>
            {summary.captured.length > 0 && (
              <div className="result-section">
                <h4>捕まえた幻獣</h4>
                <div className="result-capture-grid">
                  {summary.captured.slice(0, 6).map((m, i) => (
                    <div className="result-capture-card" key={`${m.id}-${i}`}>
                      <Sprite id={m.id} type={m.type} size={50} mutant={m.mutant} />
                      <span><b>{m.name}</b><em>{m.newDex ? '初登録' : '捕獲'}・才能{m.talent}</em></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {summary.drops.length > 0 && (
              <div className="result-section">
                <h4>入手した道具</h4>
                <div className="result-drop-list">
                  {summary.drops.slice(0, 8).map((d) => (
                    <span className="research-chip" key={d.kind}><ItemIcon kind={d.kind} size={22} /> {d.label}×{d.amount}</span>
                  ))}
                </div>
              </div>
            )}
            {summary.chain && <div className="research-chip">チェーン継続中: {summary.chain}</div>}
            <div className="home-hero-actions" style={{ marginTop: 12 }}>
              <button className="home-primary-cta" onClick={() => { setSummary(null); setSessionStart(sessionSnapshot(state)); }}>もう一度潜る</button>
              <button className="home-secondary-cta" onClick={() => { setSummary(null); setPending(null); setEventsDone(0); onHome(); }}>拠点へ戻る</button>
            </div>
          </div>
        </div>
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
