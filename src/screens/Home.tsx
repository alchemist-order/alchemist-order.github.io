import { useState } from 'react'
import type { GameState, OwnedMonster } from '../types'
import {
  ACHIEVEMENTS,
  DAILY_GOAL,
  DAILY_REWARD,
  DEX_MILESTONES,
  DEX_TOTAL,
  expToNext,
  grantReward,
  ownedMoveset,
  species,
} from '../game/state'
import { statAt } from '../engine/battleEngine'
import * as audio from '../game/audio'
import { ItemIcon, Sprite, TypeBadge } from '../ui'

interface Props {
  state: GameState
  setState: (updater: (s: GameState) => GameState) => void
  setActive: (uid: string) => void
  onField: () => void
  onDex: () => void
}

function rewardLabel(r: { money?: number; flask?: number; heal?: number; heal2?: number }): string {
  const parts: string[] = []
  if (r.money) parts.push(`💰${r.money}`)
  if (r.flask) parts.push(`🔮×${r.flask}`)
  if (r.heal) parts.push(`🧪傷×${r.heal}`)
  if (r.heal2) parts.push(`🧪上×${r.heal2}`)
  return parts.join(' ')
}

const STAT_LABELS = ['さいだいHP', 'こうげき', 'ぼうぎょ', 'すばやさ', 'まりょく']
const STAT_MAX = 240 // ステータスバーの目安上限

function ownedStats(o: OwnedMonster) {
  const sp = species(o.speciesId)
  const [hp, atk, def, spd, mag] = sp.stats
  const m = 1 + (o.talent ?? 0) * 0.04
  const r = (v: number) => Math.round(v * m)
  return {
    sp,
    maxHp: r(statAt(hp, o.level, true)),
    values: [r(statAt(hp, o.level, true)), r(statAt(atk, o.level)), r(statAt(def, o.level)), r(statAt(spd, o.level)), r(statAt(mag, o.level))],
  }
}

