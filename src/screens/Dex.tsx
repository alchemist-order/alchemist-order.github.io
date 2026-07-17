import { useMemo, useState } from 'react'
import type { GameState, MonsterData } from '../types'
import { DEX, DEX_TOTAL, grantReward, researchSummary, species, speciesOfTheDay, today } from '../game/state'
import { Sprite, TypeBadge } from '../ui'

const STAT_LABELS = ['HP', '攻', '防', '速', '魔']

function evolutionChain(m: MonsterData): MonsterData[] {
  let head = m
  while (head.from) head = species(head.from)
  const chain: MonsterData[] = [head]
  let cur = head
  while (cur.to) {
    cur = species(cur.to)
    chain.push(cur)
  }
  return chain
}

function ownedBestLevel(state: GameState, id: string): number | null {
  const levels = state.collection.filter((o) => o.speciesId === id).map((o) => o.level)
  return levels.length ? Math.max(...levels) : null
}

function evolutionHint(m: MonsterData, level: number | null): string {
  if (!m.to || m.at == null) return '最終形態'
  if (level == null) return `Lv.${m.at}で進化`
  if (level >= m.at) return '進化可能'
  return `あと${m.at - level}Lvで進化`
}

interface Props {
  state: GameState
  setState: (updater: (s: GameState) => GameState) => void
  onBack: () => void
}

