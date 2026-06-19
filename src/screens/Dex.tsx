import { useState } from 'react'
import type { GameState, MonsterData } from '../types'
import { DEX, DEX_TOTAL, species } from '../game/state'
import { Sprite, TypeBadge } from '../ui'

const STAT_LABELS = ['HP', '攻', '防', '速', '魔']

function evolutionChain(m: MonsterData): MonsterData[] {
  // 系統の先頭までさかのぼってから末尾まで辿る
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

interface Props {
  state: GameState
  onBack: () => void
}

export default function Dex({ state, onBack }: Props) {
  const [selected, setSelected] = useState<MonsterData | null>(null)
  const seen = new Set(state.seen)
  const caught = new Set(state.caught)

  return (
    <div className="screen">
      <header className="home-header">
        <h1>幻獣図鑑</h1>
        <div className="home-stats">
          <span>捕獲 {caught.size}/{DEX_TOTAL}</span>
          <span>発見 {seen.size}/{DEX_TOTAL}</span>
        </div>
      </header>

      <div className="dex-grid">
        {DEX.map((m) => {
          const isSeen = seen.has(m.id)
          const isCaught = caught.has(m.id)
          return (
            <button
              key={m.id}
              className={`dex-cell ${isCaught ? 'caught' : isSeen ? 'seen' : 'locked'}`}
              disabled={!isSeen}
              onClick={() => isSeen && setSelected(m)}
            >
              <span className="dex-no">No.{String(m.dex).padStart(3, '0')}</span>
              {isSeen ? (
                <>
                  <Sprite id={m.id} type={m.type} size={36} />
                  <span className="dex-cell-name">{m.name}</span>
                </>
              ) : (
                <>
                  <div className="sprite locked-sprite">?</div>
                  <span className="dex-cell-name">？？？</span>
                </>
              )}
              {isCaught && <span className="caught-dot">●</span>}
            </button>
          )
        })}
      </div>

      <div className="result-actions" style={{ marginTop: 20 }}>
        <button className="move-btn" onClick={onBack}>
          アジトに もどる
        </button>
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-head">
              <span className="mon-name">
                No.{String(selected.dex).padStart(3, '0')} {selected.name}
              </span>
              <button className="modal-close" onClick={() => setSelected(null)}>
                ×
              </button>
            </div>
            <div className="row">
              <Sprite id={selected.id} type={selected.type} size={80} />
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
                      <div className="stat-bar-outer">
                        <div className="stat-bar-inner" style={{ width: `${Math.min(100, (v / 150) * 100)}%` }} />
                      </div>
                      <span className="stat-val">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="dex-text">{selected.dex_text}</p>

            <h4 className="section-title">進化系統</h4>
            <div className="evo-chain">
              {evolutionChain(selected).map((e, i) => {
                const known = seen.has(e.id)
                return (
                  <span key={e.id} className="evo-node">
                    {i > 0 && <span className="evo-arrow">▶</span>}
                    <span className={`evo-name ${e.id === selected.id ? 'cur' : ''}`}>
                      {known ? e.name : '？？？'}
                    </span>
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
