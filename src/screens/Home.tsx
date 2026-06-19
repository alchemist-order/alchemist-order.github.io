import type { GameState, OwnedMonster } from '../types'
import { DEX_TOTAL, expToNext, species } from '../game/state'
import { Sprite, TypeBadge } from '../ui'

interface Props {
  state: GameState
  setActive: (uid: string) => void
  onField: () => void
  onDex: () => void
}

export default function Home({ state, setActive, onField, onDex }: Props) {
  const active = state.collection.find((o) => o.uid === state.activeUid) ?? state.collection[0]
  const sp = species(active.speciesId)
  const expNeed = expToNext(active.level)
  const expRatio = Math.min(1, active.exp / expNeed)

  return (
    <div className="screen">
      <header className="home-header">
        <h1>アルケミスト・オーダー</h1>
        <div className="home-stats">
          <span>図鑑 {state.caught.length}/{DEX_TOTAL}</span>
          <span>🎖 記章 {state.badges.length}</span>
          <span>🔮 フラスコ {state.flasks}</span>
        </div>
      </header>

      <div className="card player active-mon">
        <div className="card-head">
          <span className="mon-name">{sp.name}</span>
          <span className="mon-lv">Lv.{active.level}</span>
        </div>
        <div className="row">
          <Sprite id={sp.id} type={sp.type} size={72} />
          <div className="grow">
            <div className="badges">
              <TypeBadge t={sp.type} />
              {sp.type2 && <TypeBadge t={sp.type2} />}
            </div>
            <div className="exp-label">
              EXP {active.exp} / {expNeed}
            </div>
            <div className="hpbar-outer">
              <div className="hpbar-inner" style={{ width: `${expRatio * 100}%`, background: '#6fb3e2' }} />
            </div>
            <p className="dex-text">{sp.dex_text}</p>
          </div>
        </div>
      </div>

      <h3 className="section-title">手持ちの幻獣（タップで先頭に）</h3>
      <div className="party-strip">
        {state.collection.map((o: OwnedMonster) => {
          const s = species(o.speciesId)
          const isActive = o.uid === active.uid
          return (
            <button
              key={o.uid}
              className={`party-chip ${isActive ? 'sel' : ''}`}
              onClick={() => setActive(o.uid)}
            >
              <Sprite id={s.id} type={s.type} size={40} />
              <span className="chip-name">{s.name}</span>
              <span className="chip-lv">Lv.{o.level}</span>
            </button>
          )
        })}
      </div>

      <div className="moves" style={{ marginTop: 20 }}>
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
