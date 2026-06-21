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

const SHOP_ITEMS: { key: string; name: string; desc: string; price: number; apply: (s: GameState) => GameState }[] = [
  { key: 'heal', name: '傷薬', desc: 'HP60%回復', price: 200, apply: (s) => ({ ...s, items: { ...s.items, heal: s.items.heal + 1 } }) },
  { key: 'heal2', name: '上傷薬', desc: 'HP全回復', price: 600, apply: (s) => ({ ...s, items: { ...s.items, heal2: s.items.heal2 + 1 } }) },
  { key: 'flask', name: '封獣フラスコ', desc: '幻獣を捕まえる', price: 150, apply: (s) => ({ ...s, flasks: s.flasks + 1 }) },
]

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
  const [shopOpen, setShopOpen] = useState(false)

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
            'よく来た。今日からおまえも、錬獣師としての一歩を踏み出すのだ。',
            'この三つの核には、それぞれ異なる命が眠っている。――心で選びなさい。',
          ],
          after: () => setStarterOpen(true),
        })
      } else {
        setDialogue({
          speaker: '師ガレン',
          portrait: 'mentor',
          lines: ['各地のオーダー支部で、八つの記章を集めよ。それが一人前の証だ。', '……灰化が広がっている。急くな。だが、目を逸らすな。'],
        })
      }
    } else if (npc.kind === 'mom') {
      if (!hasFlag(game, 'mom_gift')) {
        setDialogue({
          speaker: 'おかあさん',
          portrait: 'mom',
          lines: [
            'あら、起きたのね。……ふふ、いい顔。もう"その日"だって、わかってるみたい。',
            'これを持っていって。傷薬を三つ。あなたの幻獣が傷ついたら、使ってあげるのよ。',
            '無理だけはしないで。……強くなって帰ってきてくれれば、それでいいの。',
          ],
          after: () => setGame((s) => withFlag({ ...s, items: { ...s.items, heal: s.items.heal + 3 } }, 'mom_gift')),
        })
      } else {
        setDialogue({ speaker: 'おかあさん', portrait: 'mom', lines: ['おかえり。少し背が伸びた……気がするわ。気のせいかしら。ふふ。'] })
      }
    } else if (npc.kind === 'inn') {
      setDialogue({
        speaker: '宿屋の主人',
        portrait: 'inn',
        lines: [
          'よう、見ない顔だ……って、リーゼんとこの子か！ 旅立ちかい。',
          'うちで休んでいきな。幻獣ってのは、人と同じだ。眠れば、ちゃんと元気になる。',
          '……ほら、すっかり顔色が戻った。気をつけて行きな！',
        ],
        after: () => setGame((s) => healParty(s)),
      })
    } else if (npc.kind === 'shop') {
      setShopOpen(true)
    } else {
      setDialogue({ speaker: npc.name, lines: npc.lines ?? ['……'] })
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
      lines: [
        '……いい目だ。その子が、おまえの最初の相棒。大切に育てなさい。',
        '強さとは、勝つ数ではない。共に時を重ねた証だ。',
        'さあ、行きなさい。村の出口の先、緑霧の森へ。',
      ],
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

      {shopOpen && (
        <div className="modal-backdrop" onClick={() => setShopOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-head">
              <span className="mon-name">🛒 道具屋のラル</span>
              <button className="modal-close" onClick={() => setShopOpen(false)}>×</button>
            </div>
            <p className="dex-text">「いらっしゃい。何にするね？」　所持金 💰{game.money} ゲル</p>
            {SHOP_ITEMS.map((it) => (
              <div key={it.key} className="shop-row">
                <span className="shop-name">{it.name}<span className="cmd-sub">　{it.desc}</span></span>
                <span className="shop-price">💰{it.price}</span>
                <button
                  className="title-btn"
                  style={{ padding: '6px 14px', fontSize: 14 }}
                  disabled={game.money < it.price}
                  onClick={() => setGame((s) => (s.money >= it.price ? it.apply({ ...s, money: s.money - it.price }) : s))}
                >
                  かう
                </button>
              </div>
            ))}
          </div>
        </div>
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
