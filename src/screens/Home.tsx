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
  grantExp,
  healParty,
  ownedMoveset,
  playerTitle,
  releaseMon,
  sellMon,
  sellPrice,
  species,
  withdrawToParty,
  withCaught,
  withSeen,
  ALL_BADGES,
} from '../game/state'
import typechart from '../../data/typechart.json'
import { abilityOf, HELD_ITEMS, HELD_ITEM_IDS } from '../game/abilities'
import { statAt } from '../engine/battleEngine'
import * as audio from '../game/audio'
import { ItemIcon, RarityBadge, Sprite, TypeBadge, TYPE_COLORS, BadgeIcon, MedalIcon } from '../ui'
import '../medals.css'

interface Props {
  state: GameState
  setState: (updater: (s: GameState) => GameState) => void
  setActive: (uid: string) => void
  onField: () => void
  onDex: () => void
  // 拠点アクション(歩行廃止に伴い、旧フィールドNPC由来の機能をここから開く)
  onShop: () => void
  onInn: () => void
  onFusion: () => void
  onTower: () => void
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

export default function Home({ state, setState, setActive, onField, onDex, onShop, onInn, onFusion, onTower, initialTab = 'party' }: Props) {
  const active = state.collection.find((o) => o.uid === state.activeUid) ?? state.collection[0]
  const [tab, setTab] = useState<'party' | 'items' | 'note' | 'record'>(initialTab)
  const [zoom, setZoom] = useState(false) // 幻獣の大きい表示
  const [boxSort, setBoxSort] = useState<'dex' | 'level' | 'rarity' | 'type'>('dex') // 預かりの並び替え
  const [confirm, setConfirm] = useState<{ uid: string; sell: boolean } | null>(null) // 逃がす/売る確認
  const [showHelp, setShowHelp] = useState(false) // 遊び方・相性表

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
  const doRelease = (uid: string, sell: boolean) => {
    audio.sfx(sell ? 'coin' : 'select')
    setState((s) => (sell ? sellMon(s, uid) : releaseMon(s, uid)))
    if (selUid === uid) setSelUid(active.uid)
    setConfirm(null)
  }
  // 預かりの並び替え
  const sortedBox = [...boxMons].sort((a, b) => {
    if (boxSort === 'level') return b.level - a.level
    if (boxSort === 'rarity') return (b.talent ?? 0) - (a.talent ?? 0)
    if (boxSort === 'type') return species(a.speciesId).type.localeCompare(species(b.speciesId).type) || species(a.speciesId).dex - species(b.speciesId).dex
    return species(a.speciesId).dex - species(b.speciesId).dex
  })

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
          ) : confirm?.uid === o.uid ? (
            <>
              <span className="cmd-sub" style={{ whiteSpace: 'nowrap' }}>{confirm.sell ? `売値${sellPrice(o)}?` : '逃がす?'}</span>
              <button className="title-btn" style={btnS} onClick={() => doRelease(o.uid, confirm.sell)}>はい</button>
              <button className="title-btn" style={btnS} onClick={() => setConfirm(null)}>やめる</button>
            </>
          ) : (
            <>
              <button className="title-btn" style={btnS} disabled={partyMons.length >= PARTY_MAX} onClick={() => withdraw(o.uid)}>連れる</button>
              <button className="title-btn" style={btnS} onClick={() => setConfirm({ uid: o.uid, sell: true })}>売る</button>
              <button className="title-btn" style={btnS} onClick={() => setConfirm({ uid: o.uid, sell: false })}>逃がす</button>
            </>
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
  const todayWild = Math.min(state.daily?.wild ?? 0, DAILY_GOAL)
  const nextDexMilestone = DEX_MILESTONES.find((m) => !(state.dexClaimed ?? []).includes(m.n) && state.caught.length < m.n)
  const nextDexText = nextDexMilestone ? `${state.caught.length}/${nextDexMilestone.n}` : `${state.caught.length}/${DEX_TOTAL}`
  const achievementReady = ACHIEVEMENTS.filter((a) => a.check(state) && !(state.achievements ?? []).includes(a.id)).length
  const partnerMood = sel.mutant
    ? '今日は不思議な光をまとっている。'
    : (sel.talent ?? 0) >= 6
      ? '才能のきらめきが強くなっている。'
      : 'こちらを見て、次の探索を待っている。'
  const talentStoneCount = state.mats?.talentStone ?? 0
  const slotCharmCount = state.mats?.slotCharm ?? 0
  const traitLevel = sel.traitBoost ?? 0
  const canUseTalentStone = talentStoneCount > 0 && (sel.talent ?? 0) < 10
  const canUseTraitCharm = slotCharmCount > 0 && traitLevel < 5
  const spendSelectedExpItem = (kind: 'exp_tome' | 'evo_dust', amount: number) => {
    if (state.items[kind] <= 0) return
    audio.sfx('coin')
    setState((s) => {
      let evolvedId: string | null = null
      const collection = s.collection.map((o) => {
        if (o.uid !== sel.uid) return o
        const copy = { ...o }
        const before = copy.speciesId
        grantExp(copy, amount)
        if (copy.speciesId !== before) evolvedId = copy.speciesId
        return copy
      })
      let next: GameState = { ...s, items: { ...s.items, [kind]: Math.max(0, s.items[kind] - 1) }, collection }
      if (evolvedId) next = withCaught(withSeen(next, evolvedId), evolvedId)
      return next
    })
  }
  const useTraitElixir = () => {
    if (state.items.trait_elixir <= 0 || traitLevel >= 5) return
    audio.sfx('coin')
    setState((s) => ({
      ...s,
      items: { ...s.items, trait_elixir: Math.max(0, s.items.trait_elixir - 1) },
      collection: s.collection.map((o) => (o.uid === sel.uid ? { ...o, traitBoost: Math.min(5, (o.traitBoost ?? 0) + 1) } : o)),
    }))
  }
  const useHeal3 = () => {
    if (state.items.heal3 <= 0) return
    audio.sfx('heal')
    setState((s) => healParty({ ...s, items: { ...s.items, heal3: Math.max(0, s.items.heal3 - 1) } }))
  }
  const useRevive = () => {
    if (state.items.revive <= 0) return
    audio.sfx('heal')
    setState((s) => ({
      ...s,
      items: { ...s.items, revive: Math.max(0, s.items.revive - 1) },
      collection: s.collection.map((o) => (o.uid === sel.uid ? { ...o, hp: undefined } : o)),
    }))
  }

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

      <section className="home-hero">
        <div className="home-hero-main">
          <button className="home-hero-art" onClick={() => setZoom(true)} title="タップで拡大">
            <Sprite id={sp.id} type={sp.type} size={156} mutant={sel.mutant} />
            <span className="home-hero-shadow" />
          </button>
          <div className="home-hero-info">
            <div className="home-hero-kicker">今日の相棒</div>
            <div className="home-hero-name">
              <span>{sp.name}</span>
              <RarityBadge talent={sel.talent} size={13} />
              {isActive && <span className="lead-tag">先頭</span>}
            </div>
            <div className="home-hero-sub">
              <span>Lv.{sel.level}</span>
              <TypeBadge t={sp.type} />
              {sp.type2 && <TypeBadge t={sp.type2} />}
              {sel.mutant && <span className="rare-tag">変異</span>}
            </div>
            <p className="home-hero-flavor">{partnerMood}</p>
            <div className="home-hero-bars">
              <div className="home-mini-bar">
                <span>HP</span>
                <b>{curHp}/{maxHp}</b>
                <i><em style={{ width: `${hpRatio * 100}%`, background: hpColor }} /></i>
              </div>
              <div className="home-mini-bar">
                <span>EXP</span>
                <b>{sel.exp}/{expNeed}</b>
                <i><em style={{ width: `${expRatio * 100}%` }} /></i>
              </div>
            </div>
            <div className="home-hero-actions">
              <button className="home-primary-cta" onClick={onField}>
                探索する
                <span>戦闘・捕獲・素材集めをまとめて進める</span>
              </button>
              <button className="home-secondary-cta" onClick={onDex}>図鑑を見る</button>
            </div>
          </div>
        </div>
        <div className="home-todo-grid">
          <button className={`home-todo ${dailyClaimable ? 'hot' : ''}`} onClick={() => setTab('note')}>
            <span>日課</span>
            <b>{state.daily?.claimed ? '達成済' : `${todayWild}/${DAILY_GOAL}`}</b>
          </button>
          <button className="home-todo" onClick={() => setTab('note')}>
            <span>図鑑報酬</span>
            <b>{nextDexText}</b>
          </button>
          <button className="home-todo" onClick={() => setTab('record')}>
            <span>記章</span>
            <b>{state.badges.length}/8</b>
          </button>
          <button className={`home-todo ${achievementReady ? 'hot' : ''}`} onClick={() => setTab('note')}>
            <span>実績</span>
            <b>{achievementReady ? `${achievementReady}件受取` : `${state.achievements?.length ?? 0}/${ACHIEVEMENTS.length}`}</b>
          </button>
        </div>
        {/* 拠点アクション(旧フィールドの施設。歩行廃止に伴いここが正式導線) */}
        <div className="home-todo-grid home-base-grid">
          <button className="home-todo" onClick={onFusion}>
            <span><ItemIcon kind="vessel_standard" size={20} /> 錬成釜</span>
            <b>2体を編む</b>
          </button>
          <button className="home-todo" onClick={onShop}>
            <span>🏪 ショップ</span>
            <b>道具を買う</b>
          </button>
          <button className="home-todo" onClick={onInn}>
            <span>🛏 宿で休む</span>
            <b>全回復</b>
          </button>
          <button className="home-todo" onClick={onTower}>
            <span>🗼 試練の塔</span>
            <b>ベスト {state.towerBest ?? 0}階</b>
          </button>
        </div>
      </section>

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
                <span className="item-ico"><MedalIcon id={a.id} done={done} size={38} /></span>
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
                {sel.mutant && <span title="変異種" style={{ marginLeft: 2 }}>✨</span>}
                {isActive && <span className="lead-tag">先頭</span>}
                <RarityBadge talent={sel.talent} />
                {sel.talent ? <span className="cmd-sub" style={{ marginLeft: 4 }}>才能{sel.talent}</span> : null}
              </span>
              <span className="mon-lv">Lv.{sel.level}</span>
            </div>
            <div className="detail-top">
              <div className="detail-portrait" onClick={() => setZoom(true)} style={{ cursor: 'zoom-in' }} title="タップで大きく見る">
                <Sprite id={sp.id} type={sp.type} size={120} mutant={sel.mutant} />
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

            {/* 特性 */}
            <h4 className="mini-title">とくせい</h4>
            <div className="move-chip" style={{ display: 'block' }}>
              <span className="mc-name">{abilityOf(sp).name}</span>
              <span className="dex-text" style={{ display: 'block', marginTop: 2 }}>{abilityOf(sp).desc}</span>
            </div>

            {/* もちもの(装備) */}
            <h4 className="mini-title">育成強化</h4>
            <div className="training-grid">
              <button
                className="training-btn"
                disabled={!canUseTalentStone}
                onClick={() => {
                  if (!canUseTalentStone) return
                  audio.sfx('coin')
                  setState((s) => ({
                    ...s,
                    mats: { talentStone: Math.max(0, (s.mats?.talentStone ?? 0) - 1), slotCharm: s.mats?.slotCharm ?? 0 },
                    collection: s.collection.map((o) => (o.uid === sel.uid ? { ...o, talent: Math.min(10, (o.talent ?? 0) + 1) } : o)),
                  }))
                }}
              >
                <span>才能石を使う</span>
                <b>才能 {sel.talent ?? 0} → {Math.min(10, (sel.talent ?? 0) + 1)}</b>
                <small>所持 {talentStoneCount}</small>
              </button>
              <button
                className="training-btn"
                disabled={!canUseTraitCharm}
                onClick={() => {
                  if (!canUseTraitCharm) return
                  audio.sfx('coin')
                  setState((s) => ({
                    ...s,
                    mats: { talentStone: s.mats?.talentStone ?? 0, slotCharm: Math.max(0, (s.mats?.slotCharm ?? 0) - 1) },
                    collection: s.collection.map((o) => (o.uid === sel.uid ? { ...o, traitBoost: Math.min(5, (o.traitBoost ?? 0) + 1) } : o)),
                  }))
                }}
              >
                <span>特性鍛錬</span>
                <b>Lv.{traitLevel} → {Math.min(5, traitLevel + 1)}</b>
                <small>所持 {slotCharmCount}</small>
              </button>
            </div>
            <p className="dex-text" style={{ marginTop: 4 }}>特性鍛錬は基礎能力を少し底上げします。クイック決着の勝率にも反映されます。</p>
            <h4 className="mini-title">もちもの</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {sel.heldItem && <ItemIcon kind={sel.heldItem} size={28} />}
              <select
                value={sel.heldItem ?? ''}
                onChange={(e) => {
                  const v = e.target.value || undefined
                  audio.sfx('select')
                  setState((s) => ({ ...s, collection: s.collection.map((o) => (o.uid === sel.uid ? { ...o, heldItem: v } : o)) }))
                }}
                style={{ flex: 1, fontSize: 13, padding: '5px 8px', borderRadius: 6, background: 'rgba(20,16,10,0.5)', color: '#f3e6c4', border: '1px solid rgba(212,175,90,0.4)' }}
              >
                <option value="">（なし）</option>
                {HELD_ITEM_IDS.map((id) => (
                  <option key={id} value={id}>{HELD_ITEMS[id].name}</option>
                ))}
              </select>
            </div>
            {sel.heldItem && HELD_ITEMS[sel.heldItem] && <p className="dex-text" style={{ marginTop: 4 }}>{HELD_ITEMS[sel.heldItem].desc}</p>}

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h3 className="section-title" style={{ margin: '12px 0 6px' }}>📦 預かり所 {boxMons.length}体</h3>
            {boxMons.length > 1 && (
              <select
                value={boxSort}
                onChange={(e) => setBoxSort(e.target.value as typeof boxSort)}
                style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, background: 'rgba(20,16,10,0.5)', color: '#f3e6c4', border: '1px solid rgba(212,175,90,0.4)' }}
              >
                <option value="dex">図鑑番号順</option>
                <option value="level">レベル順</option>
                <option value="rarity">レア度順</option>
                <option value="type">タイプ順</option>
              </select>
            )}
          </div>
          <div className="party-list">
            {boxMons.length === 0 && <span className="ink-dim">預かり所は からっぽ。捕まえすぎたら ここに あずかるよ。</span>}
            {sortedBox.map((o) => monRow(o, 'box'))}
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

          {/* 記章一覧(8枠グリッド・未取得はグレー) */}
          <h3 className="section-title">獲得記章 {state.badges.length}/8</h3>
          <div className="badge-grid">
            {ALL_BADGES.map((b) => {
              const owned = state.badges.includes(b.name)
              return (
                <div key={b.slug} className={`badge-cell${owned ? '' : ' locked'}`} title={owned ? b.name : '？？？'}>
                  <BadgeIcon slug={b.slug} owned={owned} size={52} />
                  <span className="badge-cap">{owned ? b.name.replace('の記章', '') : '？？？'}</span>
                </div>
              )
            })}
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
          <div className="item-row">
            <span className="item-ico"><ItemIcon kind="heal3" size={32} /></span>
            <div className="grow"><div className="item-name">全癒の秘薬</div><div className="item-desc">手持ち全員を全回復する</div></div>
            <span className="item-count">×{state.items.heal3}</span>
            <button className="title-btn" style={{ padding: '5px 10px', fontSize: 12 }} disabled={state.items.heal3 <= 0} onClick={useHeal3}>使う</button>
          </div>
          <div className="item-row">
            <span className="item-ico"><ItemIcon kind="exp_tome" size={32} /></span>
            <div className="grow"><div className="item-name">経験の古書</div><div className="item-desc">選択中の幻獣に経験値を与える</div></div>
            <span className="item-count">×{state.items.exp_tome}</span>
            <button className="title-btn" style={{ padding: '5px 10px', fontSize: 12 }} disabled={state.items.exp_tome <= 0} onClick={() => spendSelectedExpItem('exp_tome', 160)}>使う</button>
          </div>
          <div className="item-row">
            <span className="item-ico"><ItemIcon kind="evo_dust" size={32} /></span>
            <div className="grow"><div className="item-name">進化の香粉</div><div className="item-desc">選択中の幻獣を1Lvぶん成長させる</div></div>
            <span className="item-count">×{state.items.evo_dust}</span>
            <button className="title-btn" style={{ padding: '5px 10px', fontSize: 12 }} disabled={state.items.evo_dust <= 0} onClick={() => spendSelectedExpItem('evo_dust', expToNext(sel.level))}>使う</button>
          </div>
          <div className="item-row">
            <span className="item-ico"><ItemIcon kind="trait_elixir" size={32} /></span>
            <div className="grow"><div className="item-name">特性の霊薬</div><div className="item-desc">選択中の特性鍛錬Lvを上げる</div></div>
            <span className="item-count">×{state.items.trait_elixir}</span>
            <button className="title-btn" style={{ padding: '5px 10px', fontSize: 12 }} disabled={state.items.trait_elixir <= 0 || traitLevel >= 5} onClick={useTraitElixir}>使う</button>
          </div>
          <div className="item-row">
            <span className="item-ico"><ItemIcon kind="catch_charm" size={32} /></span>
            <div className="grow"><div className="item-name">捕獲のお守り</div><div className="item-desc">クイック探索の捕獲率を上げ、捕獲時に1つ消費</div></div>
            <span className="item-count">×{state.items.catch_charm}</span>
          </div>
          <div className="item-row">
            <span className="item-ico"><ItemIcon kind="revive" size={32} /></span>
            <div className="grow"><div className="item-name">目覚めの羽根</div><div className="item-desc">選択中の幻獣を復帰させる</div></div>
            <span className="item-count">×{state.items.revive}</span>
            <button className="title-btn" style={{ padding: '5px 10px', fontSize: 12 }} disabled={state.items.revive <= 0} onClick={useRevive}>使う</button>
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
        <button className="move-btn subtle" onClick={onField}>
          <span className="move-name">🗺 フィールドを歩く</span>
          <span className="move-meta">世界を眺めながら探索する</span>
        </button>
        <button className="move-btn" onClick={onDex}>
          <span className="move-name">📖 幻獣図鑑をひらく</span>
          <span className="move-meta">{state.caught.length}/{DEX_TOTAL} 体を記録</span>
        </button>
        <button className="move-btn" onClick={() => setShowHelp(true)}>
          <span className="move-name">📘 遊び方・相性表</span>
          <span className="move-meta">タイプ相性と基本ルール</span>
        </button>
      </div>

      {/* 遊び方・相性表 */}
      {showHelp && (() => {
        const types = typechart.types as string[]
        const chart = typechart.chart as Record<string, Record<string, number>>
        const cell = (atk: string, def: string) => {
          const v = chart[atk]?.[def] ?? 1
          if (v >= 2) return { t: '◎', c: '#43c463' }
          if (v === 0) return { t: '✕', c: '#888' }
          if (v < 1) return { t: '△', c: '#e2563b' }
          return { t: '', c: '' }
        }
        return (
          <div onClick={() => setShowHelp(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(10,8,5,0.94)', overflow: 'auto', padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, margin: '0 auto', color: '#f3e6c4' }}>
              <div className="card-head">
                <span className="mon-name">📘 遊び方・タイプ相性</span>
                <button className="modal-close" onClick={() => setShowHelp(false)}>×</button>
              </div>
              <ul className="dex-text" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
                <li>高草を歩くと野生の幻獣が現れる。フラスコで捕獲、戦って育てよう。</li>
                <li>技には<b>タイプ相性</b>があり、効果ばつぐん(◎=2倍)を突くと有利。✕は無効。</li>
                <li>同じ幻獣でも<b>レア度(★)</b>で強さが違う。配合(錬成)で更に強い個体が生まれる。</li>
                <li>本拠地の転送門から各世界へ。守護者を倒し記章を集めよう。</li>
              </ul>
              <h3 className="section-title">タイプ相性表（縦＝攻撃 / 横＝防御）</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12, margin: '0 auto' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: 2 }}></th>
                      {types.map((d) => (
                        <th key={d} style={{ padding: '2px 1px', color: TYPE_COLORS[d], fontWeight: 700 }}>{d}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {types.map((atk) => (
                      <tr key={atk}>
                        <th style={{ padding: '2px 4px', color: TYPE_COLORS[atk], fontWeight: 700, textAlign: 'right' }}>{atk}</th>
                        {types.map((def) => {
                          const c = cell(atk, def)
                          return (
                            <td key={def} style={{ width: 22, height: 22, textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)', color: c.c, fontWeight: 700 }}>{c.t}</td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="cmd-sub" style={{ textAlign: 'center', marginTop: 8 }}>◎=こうかばつぐん(2倍) ／ △=いまひとつ(0.5倍) ／ ✕=効果なし ／ 空欄=等倍</p>
            </div>
          </div>
        )
      })()}

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
          <Sprite id={sp.id} type={sp.type} size={Math.min(300, Math.round(window.innerWidth * 0.74))} mutant={sel.mutant} />
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
