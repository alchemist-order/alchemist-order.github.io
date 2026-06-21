import { useEffect, useState } from 'react'
import type { BattleConfig, GameState } from './types'
import type { Npc } from './game/maps'
import {
  STARTER_IDS,
  hasFlag,
  healParty,
  loadGame,
  makeOwned,
  newGame,
  saveGame,
  species,
  withCaught,
  withFlag,
  withSeen,
} from './game/state'
import * as audio from './game/audio'
import { Sprite, TypeBadge } from './ui'
import Home from './screens/Home'
import Battle from './screens/Battle'
import Dex from './screens/Dex'
import Field from './screens/Field'
import Opening from './screens/Opening'
import Dialogue from './screens/Dialogue'

type Phase = 'title' | 'opening' | 'game'
type Screen = 'field' | 'home' | 'battle' | 'dex'
interface DialogueData {
  speaker?: string
  portrait?: string
  lines: string[]
  after?: () => void
}

const STARTER_LEVEL = 8
const STARTER_FLASKS = 8

const titleBg = {
  backgroundColor: '#15120d',
  backgroundImage: `linear-gradient(rgba(18,15,10,0.55), rgba(18,15,10,0.82)), url(${import.meta.env.BASE_URL}bg/title.jpg)`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
}

export default function App() {
  const [game, setGame] = useState<GameState>(() => loadGame() ?? newGame())
  const [phase, setPhase] = useState<Phase>('title')
  const [screen, setScreen] = useState<Screen>('field')
  const [battleConfig, setBattleConfig] = useState<BattleConfig | null>(null)
  const [muted, setMuted] = useState(audio.isMuted())
  const [dialogue, setDialogue] = useState<DialogueData | null>(null)
  const [starterOpen, setStarterOpen] = useState(false)

  useEffect(() => {
    saveGame(game)
  }, [game])

  useEffect(() => {
    const h = () => audio.unlock()
    window.addEventListener('pointerdown', h, { once: true })
    window.addEventListener('keydown', h, { once: true })
    return () => {
      window.removeEventListener('pointerdown', h)
      window.removeEventListener('keydown', h)
    }
  }, [])

  useEffect(() => {
    let key = 'title'
    if (phase === 'game') {
      const townMaps = ['rapis', 'mentor_house', 'home', 'home2f', 'inn']
      if (screen === 'battle') key = battleConfig?.kind === 'trainer' ? 'boss' : 'battle'
      else key = townMaps.includes(game.pos.mapId) ? 'town' : game.pos.mapId === 'forest' ? 'forest' : 'field'
    }
    audio.playBgm(key)
  }, [phase, screen, battleConfig, game.pos.mapId])

  const hasSave = game.collection.length > 0
  const active = game.collection.find((o) => o.uid === game.activeUid) ?? game.collection[0]
  const startBattle = (config: BattleConfig) => {
    setBattleConfig(config)
    setScreen('battle')
  }

  // NPCに話しかけたとき
  const onTalk = (npc: Npc) => {
    if (npc.kind === 'mentor') {
      if (game.collection.length === 0) {
        setDialogue({
          speaker: '師ガレン',
          portrait: 'mentor',
          lines: [
            'よく来たな。今日からおまえも 錬獣師としての一歩を踏み出すのだ。',
            'この三つの核から、共に往く幻獣を ひとつ選びなさい。',
          ],
          after: () => setStarterOpen(true),
        })
      } else {
        setDialogue({
          speaker: '師ガレン',
          portrait: 'mentor',
          lines: ['いい相棒を選んだな。', '各地のオーダー支部で 8つの記章を集めるのだ。北の森が最初の試練だぞ。'],
        })
      }
    } else if (npc.kind === 'mom') {
      if (!hasFlag(game, 'mom_gift')) {
        setDialogue({
          speaker: 'おかあさん',
          portrait: 'mom',
          lines: ['あら、いよいよ旅立ちね。', 'これを持っていきなさい。傷薬を3つ。無理だけはしないでね。'],
          after: () => setGame((s) => withFlag({ ...s, items: { ...s.items, heal: s.items.heal + 3 } }, 'mom_gift')),
        })
      } else {
        setDialogue({ speaker: 'おかあさん', portrait: 'mom', lines: ['体に気をつけてね。いつでも帰っておいで。'] })
      }
    } else if (npc.kind === 'inn') {
      setDialogue({
        speaker: '宿屋の主人',
        portrait: 'inn',
        lines: ['ようこそ宿屋へ。ゆっくり休んでいきな。', '……すぅ……zzz……', '幻獣たちは すっかり元気になった！'],
        after: () => setGame((s) => healParty(s)),
      })
    } else {
      setDialogue({ speaker: npc.name, lines: ['……'] })
    }
  }

  const onBlockedExit = () => {
    setDialogue({ lines: ['まだ共に往く幻獣がいない。', '師ガレンに 話しかけて 最初の相棒を 受け取ろう。'] })
  }

  const pickStarter = (id: string) => {
    const owned = makeOwned(id, STARTER_LEVEL)
    setGame((s) => {
      let next: GameState = { ...s, collection: [owned], activeUid: owned.uid, flasks: STARTER_FLASKS }
      next = withCaught(withSeen(next, id), id)
      return next
    })
    setStarterOpen(false)
    setDialogue({
      speaker: '師ガレン',
      portrait: 'mentor',
      lines: ['その子が おまえの最初の相棒だ。大切に育てなさい。', '村の出口の先、緑霧の森へ。気をつけて行くのだぞ。'],
    })
  }

  let content: JSX.Element

  if (phase === 'title') {
    content = (
      <div className="title-screen" style={titleBg}>
        <div className="title-logo">
          <h1>錬金幻獣録</h1>
          <h2>アルケミスト・オーダー</h2>
        </div>
        <div className="title-buttons">
          {hasSave && (
            <button
              className="title-btn primary"
              onClick={() => {
                setScreen('field')
                setPhase('game')
              }}
            >
              つづきから
            </button>
          )}
          <button className={`title-btn ${hasSave ? '' : 'primary'}`} onClick={() => setPhase('opening')}>
            {hasSave ? 'さいしょから' : 'はじめる'}
          </button>
        </div>
        <p className="title-foot">全100体・9属性 / 育成RPG</p>
      </div>
    )
  } else if (phase === 'opening') {
    content = (
      <Opening
        onDone={() => {
          // さいしょから: セーブを初期化して村へ
          setGame(newGame())
          setScreen('field')
          setPhase('game')
        }}
      />
    )
  } else if (screen === 'home' && active) {
    content = (
      <Home
        state={game}
        setActive={(uid) => setGame((s) => ({ ...s, activeUid: uid }))}
        onField={() => setScreen('field')}
        onDex={() => setScreen('dex')}
      />
    )
  } else if (screen === 'battle' && battleConfig && active) {
    content = (
      <Battle
        active={active}
        config={battleConfig}
        state={game}
        setState={setGame}
        onExit={() => setScreen('field')}
      />
    )
  } else if (screen === 'dex') {
    content = <Dex state={game} onBack={() => setScreen('home')} />
  } else {
    content = (
      <Field
        state={game}
        setState={setGame}
        onStartBattle={startBattle}
        onMenu={() => setScreen('home')}
        onTalk={onTalk}
        onBlockedExit={onBlockedExit}
      />
    )
  }

  return (
    <div className="app">
      <button className="mute-btn" onClick={() => setMuted(audio.toggleMute())} aria-label="BGMオン/オフ" title="BGMオン/オフ">
        {muted ? '🔇' : '🔊'}
      </button>
      {content}

      {dialogue && (
        <Dialogue
          speaker={dialogue.speaker}
          portrait={dialogue.portrait}
          lines={dialogue.lines}
          onDone={() => {
            const after = dialogue.after
            setDialogue(null)
            after?.()
          }}
        />
      )}

      {starterOpen && (
        <div className="modal-backdrop">
          <div className="modal starter-modal">
            <p className="subtitle" style={{ marginTop: 0 }}>師「さあ――共に往く相棒を、選びなさい。」</p>
            <div className="starter-grid">
              {STARTER_IDS.map((id) => {
                const m = species(id)
                return (
                  <button key={id} className="starter" onClick={() => pickStarter(id)}>
                    <Sprite id={id} type={m.type} size={64} />
                    <div className="mon-name">{m.name}</div>
                    <TypeBadge t={m.type} />
                    <p className="dex-text">{m.dex_text}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
