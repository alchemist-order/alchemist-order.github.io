import { useEffect, useState } from 'react'
import type { BattleConfig, GameState } from './types'
import {
  STARTER_IDS,
  loadGame,
  makeOwned,
  newGame,
  saveGame,
  species,
  withCaught,
  withSeen,
} from './game/state'
import { Sprite, TypeBadge } from './ui'
import Home from './screens/Home'
import Battle from './screens/Battle'
import Dex from './screens/Dex'
import Field from './screens/Field'

type Screen = 'field' | 'home' | 'battle' | 'dex'

const STARTER_LEVEL = 8
const STARTER_FLASKS = 8

export default function App() {
  const [game, setGame] = useState<GameState>(() => loadGame() ?? newGame())
  const [screen, setScreen] = useState<Screen>('field')
  const [battleConfig, setBattleConfig] = useState<BattleConfig | null>(null)

  useEffect(() => {
    saveGame(game)
  }, [game])

  // ── タイトル(御三家選択) ──
  if (game.collection.length === 0) {
    const pick = (id: string) => {
      const owned = makeOwned(id, STARTER_LEVEL)
      setGame((s) => {
        let next: GameState = {
          ...s,
          collection: [owned],
          activeUid: owned.uid,
          flasks: STARTER_FLASKS,
        }
        next = withSeen(next, id)
        next = withCaught(next, id)
        return next
      })
      setScreen('field')
    }
    return (
      <div className="app">
        <header>
          <h1>錬金幻獣録</h1>
          <h2>アルケミスト・オーダー</h2>
          <p className="subtitle">— 最初の相棒（御三家）をえらぼう —</p>
        </header>
        <div className="starter-grid">
          {STARTER_IDS.map((id) => {
            const m = species(id)
            return (
              <button key={id} className="starter" onClick={() => pick(id)}>
                <Sprite id={m.id} type={m.type} size={64} />
                <div className="mon-name">{m.name}</div>
                <TypeBadge t={m.type} />
                <p className="dex-text">{m.dex_text}</p>
              </button>
            )
          })}
        </div>
        <footer>全100体・9属性 / 育成RPG試作 (MVP-3)</footer>
      </div>
    )
  }

  const active = game.collection.find((o) => o.uid === game.activeUid) ?? game.collection[0]

  const startBattle = (config: BattleConfig) => {
    setBattleConfig(config)
    setScreen('battle')
  }

  return (
    <div className="app">
      {screen === 'field' && (
        <Field state={game} setState={setGame} onStartBattle={startBattle} onMenu={() => setScreen('home')} />
      )}
      {screen === 'home' && (
        <Home
          state={game}
          setActive={(uid) => setGame((s) => ({ ...s, activeUid: uid }))}
          onField={() => setScreen('field')}
          onDex={() => setScreen('dex')}
        />
      )}
      {screen === 'battle' && battleConfig && (
        <Battle
          active={active}
          config={battleConfig}
          state={game}
          setState={setGame}
          onExit={() => setScreen('field')}
        />
      )}
      {screen === 'dex' && <Dex state={game} onBack={() => setScreen('home')} />}
    </div>
  )
}
