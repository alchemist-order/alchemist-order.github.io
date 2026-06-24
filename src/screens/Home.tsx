import { useState } from 'react'
import type { GameState, OwnedMonster } from '../types'
import {
  ACHIEVEMENTS,
  DAILY_GOAL,
  DAILY_REWARD,
  DEX_MILESTONES,
  DEX_TOTAL,
  PARTY_MAX,
  depositToBox,
  expToNext,
  getParty,
  grantReward,
  ownedMoveset,
  playerTitle,
  species,
  withdrawToParty,
} from '../game/state'
import { statAt } from '../engine/battleEngine'
import * as audio from '../game/audio'
import { ItemIcon, RarityBadge, Sprite, TypeBadge } from '../ui'

interface Props {
  state: GameState
  setState: (updater: (s: GameState) => GameState) => void
  setActive: (uid: string) => void
  onField: () => void
  onDex: () => void
  initialTab?: 'party' | 'items' | 'note' | 'record'
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

export default function Home({ state, setState, setActive, onField, onDex, initialTab = 'party' }: Props) {
  const active = state.collection.find((o) => o.uid === state.activeUid) ?? state.collection[0]
  const [tab, setTab] = useState<'party' | 'items' | 'note' | 'record'>(initialTab)
  const [zoom, setZoom] = useState(false) // 幻獣の大きい表示

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

  // パーティ編成(パーティ最大PARTY_MAX＋預かりボックス)
  const partyIds = getParty(state)
  const partyMons = partyIds.map((uid) => state.collection.find((o) => o.uid === uid)).filter(Boolean) as OwnedMonster[]
  const boxMons = state.collection.filter((o) => !partyIds.includes(o.uid))
  const selInParty = partyIds.includes(sel.uid)
  const deposit = (uid: string) => setState((s) => depositToBox(s, uid))
  const withdraw = (uid: string) => setState((s) => withdrawToParty(s, uid))

  // 手持ち一覧の1行(編成ボタンつき)
  const monRow = (o: OwnedMonster, where: 'party' | 'box') => {
    const st = ownedStats(o)
    const hp = o.hp == null ? st.maxHp : o.hp
    const ratio = Math.max(0, Math.min(1, hp / st.maxHp))
    const col = ratio > 0.5 ? '#43c463' : ratio > 0.2 ? '#e2c23b' : '#e2563b'
    const btnS = { padding: '4px 10px', fontSize: 12, whiteSpace: 'nowrap' as const }
    return (
      <div key={o.uid} style={{ display: 'flex', gap: 6, alignItems: 'stretch', marginBottom: 6 }}>
        <button className={`party-row ${o.uid === selUid ? 'sel' : ''}`} style={{ flex: 1, marginBottom: 0 }} onClick={() => setSelUid(o.uid)}>
          <Sprite id={st.sp.id} type={st.sp.type} size={44} />
          <div className="pr-info">
            <div className="pr-head">
              <span className="pr-name">{st.sp.name}</span>
              <RarityBadge talent={o.talent} size={11} />
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
          {where === 'party' ? (
            <>
              {o.uid !== active.uid && (
                <button className="title-btn" style={btnS} onClick={() => setActive(o.uid)}>先頭</button>
              )}
              <button className="title-btn" style={btnS} disabled={partyMons.length <= 1} onClick={() => deposit(o.uid)}>預ける</button>
            </>
          ) : (
            <button className="title-btn" style={btnS} disabled={partyMons.length >= PARTY_MAX} onClick={() => withdraw(o.uid)}>連れる</button>
          )}
        </div>
      </div>
    )
  }

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
          <span><ItemIcon kind="money" size={22} /> {state.money}</span>
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
        <button className={`menu-tab ${tab === 'record' ? 'on' : ''}`} onClick={() => setTab('record')}>
          記録
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
                <RarityBadge talent={sel.talent} />
                {sel.talent ? <span className="cmd-sub" style={{ marginLeft: 4 }}>才能{sel.talent}</span> : null}
              </span>
              <span className="mon-lv">Lv.{sel.level}</span>
            </div>
            <div className="detail-top">
              <div className="detail-portrait" onClick={() => setZoom(true)} style={{ cursor: 'zoom-in' }} title="タップで大きく見る">
                <Sprite id={sp.id} type={sp.type} size={120} />
                <div className="badges">
                  <TypeBadge t={sp.type} />
                  {sp.type2 && <TypeBadge t={sp.type2} />}
                </div>
                <span className="dex-text" style={{ marginTop: 2, fontSize: 11, opacity: 0.7 }}>🔍 タップで拡大</span>
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
            {selInParty
              ? !isActive && (
                  <button className="title-btn primary" style={{ width: '100%', marginTop: 6 }} onClick={() => setActive(sel.uid)}>
                    先頭にする
                  </button>
                )
              : (
                  <button
                    className="title-btn primary"
                    style={{ width: '100%', marginTop: 6 }}
                    disabled={partyMons.length >= PARTY_MAX}
                    onClick={() => withdraw(sel.uid)}
                  >
                    {partyMons.length >= PARTY_MAX ? 'パーティが満員' : 'パーティに連れる'}
                  </button>
                )}
          </div>

          {/* パーティ(戦う編成・先頭=リーダー) */}
          <h3 className="section-title">パーティ {partyMons.length}/{PARTY_MAX}（戦う編成・先頭=リーダー）</h3>
          <div className="party-list">{partyMons.map((o) => monRow(o, 'party'))}</div>

          {/* 預かりボックス */}
          <h3 className="section-title">📦 預かり所 {boxMons.length}体</h3>
          <div className="party-list">
            {boxMons.length === 0 && <span className="ink-dim">預かり所は からっぽ。捕まえすぎたら ここに あずかるよ。</span>}
            {boxMons.map((o) => monRow(o, 'box'))}
          </div>
        </>
      ) : tab === 'record' ? (
        <div className="items-pane">
          {/* プロフィール */}
          <div className="card detail-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Sprite id={sp.id} type={sp.type} size={56} />
            <div className="grow">
              <input
                value={state.playerName ?? ''}
                placeholder="なまえを入力"
                maxLength={12}
                onChange={(e) => setState((s) => ({ ...s, playerName: e.target.value }))}
                style={{
                  width: '100%', fontSize: 18, fontWeight: 700, padding: '6px 10px', borderRadius: 8,
                  border: '1px solid rgba(212,175,90,0.5)', background: 'rgba(20,16,10,0.5)', color: '#f3e6c4',
                }}
              />
              <div className="dex-text" style={{ marginTop: 4 }}>称号：<b>{playerTitle(state)}</b></div>
            </div>
          </div>

          {/* 戦績 */}
          <h3 className="section-title">戦績</h3>
          {(() => {
            const pct = Math.round((state.caught.length / DEX_TOTAL) * 100)
            const rows: { ico: string; name: string; val: string }[] = [
              { ico: '📖', name: '図鑑コンプリート', val: `${state.caught.length} / ${DEX_TOTAL} 体（${pct}%）` },
              { ico: '🎖', name: '記章', val: `${state.badges.length} / 8` },
              { ico: '🗼', name: '試練の塔 自己ベスト', val: `${state.towerBest ?? 0} 階` },
              { ico: '⚔', name: '通算勝利数', val: `${state.wins} 勝` },
              { ico: '🏛', name: '撃破した守護者', val: `${state.defeatedTrainers.length} 人` },
              { ico: '💰', name: '所持金', val: `${state.money} ゲル` },
              { ico: '🔥', name: '連続ログイン', val: `${state.loginStreak ?? 1} 日` },
              { ico: '🧬', name: '所持幻獣', val: `${state.collection.length} 体（パーティ ${partyMons.length}）` },
            ]
            return rows.map((r) => (
              <div className="item-row" key={r.name}>
                <span className="item-ico">{r.ico}</span>
                <div className="grow"><div className="item-name">{r.name}</div></div>
                <span className="item-count">{r.val}</span>
              </div>
            ))
          })()}

          {/* 記章一覧 */}
          <h3 className="section-title">獲得記章 {state.badges.length}/8</h3>
          <div className="badge-list">
            {state.badges.length === 0 && <span className="ink-dim">まだ記章を持っていない。</span>}
            {state.badges.map((b) => (
              <span key={b} className="badge-pill">🎖 {b}</span>
            ))}
          </div>

          <div className="money-box" style={{ marginTop: 14 }}>🏆 共通ランキングは準備中。この記録（塔ベスト等）を提出して順位を競う予定。</div>
        </div>
      ) : (
        <div className="items-pane">
          <div className="money-box">所持金 <b><ItemIcon kind="money" size={24} /> {state.money}</b> ゲル</div>
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

      {/* 幻獣の大きい表示(タップで開閉) */}
      {zoom && (
        <div
          onClick={() => setZoom(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300, cursor: 'zoom-out',
            background: 'radial-gradient(circle at 50% 38%, rgba(40,32,20,0.96), rgba(8,6,4,0.97))',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16,
          }}
        >
          <Sprite id={sp.id} type={sp.type} size={Math.min(300, Math.round(window.innerWidth * 0.74))} />
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f3e6c4', textAlign: 'center' }}>
            {sp.name}
            <span style={{ fontSize: 15, opacity: 0.8, marginLeft: 8 }}>Lv.{sel.level}</span>
          </div>
          {sel.talent ? <div><RarityBadge talent={sel.talent} size={16} /><span style={{ fontSize: 13, color: '#b8a888', marginLeft: 6 }}>才能{sel.talent}・全能力+{sel.talent * 4}%</span></div> : null}
          <div className="badges">
            <TypeBadge t={sp.type} />
            {sp.type2 && <TypeBadge t={sp.type2} />}
          </div>
          <p className="dex-text" style={{ maxWidth: 360, textAlign: 'center', color: '#d9c9a6' }}>{sp.dex_text}</p>
          <div style={{ color: '#b8a888', fontSize: 13, marginTop: 4 }}>タップで とじる</div>
        </div>
      )}
    </div>
  )
}
