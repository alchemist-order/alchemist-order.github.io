import { useEffect, useRef, useState } from 'react'
import type { BattleConfig, GameState, TrainerData } from './types'
import type { Chest, Npc, NushiSpot, RuneSwitch } from './game/maps'
import { WORLDS } from './game/maps'
import {
  FUSION_COST,
  PARTY_MAX,
  STARTER_IDS,
  applyDailyLogin,
  currentObjective,
  exportSave,
  getParty,
  importSave,
  rollTalent,
  fuseResult,
  hasFlag,
  healParty,
  loadGame,
  makeOwned,
  newGame,
  playerTitle,
  rarityOf,
  saveGame,
  setLeader,
  species,
  withCaught,
  withFlag,
  withSeen,
} from './game/state'
import * as audio from './game/audio'
import { track } from './game/analytics'
import { GetMonsterOverlay, ItemIcon, Sprite, TitleLogo, TypeBadge } from './ui'
import Home from './screens/Home'
import Battle from './screens/Battle'
import Dex from './screens/Dex'
import Field from './screens/Field'
import Opening from './screens/Opening'
import Dialogue from './screens/Dialogue'
import ShareCard, { type ShareData } from './screens/ShareCard'

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
  {
    key: 'talentStone',
    name: '才能の結晶',
    desc: '錬成で才能+1追加',
    price: 1500,
    apply: (s) => ({ ...s, mats: { talentStone: (s.mats?.talentStone ?? 0) + 1, slotCharm: s.mats?.slotCharm ?? 0 } }),
  },
  {
    key: 'slotCharm',
    name: '継承の符',
    desc: '錬成で遺伝枠+1',
    price: 1200,
    apply: (s) => ({ ...s, mats: { talentStone: s.mats?.talentStone ?? 0, slotCharm: (s.mats?.slotCharm ?? 0) + 1 } }),
  },
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
  const [worldsOpen, setWorldsOpen] = useState(false)
  const [tower, setTower] = useState<{ floor: number; cleared: number; seed: string } | null>(null)
  const [shareData, setShareData] = useState<ShareData | null>(null)
  const [homeTab, setHomeTab] = useState<'party' | 'items' | 'note' | 'record'>('party')
  const [getMon, setGetMon] = useState<{ id: string; name: string; type: string; label?: string; talent?: number; after?: () => void } | null>(null)
  const [fusionOpen, setFusionOpen] = useState(false)
  const [fuseA, setFuseA] = useState<string | null>(null)
  const [fuseB, setFuseB] = useState<string | null>(null)
  const [fuseStone, setFuseStone] = useState(false)
  const [fuseCharm, setFuseCharm] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [backupCode, setBackupCode] = useState('') // セーブ書き出し表示用
  const [importText, setImportText] = useState('') // セーブ読み込み入力
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

  // ログインボーナス(日付が変わっていれば付与)。本編に入った時に1度だけ
  const loginRef = useRef(false)
  useEffect(() => {
    if (phase !== 'game' || loginRef.current) return
    loginRef.current = true
    const { state: ns, reward } = applyDailyLogin(game)
    setGame(() => ns)
    if (reward) {
      audio.sfx('coin')
      setDialogue({
        speaker: 'ログインボーナス',
        lines: [`${reward.streak}日 連続ログイン！`, `💰 ${reward.money}ゲル と 🔮 封獣フラスコ×${reward.flask} を 受け取った！`],
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    let key = 'title'
    if (phase === 'game') {
      const townMaps = ['rapis', 'mentor_house', 'home', 'home2f', 'inn', 'port', 'volcano_town']
      const dungeonMaps = ['forest', 'volcano_road'] // 専用BGM未配置のためダンジョンBGM(forest.mp3)を流用
      if (screen === 'battle') key = battleConfig?.kind === 'trainer' ? 'boss' : 'battle'
      else key = townMaps.includes(game.pos.mapId) ? 'town' : dungeonMaps.includes(game.pos.mapId) ? 'forest' : 'field'
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

  // 守護者に接触: 戦前の台詞→バトル
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
  const handleBattleExit = (won?: boolean) => {
    const cfg = battleConfig
    // 試練の塔: 勝てば次の階へ(再マウント)、倒れたら終了してスコア記録
    if (tower && cfg?.kind === 'wild' && cfg.tower) {
      if (won) {
        const next = { floor: tower.floor + 1, cleared: tower.cleared + 1, seed: tower.seed }
        setTower(next)
        setBattleConfig(towerConfig(next.floor, next.seed)) // screenはbattleのまま、keyで再マウント
        return
      }
      const reached = tower.cleared // 制覇した階数=スコア
      const prevBest = game.towerBest ?? 0
      const best = Math.max(prevBest, reached)
      setTower(null)
      setScreen('field')
      setGame((s) => ({ ...s, towerBest: Math.max(s.towerBest ?? 0, reached) }))
      track('tower_end', { reached, best, updated: reached > prevBest })
      // スコアカード用データ(相棒=挑戦時のアクティブ個体)。reached>0でダイアログ後に共有カードを出す
      const lead = game.collection.find((o) => o.uid === game.activeUid) ?? game.collection[0]
      const makeShare = (): ShareData | null => {
        if (reached <= 0 || !lead) return null
        const sp = species(lead.speciesId)
        return { reached, best, speciesId: lead.speciesId, monName: sp.name, type: sp.type, level: lead.level, talent: lead.talent, mutant: lead.mutant, playerName: game.playerName, title: playerTitle(game) }
      }
      setDialogue({
        speaker: '🗼 試練の塔',
        lines: [
          reached > 0 ? `今回の記録: ${reached}階 制覇！` : 'まさかの1階敗退……出直そう。',
          reached > prevBest ? `🏆 自己ベスト更新！(${best}階)` : `自己ベスト: ${best}階`,
          '編成・育成・道具の備えで、記録は伸ばせる。また挑もう。',
        ],
        after: () => { const sd = makeShare(); if (sd) setShareData(sd) },
      })
      return
    }
    setScreen('field')
    if (cfg?.kind === 'trainer' && cfg.trainer.postBattle?.length && game.defeatedTrainers.includes(cfg.trainer.id)) {
      setDialogue({ speaker: cfg.trainer.name, portrait: cfg.trainer.portrait, lines: cfg.trainer.postBattle })
      // KPI最重要: 守護者撃破(記章獲得)。何人目かも記録
      track('gym_defeated', { gym: cfg.trainer.id, badges: game.badges.length })
    }
    // ヌシ幻獣(パッケージD): 撃破/捕獲(won)で解放。逃走/敗北では再挑戦可能なままにする
    if (cfg?.kind === 'wild' && cfg.nushiId && won) {
      const flag = `nushi_${cfg.nushiId}`
      setGame((s) => (hasFlag(s, flag) ? s : withFlag(s, flag)))
      setDialogue({ lines: ['大きな気配が消えた。', '……道が 開けたようだ。'] })
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
            '来たか。……そこの釜の前に、立ちなさい。',
            'この三つの核には、それぞれ眠っている命がある。火のイグニフ。水のアクアブ。風のコグリフ。',
            'いいか。いちばん強そうな一匹を選ぶのではない。おまえが最後まで隣を歩ける一匹を、選ぶのだ。',
            '――心で、選びなさい。',
          ],
          after: () => setStarterOpen(true),
        })
      } else {
        setDialogue({
          speaker: '師ガレン',
          portrait: 'mentor',
          lines: [
            '各地には、アルケミスト・オーダーが認めた《守護者》がいる。彼らは土地と記章を守り、挑む者の力を試す。',
            '八つの記章を集めた者だけが、オーダーの中枢へ進む資格を得る――その奥に、いま大陸を蝕む"灰化"の元凶がいる。',
            'それと……そこのミルカの《錬成釜》を、見ておきなさい。二つの命を継ぎ、新たな命を編む――わしらの業の、いちばん深いところだ。',
            'まずは緑霧の森の守護者シルヴァに挑みなさい。急くな。だが、目を逸らすな。',
          ],
        })
      }
    } else if (npc.kind === 'mom') {
      if (!hasFlag(game, 'mom_gift')) {
        setDialogue({
          speaker: 'おかあさん',
          portrait: 'mom',
          lines: [
            'あら、起きたのね。……ふふ、いい顔。もう"その日"だって、わかってるみたい。',
            'これを持っていって。傷薬を五つ。あなたの幻獣が傷ついたら、使ってあげるのよ。',
            'いい？ 幻獣はね、道具じゃないの。いっしょに食べて、いっしょに眠る――家族なの。',
            '無理だけはしないで。……強くなって帰ってきてくれれば、母さんは それでいいの。',
          ],
          after: () => setGame((s) => withFlag({ ...s, items: { ...s.items, heal: s.items.heal + 5 } }, 'mom_gift')),
        })
      } else {
        setDialogue({
          speaker: 'おかあさん',
          portrait: 'mom',
          lines: ['おかえり。少し背が伸びた……気がするわ。ふふ、気のせいかしら。', 'ごはん、ちゃんと食べてる？ あなたの幻獣にも、なにか作ってあげたいわねえ。'],
        })
      }
    } else if (npc.kind === 'inn') {
      setDialogue({
        speaker: '宿屋の主人',
        portrait: 'inn',
        lines: [
          'よう、見ない顔だ……って、リーゼんとこの子か！ 旅立ちかい。',
          'うちで休んでいきな。幻獣ってのは、人と同じだ。眠れば、ちゃんと元気になる。',
          '……そういや、森帰りの行商人が妙なことを言ってたぜ。「霧の奥で、色のねえバケモンを見た」ってな。',
          '……ほら、すっかり顔色が戻った。気をつけて行きな！',
        ],
        after: () => setGame((s) => healParty(s)),
      })
    } else if (npc.kind === 'shop') {
      setShopOpen(true)
    } else if (npc.kind === 'storage') {
      setDialogue({
        speaker: npc.name,
        lines: ['預かり所へ ようこそ。たくさんの幻獣を あずかっているよ。', 'パーティの 入れ替え・並び替えは メニューの「手持ち」から どうぞ。'],
        after: () => { setHomeTab('party'); setScreen('home') },
      })
    } else if (npc.kind === 'records') {
      setDialogue({
        speaker: npc.name,
        lines: ['ようこそ、記録の間へ。あなたの歩みは すべて ここに刻まれている。', '名前も ここで決められる。……いずれ、世界中の錬獣師と 記録を競う日が来るだろう。'],
        after: () => { setHomeTab('record'); setScreen('home') },
      })
    } else if (npc.kind === 'portal') {
      if (game.collection.length === 0) {
        setDialogue({ lines: ['転送門は静かに眠っている。', 'まずは師ガレンに 話しかけて 最初の幻獣を 受け取ろう。'] })
      } else {
        setWorldsOpen(true)
      }
    } else if (npc.kind === 'alchemist') {
      if (game.collection.length < 2) {
        setDialogue({
          speaker: npc.name,
          lines: [
            'やあ、見習いくん。これが《錬成釜》――ふたつの命を、ひとつに編み直す 工房の心臓さ。',
            'ベースの幻獣に素材の幻獣を継げば、新しい種が生まれる。技も、才能も、ちゃんと受け継がれる。',
            '幻獣が2体そろったら、いつでもおいで。……心配いらない。命は消えるんじゃなく、かたちを変えて続いていくんだ。',
          ],
        })
      } else {
        setFuseA(null)
        setFuseB(null)
        setFuseStone(false)
        setFuseCharm(false)
        setFusionOpen(true)
      }
    } else {
      setDialogue({ speaker: npc.name, portrait: npc.portrait, lines: npc.lines ?? ['……'] })
    }
  }

  const onBlockedExit = (msg: string) => {
    setDialogue({ lines: [msg] })
  }

  // 転送門から世界へワープ
  const warpToWorld = (w: (typeof WORLDS)[number]) => {
    if (w.unlock && !game.badges.includes(w.unlock)) return
    setWorldsOpen(false)
    audio.sfx('door')
    setGame((s) => ({ ...s, pos: { mapId: w.mapId, x: w.tx, y: w.ty } }))
    setScreen('field')
  }

  // 試練の塔(スコアアタック): 階層ごとに敵レベルが上がる連戦。HPは継続、回復は道具のみ。
  // ラン全体を1つのシードで決定論化(SPEC_RNG_REPLAY.md)。将来の週替わり塔は同じ枠でシードを週固定にする。
  const towerConfig = (floor: number, seed: string): BattleConfig => {
    const lvl = Math.min(100, 4 + floor * 2)
    return { kind: 'wild', tower: true, floor, min: lvl, max: lvl, biome: 'forest', seed }
  }
  const startTower = () => {
    setWorldsOpen(false)
    // 公平性のため満タンで開始し、生存個体を先頭に
    setGame((s) => {
      const healed = healParty(s)
      const pty = getParty(healed)
      const living = healed.collection.find((o) => pty.includes(o.uid) && (o.hp == null || o.hp > 0))
      return { ...healed, activeUid: living ? living.uid : healed.activeUid }
    })
    const seed = `AO1|tower|${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 4).toString(36)}`
    setTower({ floor: 1, cleared: 0, seed })
    audio.sfx('encounter')
    setBattleConfig(towerConfig(1, seed))
    setScreen('battle')
  }

  // 錬成(融合): ベースaを素材bで錬成
  const doFuse = () => {
    const a = game.collection.find((o) => o.uid === fuseA)
    const b = game.collection.find((o) => o.uid === fuseB)
    if (!a || !b || a.uid === b.uid || game.money < FUSION_COST) return
    const stone = fuseStone && (game.mats?.talentStone ?? 0) > 0
    const charm = fuseCharm && (game.mats?.slotCharm ?? 0) > 0
    const r = fuseResult(a, b, { stone, charm })
    const result = { ...makeOwned(r.speciesId, r.level), talent: r.talent, inheritedMoves: r.inherited }
    setGame((s) => {
      const coll = [...s.collection.filter((o) => o.uid !== a.uid && o.uid !== b.uid), result]
      // パーティ更新: 素材2体を外し、どちらかがパーティ内だった場合は結果を空きへ
      const oldParty = getParty(s)
      const wasInParty = oldParty.includes(a.uid) || oldParty.includes(b.uid)
      let party = oldParty.filter((uid) => uid !== a.uid && uid !== b.uid)
      if (wasInParty && party.length < PARTY_MAX) party = [...party, result.uid]
      const activeUid =
        s.activeUid && party.includes(s.activeUid) ? s.activeUid : party.includes(result.uid) ? result.uid : party[0] ?? result.uid
      let ns: GameState = {
        ...s,
        collection: coll,
        party,
        activeUid,
        money: s.money - FUSION_COST,
        mats: { talentStone: (s.mats?.talentStone ?? 0) - (stone ? 1 : 0), slotCharm: (s.mats?.slotCharm ?? 0) - (charm ? 1 : 0) },
      }
      ns = withCaught(withSeen(ns, r.speciesId), r.speciesId)
      ns = withFlag(ns, 'fused_once') // 初錬成の導線バナーを消す(第2次品質スプリント)
      return ns
    })
    audio.sfx('coin')
    setFusionOpen(false)
    setFuseA(null)
    setFuseB(null)
    setFuseStone(false)
    setFuseCharm(false)
    const sp = species(r.speciesId)
    track('fusion', { result: r.speciesId, rare: !!r.rare })
    setGetMon({ id: r.speciesId, name: sp.name, type: sp.type, talent: r.talent, label: r.rare ? `✦レア錬成！ ${sp.name}が誕生！` : 'が 錬成された！' })
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

  // ヌシ幻獣に接触(パッケージD): 前口上→固定個体との強制バトル
  const onNushi = (nushi: NushiSpot, biome: string) => {
    setDialogue({
      lines: nushi.lines ?? ['……並外れて大きな 気配。', 'この道を通すつもりは ないようだ。'],
      after: () =>
        startBattle({
          kind: 'wild',
          biome,
          forcedSpeciesId: nushi.speciesId,
          forcedLevel: nushi.level,
          forcedTalent: nushi.talent,
          forcedStatus: nushi.status,
          nushiId: nushi.id,
        }),
    })
  }

  // ルーンスイッチに触れる(パッケージD): 1度きりでflagを立て、対応するGateを解放
  const onSwitch = (sw: RuneSwitch) => {
    if (hasFlag(game, sw.flag)) {
      setDialogue({ lines: ['……ルーンの光は もう静かだ。役目は 終えたらしい。'] })
      return
    }
    setGame((s) => withFlag(s, sw.flag))
    audio.sfx('door')
    setDialogue({ speaker: sw.name, lines: sw.lines ?? ['ルーンのスイッチに触れた。', '……遠くで、重い扉が開く音がした。'] })
  }

  const pickStarter = (id: string) => {
    const owned = { ...makeOwned(id, STARTER_LEVEL), talent: rollTalent() } // 御三家も個体差あり
    setGame((s) => {
      let next: GameState = { ...s, collection: [owned], party: [owned.uid], activeUid: owned.uid, flasks: STARTER_FLASKS }
      next = withCaught(withSeen(next, id), id)
      return next
    })
    track('starter_chosen', { species: id }) // ゲーム開始の実質的な起点=ファネル入口
    setStarterOpen(false)
    const m = species(id)
    audio.sfx('catch')
    // 御三家talent演出(第2次品質スプリント): レア個体を選ぶと師が一言添える(引き直し不可のまま)
    const rar = rarityOf(owned.talent)
    const firstLine =
      (owned.talent ?? 0) >= 6
        ? '……ほう。稀に見る、澄んだ目をした個体だ。おまえ、持っているな。'
        : (owned.talent ?? 0) >= 3
          ? '……いい目だ。筋のいい個体を選んだな。その子が、おまえの最初の相棒。'
          : '……いい目だ。その子が、おまえの最初の相棒。名前を呼ぶより先に、体温を覚えてやりなさい。'
    setGetMon({
      id,
      name: m.name,
      type: m.type,
      talent: owned.talent,
      label: rar ? `を 相棒にした！（${rar.stars} ${rar.name}）` : 'を 相棒にした！',
      after: () =>
        setDialogue({
          speaker: '師ガレン',
          portrait: 'mentor',
          lines: [
            firstLine,
            '強さとは、勝つ数ではない。共に時を重ねた証だ。……それを忘れた者が、どうなったか。いずれ話す日も来よう。',
            '近頃、各地で幻獣が色を失う――《灰化》が広がっている。まずは緑霧の森の守護者シルヴァを訪ね、最初の記章を得なさい。',
            '中央広場の転送門が、おまえを森へ導く。……急くな。だが、目を逸らすな。',
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
        setState={setGame}
        setActive={(uid) => setGame((s) => setLeader(s, uid))}
        onField={() => setScreen('field')}
        onDex={() => setScreen('dex')}
        initialTab={homeTab}
      />
    )
  } else if (screen === 'battle' && battleConfig && active) {
    content = (
      <Battle
        key={battleConfig.kind === 'wild' && battleConfig.tower ? `tower-${battleConfig.floor}` : 'battle'}
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
        onNushi={onNushi}
        onSwitch={onSwitch}
        onMenu={() => { setHomeTab('party'); setScreen('home') }}
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

      {phase === 'game' && screen === 'field' && !dialogue && !getMon && (() => {
        const obj = currentObjective(game)
        if (!obj) return null
        return (
          <div
            style={{
              position: 'absolute', top: 46, left: '50%', transform: 'translateX(-50%)', zIndex: 150,
              maxWidth: '90%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
              borderRadius: 999, background: 'rgba(22,17,10,0.88)', border: '1px solid rgba(212,175,90,0.5)',
              color: '#f3e6c4', fontSize: 13, fontWeight: 600, lineHeight: 1.35, textAlign: 'center',
              boxShadow: '0 3px 12px rgba(0,0,0,0.4)', pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>🎯</span>
            <span>
              <span style={{ opacity: 0.65, marginRight: 6 }}>{obj.icon} 目標</span>
              {obj.text}
            </span>
          </div>
        )
      })()}

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

            {/* セーブのバックアップ(書き出し/読み込み) */}
            <h3 className="section-title" style={{ marginTop: 14 }}>セーブのバックアップ</h3>
            <p className="cmd-sub" style={{ marginTop: 0 }}>機種変更やデータ消去に備え、コードを控えておくと復元できます。</p>
            <div className="setting-row">
              <button
                className="title-btn"
                style={{ padding: '6px 14px', fontSize: 14 }}
                onClick={() => {
                  const code = exportSave()
                  setBackupCode(code)
                  try { navigator.clipboard?.writeText(code) } catch { /* 手動コピー用に下に表示 */ }
                }}
              >
                セーブを書き出す（コピー）
              </button>
              <span className="cmd-sub">{backupCode ? 'コピーしました' : ''}</span>
            </div>
            {backupCode && (
              <textarea
                readOnly
                value={backupCode}
                onFocusCapture={(e) => e.currentTarget.select()}
                style={{ width: '100%', height: 56, fontSize: 11, fontFamily: 'monospace', background: 'rgba(20,16,10,0.5)', color: '#cdbf9c', border: '1px solid rgba(212,175,90,0.4)', borderRadius: 8, padding: 6, resize: 'vertical' }}
              />
            )}
            <textarea
              placeholder="ここにセーブコードを貼り付けて読み込み"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              style={{ width: '100%', height: 48, fontSize: 11, fontFamily: 'monospace', marginTop: 6, background: 'rgba(20,16,10,0.5)', color: '#f3e6c4', border: '1px solid rgba(212,175,90,0.4)', borderRadius: 8, padding: 6, resize: 'vertical' }}
            />
            <button
              className="title-btn"
              style={{ padding: '6px 14px', fontSize: 14, width: '100%', marginTop: 4 }}
              disabled={!importText.trim()}
              onClick={() => {
                const loaded = importSave(importText)
                if (loaded) {
                  setGame(loaded)
                  setImportText('')
                  setSettingsOpen(false)
                  setScreen('field')
                  setDialogue({ lines: ['セーブを 読み込んだ！'] })
                } else {
                  setDialogue({ lines: ['コードが 正しくないようだ……', 'もう一度 確認してね。'] })
                }
              }}
            >
              セーブを読み込む
            </button>
          </div>
        </div>
      )}

      {getMon && (
        <GetMonsterOverlay
          id={getMon.id}
          name={getMon.name}
          type={getMon.type}
          label={getMon.label}
          talent={getMon.talent}
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

      {shareData && <ShareCard data={shareData} onClose={() => setShareData(null)} />}

      {shopOpen && (
        <div className="modal-backdrop" onClick={() => setShopOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-head">
              <span className="mon-name">🛒 道具屋のラル</span>
              <button className="modal-close" onClick={() => setShopOpen(false)}>×</button>
            </div>
            <div className="shop-clerk">
              <img className="clerk-portrait" src={`${import.meta.env.BASE_URL}portraits/laru.png`} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
              <p className="dex-text">「いらっしゃい。何にするね？」　所持金 <ItemIcon kind="money" size={22} /> {game.money} ゲル</p>
            </div>
            {SHOP_ITEMS.map((it) => (
              <div key={it.key} className="shop-row">
                <span className="shop-name">{it.name}<span className="cmd-sub">　{it.desc}</span></span>
                <span className="shop-price"><ItemIcon kind="money" size={20} />{it.price}</span>
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

      {worldsOpen && (
        <div className="modal-backdrop" onClick={() => setWorldsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-head">
              <span className="mon-name">🌀 転送門 — 世界を選ぶ</span>
              <button className="modal-close" onClick={() => setWorldsOpen(false)}>×</button>
            </div>
            <p className="dex-text" style={{ marginTop: 0 }}>跳びたい世界を選ぼう。守護者を倒すと、新たな世界が開かれる。</p>
            {WORLDS.map((w) => {
              const unlocked = !w.unlock || game.badges.includes(w.unlock)
              const cleared = game.defeatedTrainers.includes(w.boss)
              return (
                <div key={w.id} className={`shop-row${unlocked ? '' : ' locked'}`} style={!unlocked ? { opacity: 0.55 } : undefined}>
                  <span className="shop-name">
                    {unlocked ? w.icon : '🔒'} {w.name}
                    {cleared && <span className="lead-tag" style={{ marginLeft: 6 }}>✓クリア</span>}
                    <span className="cmd-sub">　{unlocked ? w.desc : `「${w.unlock}」を 集めると 解放`}</span>
                  </span>
                  <button
                    className="title-btn"
                    style={{ padding: '6px 14px', fontSize: 14 }}
                    disabled={!unlocked}
                    onClick={() => warpToWorld(w)}
                  >
                    {unlocked ? 'ワープ' : '？？？'}
                  </button>
                </div>
              )
            })}
            <div className="shop-row" style={{ borderTop: '1px solid rgba(212,175,90,0.28)', marginTop: 8, paddingTop: 12 }}>
              <span className="shop-name">
                🗼 試練の塔<span className="lead-tag" style={{ marginLeft: 6 }}>スコア</span>
                <span className="cmd-sub">　連戦でどこまで登れるか挑戦。自己ベスト {game.towerBest ?? 0}階</span>
              </span>
              <button className="title-btn" style={{ padding: '6px 14px', fontSize: 14 }} onClick={startTower}>
                挑戦
              </button>
            </div>
            <p className="cmd-sub" style={{ textAlign: 'center', marginTop: 10 }}>……さらなる世界は、これから開かれていく。</p>
          </div>
        </div>
      )}

      {fusionOpen && (
        <div className="modal-backdrop" onClick={() => setFusionOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-head">
              <span className="mon-name">⚗️ 錬成釜（錬成師ミルカ）</span>
              <button className="modal-close" onClick={() => setFusionOpen(false)}>×</button>
            </div>
            <div className="shop-clerk">
              <img className="clerk-portrait" src={`${import.meta.env.BASE_URL}portraits/mirka.png`} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
              <p className="dex-text">
                「ベースと素材を選んでおくれ。ベースが進化し、才能が宿る。」　費用 <ItemIcon kind="money" size={20} />{FUSION_COST}
                ・所持 <ItemIcon kind="money" size={20} />{game.money}
              </p>
            </div>
            {(() => {
              const a = game.collection.find((o) => o.uid === fuseA)
              const b = game.collection.find((o) => o.uid === fuseB)
              const stoneN = game.mats?.talentStone ?? 0
              const charmN = game.mats?.slotCharm ?? 0
              const prev = a && b && a.uid !== b.uid ? fuseResult(a, b, { stone: fuseStone && stoneN > 0, charm: fuseCharm && charmN > 0 }) : null
              return (
                <>
                  <div className="fuse-slots">
                    <div className="fuse-slot">
                      <span className="fuse-slot-label">ベース</span>
                      {a ? <span className="cmd-sub">{species(a.speciesId).name} Lv{a.level}{a.talent ? ` ★${a.talent}` : ''}</span> : <span className="cmd-sub">未選択</span>}
                    </div>
                    <span className="fuse-plus">＋</span>
                    <div className="fuse-slot">
                      <span className="fuse-slot-label">素材</span>
                      {b ? <span className="cmd-sub">{species(b.speciesId).name} Lv{b.level}{b.talent ? ` ★${b.talent}` : ''}</span> : <span className="cmd-sub">未選択</span>}
                    </div>
                  </div>
                  <div className="fuse-preview">
                    {prev ? (
                      <span>
                        {prev.rare && <span className="rare-tag">✦レア配合</span>}
                        → <b>{species(prev.speciesId).name}</b> Lv{prev.level}・才能★{prev.talent}
                        {prev.evolved ? '（進化！）' : ''}
                        {prev.inherited.length > 0 && <><br />遺伝技: {prev.inherited.map((m) => m.name).join('、')}</>}
                      </span>
                    ) : (
                      <span className="cmd-sub">2体を選ぶと結果が表示されます</span>
                    )}
                  </div>
                  {/* プレミアム錬成素材 */}
                  {(stoneN > 0 || charmN > 0) && (
                    <div className="fuse-mats">
                      {stoneN > 0 && (
                        <button className={`toggle-btn ${fuseStone ? 'on' : ''}`} onClick={() => setFuseStone((v) => !v)}>
                          才能の結晶 ×{stoneN}（才能+1追加）
                        </button>
                      )}
                      {charmN > 0 && (
                        <button className={`toggle-btn ${fuseCharm ? 'on' : ''}`} onClick={() => setFuseCharm((v) => !v)}>
                          継承の符 ×{charmN}（遺伝枠+1）
                        </button>
                      )}
                    </div>
                  )}
                  <button className="title-btn primary" style={{ width: '100%', marginTop: 8 }} disabled={!prev || game.money < FUSION_COST} onClick={doFuse}>
                    錬成する <ItemIcon kind="money" size={20} />{FUSION_COST}（素材は消費されます）
                  </button>
                  <div className="party-list" style={{ marginTop: 12 }}>
                    {game.collection.map((o) => {
                      const sp = species(o.speciesId)
                      const role = o.uid === fuseA ? 'base' : o.uid === fuseB ? 'mat' : null
                      return (
                        <button
                          key={o.uid}
                          className={`party-row ${role ? 'sel' : ''}`}
                          onClick={() => {
                            if (fuseA === o.uid) setFuseA(null)
                            else if (fuseB === o.uid) setFuseB(null)
                            else if (!fuseA) setFuseA(o.uid)
                            else if (!fuseB) setFuseB(o.uid)
                          }}
                        >
                          <Sprite id={sp.id} type={sp.type} size={36} />
                          <div className="pr-info">
                            <div className="pr-head">
                              <span className="pr-name">{sp.name}</span>
                              {role && <span className="lead-tag">{role === 'base' ? 'ベース' : '素材'}</span>}
                              <span className="pr-lv">Lv{o.level}{o.talent ? ` ★${o.talent}` : ''}</span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </>
              )
            })()}
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
