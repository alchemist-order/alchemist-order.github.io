import { useEffect, useState } from 'react'
import type { BattleConfig, GameState, TrainerData } from './types'
import type { Chest, Npc } from './game/maps'
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
import { GetMonsterOverlay, Sprite, TitleLogo, TypeBadge } from './ui'
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
  const [getMon, setGetMon] = useState<{ id: string; name: string; type: string; label?: string; after?: () => void } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [vol, setVol] = useState(audio.getVolume())
  const [sfxOn, setSfxOn] = useState(audio.isSfxOn())

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

  // ボタンを押したら効果音(全ボタン共通)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t?.closest) return
      if (t.closest('.dpad-btn')) return // 移動ボタンは無音
      if (t.closest('button')) audio.sfx('select')
    }
    window.addEventListener('click', h)
    return () => window.removeEventListener('click', h)
  }, [])

  useEffect(() => {
    let key = 'title'
    if (phase === 'game') {
      const townMaps = ['rapis', 'mentor_house', 'home', 'home2f', 'inn', 'port']
      if (screen === 'battle') key = battleConfig?.kind === 'trainer' ? 'boss' : 'battle'
      else key = townMaps.includes(game.pos.mapId) ? 'town' : game.pos.mapId === 'forest' ? 'forest' : 'field'
    }
    audio.playBgm(key)
  }, [phase, screen, battleConfig, game.pos.mapId])

  const hasSave = game.collection.length > 0
  const active = game.collection.find((o) => o.uid === game.activeUid) ?? game.collection[0]
  const startBattle = (config: BattleConfig) => {
    audio.sfx('encounter')
    setBattleConfig(config)
    setScreen('battle')
  }

  // 支部長に接触: 戦前の台詞→バトル
  const onTrainer = (trainer: TrainerData, biome: string) => {
    if (trainer.preBattle?.length) {
      setDialogue({
        speaker: trainer.name,
        portrait: trainer.portrait,
        lines: trainer.preBattle,
        after: () => startBattle({ kind: 'trainer', trainer, biome }),
      })
    } else {
      startBattle({ kind: 'trainer', trainer, biome })
    }
  }

  // バトル終了→フィールド。トレーナーに勝っていれば戦後の台詞
  const handleBattleExit = () => {
    setScreen('field')
    const cfg = battleConfig
    if (cfg?.kind === 'trainer' && cfg.trainer.postBattle?.length && game.defeatedTrainers.includes(cfg.trainer.id)) {
      setDialogue({ speaker: cfg.trainer.name, portrait: cfg.trainer.portrait, lines: cfg.trainer.postBattle })
    }
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
      setDialogue({ speaker: npc.name, portrait: npc.portrait, lines: npc.lines ?? ['……'] })
    }
  }

  const onBlockedExit = (msg: string) => {
    setDialogue({ lines: [msg] })
  }

  // 宝箱を開ける(開封済みは flag で保存)
  const onChest = (chest: Chest) => {
    const flag = `chest_${chest.id}`
    if (hasFlag(game, flag)) {
      setDialogue({ lines: ['からっぽの 宝箱だ。'] })
      return
    }
    setGame((s) => {
      let ns = withFlag(s, flag)
      if (chest.item === 'money') ns = { ...ns, money: ns.money + chest.amount }
      else if (chest.item === 'flask') ns = { ...ns, flasks: ns.flasks + chest.amount }
      else ns = { ...ns, items: { ...ns.items, [chest.item]: ns.items[chest.item] + chest.amount } }
      return ns
    })
    audio.sfx('catch')
    const label =
      chest.item === 'money'
        ? `💰 ${chest.amount}ゲル`
        : chest.item === 'flask'
          ? `🔮 封獣フラスコ × ${chest.amount}`
          : chest.item === 'heal2'
            ? `🧪 上傷薬 × ${chest.amount}`
            : `🧪 傷薬 × ${chest.amount}`
    setDialogue({ lines: ['たからばこを 開けた！', `${label} を 手に入れた！`] })
  }

  const pickStarter = (id: string) => {
    const owned = makeOwned(id, STARTER_LEVEL)
    setGame((s) => {
      let next: GameState = { ...s, collection: [owned], activeUid: owned.uid, flasks: STARTER_FLASKS }
      next = withCaught(withSeen(next, id), id)
      return next
    })
    setStarterOpen(false)
    const m = species(id)
    audio.sfx('catch')
    setGetMon({
      id,
      name: m.name,
      type: m.type,
      label: 'を 相棒にした！',
      after: () =>
        setDialogue({
          speaker: '師ガレン',
          portrait: 'mentor',
          lines: [
            '……いい目だ。その子が、おまえの最初の相棒。大切に育てなさい。',
            '強さとは、勝つ数ではない。共に時を重ねた証だ。',
            'さあ、行きなさい。村の出口の先、緑霧の森へ。',
          ],
        }),
    })
  }

  let content: JSX.Element

  if (phase === 'title') {
    content = (
      <div className="title-screen" style={titleBg}>
        <TitleLogo />
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
        onExit={handleBattleExit}
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
        onTrainer={onTrainer}
        onChest={onChest}
        onMenu={() => setScreen('home')}
        onTalk={onTalk}
        onBlockedExit={onBlockedExit}
      />
    )
  }

  return (
    <div className="app">
      <div className="topbar-btns">
        <button className="mute-btn" onClick={() => setMuted(audio.toggleMute())} aria-label="BGMオン/オフ" title="BGMオン/オフ">
          {muted ? '🔇' : '🔊'}
        </button>
        <button className="mute-btn" onClick={() => setSettingsOpen(true)} aria-label="設定" title="設定">
          ⚙
        </button>
      </div>
      {content}

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-head">
              <span className="mon-name">⚙ 設定</span>
              <button className="modal-close" onClick={() => setSettingsOpen(false)}>×</button>
            </div>
            <div className="setting-row">
              <span className="setting-label">音量　<b>{Math.round(vol * 100)}</b></span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(vol * 100)}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100
                  setVol(v)
                  audio.setVolume(v)
                }}
              />
            </div>
            <div className="setting-row">
              <span className="setting-label">BGM</span>
              <button
                className={`toggle-btn ${muted ? '' : 'on'}`}
                onClick={() => setMuted(audio.toggleMute())}
              >
                {muted ? 'オフ' : 'オン'}
              </button>
            </div>
            <div className="setting-row">
              <span className="setting-label">効果音</span>
              <button
                className={`toggle-btn ${sfxOn ? 'on' : ''}`}
                onClick={() => setSfxOn(audio.toggleSfx())}
              >
                {sfxOn ? 'オン' : 'オフ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {getMon && (
        <GetMonsterOverlay
          id={getMon.id}
          name={getMon.name}
          type={getMon.type}
          label={getMon.label}
          onClose={() => {
            const after = getMon.after
            setGetMon(null)
            after?.()
          }}
        />
      )}

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
                  onClick={() => {
                    if (game.money < it.price) return
                    audio.sfx('coin')
                    setGame((s) => (s.money >= it.price ? it.apply({ ...s, money: s.money - it.price }) : s))
                  }}
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