export default function Dex({ state, setState, onBack }: Props) {
  const [selected, setSelected] = useState<MonsterData | null>(null)
  const todayTarget = speciesOfTheDay(today())
  const seen = useMemo(() => new Set(state.seen), [state.seen])
  const caught = useMemo(() => new Set(state.caught), [state.caught])
  const caughtRate = Math.round((caught.size / DEX_TOTAL) * 100)
  const seenRate = Math.round((seen.size / DEX_TOTAL) * 100)
  const rank = caughtRate >= 80 ? '大錬獣師' : caughtRate >= 50 ? '幻獣蒐集家' : caughtRate >= 20 ? '見習い調査員' : '旅立ちの記録者'
  const nextGoal = caught.size >= DEX_TOTAL ? '図鑑完成！' : `あと${Math.max(1, Math.ceil((caught.size + 1) / 10) * 10 - caught.size)}体集めよう`
  const claimTypeReward = (key: string, reward: 500 | "stone") => {
    setState((cur) => {
      if ((cur.dexTypeClaimed ?? []).includes(key)) return cur
      const granted = reward === "stone" ? grantReward(cur, { talentStone: 1 }) : grantReward(cur, { money: reward })
      return { ...granted, dexTypeClaimed: [...(granted.dexTypeClaimed ?? []), key] }
    })
  }

  const typeRows = Array.from(new Set(DEX.flatMap((m) => [m.type, m.type2].filter(Boolean) as string[]))).map((type) => {
    const total = DEX.filter((m) => m.type === type || m.type2 === type).length
    const got = DEX.filter((m) => (m.type === type || m.type2 === type) && caught.has(m.id)).length
    const pct = total ? got / total : 0
    return { type, total, got, pct, key50: `${type}_50`, key100: `${type}_100` }
  })

  return (
    <div className="screen">
      <header className="home-header">
        <h1>幻獣図鑑</h1>
        <div className="home-stats">
          <span>捕獲 {caught.size}/{DEX_TOTAL} ({caughtRate}%)</span>
          <span>発見 {seen.size}/{DEX_TOTAL} ({seenRate}%)</span>
        </div>
      </header>

      <section className="dex-collector">
        <div><b>収集ランク</b><span>{rank}</span></div>
        <div><b>次の目標</b><span>{nextGoal}</span></div>
      </section>


      <section className="dex-collector" style={{ marginTop: 10 }}>
        <div><b>タイプ別達成</b><span>中間目標で集める</span></div>
        {typeRows.map((row) => {
          const claimed50 = (state.dexTypeClaimed ?? []).includes(row.key50)
          const claimed100 = (state.dexTypeClaimed ?? []).includes(row.key100)
          return (
            <div key={row.type} style={{ display: 'grid', gridTemplateColumns: '70px 1fr auto auto', gap: 6, alignItems: 'center', width: '100%' }}>
              <TypeBadge t={row.type} />
              <span>{row.got}/{row.total}</span>
              <button className="title-btn" style={{ padding: '4px 8px', fontSize: 12 }} disabled={row.pct < 0.5 || claimed50} onClick={() => claimTypeReward(row.key50, 500)}>50% +500</button>
              <button className="title-btn" style={{ padding: '4px 8px', fontSize: 12 }} disabled={row.pct < 1 || claimed100} onClick={() => claimTypeReward(row.key100, 'stone')}>100% 結晶</button>
            </div>
          )
        })}
      </section>

      <div className="dex-grid">
        {DEX.map((m) => {
          const isSeen = seen.has(m.id)
          const isCaught = caught.has(m.id)
          const bestLv = ownedBestLevel(state, m.id)
          return (
            <button
              key={m.id}
              className={`dex-cell ${isCaught ? 'caught' : isSeen ? 'seen' : 'locked'} ${m.id === todayTarget.id ? 'hot' : ''}`}
              disabled={!isSeen}
              onClick={() => isSeen && setSelected(m)}
            >
              <span className="dex-no">No.{String(m.dex).padStart(3, '0')}</span>
              {isSeen ? (
                <>
                  <Sprite id={m.id} type={m.type} size={36} />
                  <span className="dex-cell-name">{m.name}</span>
                  {m.id === todayTarget.id && <span className="dex-evo-hint">今日の幻獣 ??+15%</span>}
                  <span className="dex-evo-hint">{evolutionHint(m, bestLv)}</span>
                  {isCaught && <span className="dex-research-mini">Research Lv.{researchSummary(state, m.id).level} / {researchSummary(state, m.id).progressText}</span>}
                </>
              ) : (
                <>
                  <div className="sprite locked-sprite">?</div>
                  <span className="dex-cell-name">？？？</span>
                  <span className="dex-evo-hint">未発見</span>
                </>
              )}
              {isCaught && <span className="caught-dot">●</span>}
            </button>
          )
        })}
      </div>

      <div className="result-actions" style={{ marginTop: 20 }}>
        <button className="move-btn" onClick={onBack}>拠点にもどる</button>
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-head">
              <span className="mon-name">No.{String(selected.dex).padStart(3, '0')} {selected.name}</span>
              <button className="modal-close" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="row">
              <Sprite id={selected.id} type={selected.type} size={88} />
              <div className="grow">
                <div className="badges">
                  <TypeBadge t={selected.type} />
                  {selected.type2 && <TypeBadge t={selected.type2} />}
                  {selected.role === 'legendary' && <span className="badge legendary-badge">伝説</span>}
                </div>
                <div className="stat-list">
                  {selected.stats.map((v, i) => (
                    <div key={i} className="stat-row">
                      <span className="stat-label">{STAT_LABELS[i]}</span>
                      <div className="stat-bar-outer"><div className="stat-bar-inner" style={{ width: `${Math.min(100, (v / 150) * 100)}%` }} /></div>
                      <span className="stat-val">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="dex-text">{selected.dex_text}</p>
            <div className="dex-detail-goal">
              <b>育成メモ</b>
              <span>{evolutionHint(selected, ownedBestLevel(state, selected.id))}</span>
            </div>

            <h4 className="section-title">進化系統</h4>
            <div className="evo-chain">
              {evolutionChain(selected).map((e, i) => {
                const known = seen.has(e.id)
                return (
                  <span key={e.id} className="evo-node">
                    {i > 0 && <span className="evo-arrow">▶</span>}
                    <span className={`evo-name ${e.id === selected.id ? 'cur' : ''}`}>{known ? e.name : '？？？'}</span>
                    {known && <small className="dex-evo-hint">{evolutionHint(e, ownedBestLevel(state, e.id))}</small>}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