export default function Home({ state, setState, setActive, onField, onDex }: Props) {
  const active = state.collection.find((o) => o.uid === state.activeUid) ?? state.collection[0]
  const [tab, setTab] = useState<'party' | 'items' | 'note'>('party')

  // やりこみ: 受け取り処理
  const dailyDone = !!state.daily && state.daily.wild >= DAILY_GOAL
  const dailyClaimable = dailyDone && !state.daily?.claimed
  const claimDaily = () => {
    if (!dailyClaimable) return
    audio.sfx('coin')
    setState((s) => (s.daily && s.daily.wild >= DAILY_GOAL && !s.daily.claimed ? { ...grantReward(s, DAILY_REWARD), daily: { ...s.daily, claimed: true } } : s))
  }
  const claimDex = (n: number, reward: { money?: number; flask?: number; heal?: number; heal2?: number }) => {
    audio.sfx('coin')
    setState((s) => ((s.dexClaimed ?? []).includes(n) || s.caught.length < n ? s : { ...grantReward(s, reward), dexClaimed: [...(s.dexClaimed ?? []), n] }))
  }
  const claimAch = (id: string) => {
    const a = ACHIEVEMENTS.find((x) => x.id === id)
    if (!a) return
    audio.sfx('coin')
    setState((s) => ((s.achievements ?? []).includes(id) || !a.check(s) ? s : { ...grantReward(s, a.reward), achievements: [...(s.achievements ?? []), id] }))
  }

  const [selUid, setSelUid] = useState(active.uid)
  const sel = state.collection.find((o) => o.uid === selUid) ?? active

  const { sp, maxHp, values } = ownedStats(sel)
  const curHp = sel.hp == null ? maxHp : sel.hp
  const hpRatio = Math.max(0, Math.min(1, curHp / maxHp))
  const hpColor = hpRatio > 0.5 ? '#43c463' : hpRatio > 0.2 ? '#e2c23b' : '#e2563b'
  const expNeed = expToNext(sel.level)
  const expRatio = Math.min(1, sel.exp / expNeed)
  const moves = ownedMoveset(sel)
  const inheritedIds = new Set((sel.inheritedMoves ?? []).map((m) => m.id))
  const isActive = sel.uid === active.uid

  return (
    <div className="screen">
      <header className="home-header">
        <h1>メニュー</h1>
        <div className="home-stats">
          <span>📖 {state.caught.length}/{DEX_TOTAL}</span>
          <span>🎖 {state.badges.length}</span>
          <span>💰 {state.money}</span>
        </div>
      </header>

      <div className="menu-tabs">
        <button className={`menu-tab ${tab === 'party' ? 'on' : ''}`} onClick={() => setTab('party')}>
          手持ち
        </button>
        <button className={`menu-tab ${tab === 'items' ? 'on' : ''}`} onClick={() => setTab('items')}>
          どうぐ
        </button>
        <button className={`menu-tab ${tab === 'note' ? 'on' : ''}`} onClick={() => setTab('note')}>
          ノート{dailyClaimable ? ' ●' : ''}
        </button>
      </div>

      {tab === 'note' ? (
        <div className="items-pane">
          {/* ログイン */}
          <div className="money-box">🔥 連続ログイン <b>{state.loginStreak ?? 1}</b> 日</div>
          {/* デイリー */}
          <h3 className="section-title">デイリー</h3>
          <div className="item-row">
            <span className="item-ico">⚔</span>
            <div className="grow">
              <div className="item-name">野生の幻獣を {DAILY_GOAL}体 たおす</div>
              <div className="item-desc">進捗 {Math.min(state.daily?.wild ?? 0, DAILY_GOAL)}/{DAILY_GOAL} ・ 報酬 {rewardLabel(DAILY_REWARD)}</div>
            </div>
            <button className="title-btn" style={{ padding: '6px 14px', fontSize: 14 }} disabled={!dailyClaimable} onClick={claimDaily}>
              {state.daily?.claimed ? '受取済' : dailyDone ? '受け取る' : `${Math.min(state.daily?.wild ?? 0, DAILY_GOAL)}/${DAILY_GOAL}`}
            </button>
          </div>
          {/* 図鑑報酬 */}
          <h3 className="section-title">図鑑報酬（{state.caught.length}/{DEX_TOTAL}）</h3>
          {DEX_MILESTONES.map((m) => {
            const claimed = (state.dexClaimed ?? []).includes(m.n)
            const reached = state.caught.length >= m.n
            return (
              <div className="item-row" key={m.n}>
                <span className="item-ico">📖</span>
                <div className="grow">
                  <div className="item-name">{m.n}体 とうろく</div>
                  <div className="item-desc">報酬 {rewardLabel(m.reward)}</div>
                </div>
                <button className="title-btn" style={{ padding: '6px 14px', fontSize: 14 }} disabled={!reached || claimed} onClick={() => claimDex(m.n, m.reward)}>
                  {claimed ? '受取済' : reached ? '受け取る' : '🔒'}
                </button>
              </div>
            )
          })}
          {/* 実績 */}
          <h3 className="section-title">実績</h3>
          {ACHIEVEMENTS.map((a) => {
            const done = (state.achievements ?? []).includes(a.id)
            const met = a.check(state)
            return (
              <div className="item-row" key={a.id}>
                <span className="item-ico">{done ? '🏅' : met ? '✨' : '🔒'}</span>
                <div className="grow">
                  <div className="item-name">{a.name}</div>
                  <div className="item-desc">{a.desc} ・ 報酬 {rewardLabel(a.reward)}</div>
                </div>
                <button className="title-btn" style={{ padding: '6px 14px', fontSize: 14 }} disabled={done || !met} onClick={() => claimAch(a.id)}>
                  {done ? '達成' : met ? '受け取る' : '🔒'}
                </button>
              </div>
            )
          })}
        </div>
      ) : tab === 'party' ? (
        <>
          {/* 選択中の幻獣 詳細 */}
          <div className="card detail-card">
            <div className="card-head">
              <span className="mon-name">
                {sp.name}
                {isActive && <span className="lead-tag">先頭</span>}
                {sel.talent ? <span className="lead-tag" style={{ background: '#9a6cd0', color: '#fff' }}>才能★{sel.talent}</span> : null}
              </span>
              <span className="mon-lv">Lv.{sel.level}</span>
            </div>
            <div className="detail-top">
              <div className="detail-portrait">
                <Sprite id={sp.id} type={sp.type} size={96} />
                <div className="badges">
                  <TypeBadge t={sp.type} />
                  {sp.type2 && <TypeBadge t={sp.type2} />}
                </div>
              </div>
              <div className="grow">
                <div className="stat-line">
                  <span>HP</span>
                  <b style={{ color: hpColor }}>{curHp}</b> / {maxHp}
                </div>
                <div className="hpbar-outer">
                  <div className="hpbar-inner" style={{ width: `${hpRatio * 100}%`, background: hpColor }} />
                </div>
                <div className="stat-line" style={{ marginTop: 8 }}>
                  <span>EXP</span>
                  <span className="ink-dim">あと {Math.max(0, expNeed - sel.exp)}</span>
                </div>
                <div className="hpbar-outer">
                  <div className="hpbar-inner" style={{ width: `${expRatio * 100}%`, background: '#6fb3e2' }} />
                </div>
              </div>
            </div>

            {/* 5能力 */}
            <div className="stat-grid">
              {STAT_LABELS.map((label, i) => (
                <div className="stat-row" key={label}>
                  <span className="stat-name">{label}</span>
                  <span className="stat-val">{values[i]}</span>
                  <div className="stat-bar">
                    <div className="stat-fill" style={{ width: `${Math.min(100, (values[i] / STAT_MAX) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* おぼえている技 */}
            <h4 className="mini-title">おぼえている技</h4>
            <div className="move-list">
              {moves.map((mv) => (
                <div className="move-chip" key={mv.id}>
                  <span className="mc-name">
                    {mv.name}
                    {inheritedIds.has(mv.id) && <span className="inherit-tag">遺伝</span>}
                  </span>
                  <span className="mc-meta">
                    <TypeBadge t={mv.type} />
                    {mv.category === 'status' ? (mv.heal ? '回復' : '状態') : `威${mv.power}`}・命{Math.round(mv.acc * 100)}
                  </span>
                </div>
              ))}
            </div>

            <p className="dex-text">{sp.dex_text}</p>
            {!isActive && (
              <button className="title-btn primary" style={{ width: '100%', marginTop: 6 }} onClick={() => setActive(sel.uid)}>
                先頭にする
              </button>
            )}
          </div>

          {/* 手持ち一覧 */}
          <h3 className="section-title">手持ち {state.collection.length}体（タップで詳細）</h3>
          <div className="party-list">
            {state.collection.map((o) => {
              const st = ownedStats(o)
              const hp = o.hp == null ? st.maxHp : o.hp
              const ratio = Math.max(0, Math.min(1, hp / st.maxHp))
              const col = ratio > 0.5 ? '#43c463' : ratio > 0.2 ? '#e2c23b' : '#e2563b'
              return (
                <button key={o.uid} className={`party-row ${o.uid === selUid ? 'sel' : ''}`} onClick={() => setSelUid(o.uid)}>
                  <Sprite id={st.sp.id} type={st.sp.type} size={44} />
                  <div className="pr-info">
                    <div className="pr-head">
                      <span className="pr-name">{st.sp.name}</span>
                      {o.uid === active.uid && <span className="lead-tag">先頭</span>}
                      <span className="pr-lv">Lv.{o.level}</span>
                    </div>
                    <div className="pr-hpbar">
                      <div className="pr-hpfill" style={{ width: `${ratio * 100}%`, background: col }} />
                    </div>
                    <div className="pr-hptext">HP {hp}/{st.maxHp}</div>
                  </div>
                  <TypeBadge t={st.sp.type} />
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <div className="items-pane">
          <div className="money-box">所持金 <b>💰 {state.money}</b> ゲル</div>
          <div className="item-row">
            <span className="item-ico"><ItemIcon kind="heal" size={32} /></span>
            <div className="grow">
              <div className="item-name">傷薬</div>
              <div className="item-desc">HPを60%回復する</div>
            </div>
            <span className="item-count">×{state.items.heal}</span>
          </div>
          <div className="item-row">
            <span className="item-ico"><ItemIcon kind="heal2" size={32} /></span>
            <div className="grow">
              <div className="item-name">上傷薬</div>
              <div className="item-desc">HPを全回復する</div>
            </div>
            <span className="item-count">×{state.items.heal2}</span>
          </div>
          <div className="item-row">
            <span className="item-ico"><ItemIcon kind="flask" size={32} /></span>
            <div className="grow">
              <div className="item-name">封獣フラスコ</div>
              <div className="item-desc">野生の幻獣を捕まえる</div>
            </div>
            <span className="item-count">×{state.flasks}</span>
          </div>
          <h3 className="section-title">記章 {state.badges.length}/8</h3>
          <div className="badge-list">
            {state.badges.length === 0 && <span className="ink-dim">まだ記章を持っていない。</span>}
            {state.badges.map((b) => (
              <span key={b} className="badge-pill">🎖 {b}</span>
            ))}
          </div>
        </div>
      )}

      <div className="moves" style={{ marginTop: 18 }}>
        <button className="move-btn" onClick={onField}>
          <span className="move-name">🗺 ぼうけんに もどる</span>
          <span className="move-meta">フィールドを探索する</span>
        </button>
        <button className="move-btn" onClick={onDex}>
          <span className="move-name">📖 幻獣図鑑をひらく</span>
          <span className="move-meta">{state.caught.length}/{DEX_TOTAL} 体を記録</span>
        </button>
      </div>
    </div>
  )
}
