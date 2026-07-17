// 幻獣図鑑データの型 (data/monsters.json と対応)
export interface MonsterData {
  dex: number
  id: string
  name: string
  type: string
  type2?: string
  stage: number
  from: string | null
  to: string | null
  at: number | null
  canon?: boolean
  role?: string
  stats: number[] // [HP, ATK, DEF, SPD, MAG]
  sig: string
  dex_text: string
  ability?: string // 特性id(省略時はタイプ既定。abilities.ts参照)
}

// 相性表データの型 (data/typechart.json と対応)
export interface TypeChart {
  types: string[]
  chart: Record<string, Record<string, number>>
}

// 状態異常
export type StatusKind = 'やけど' | 'どく' | 'まひ' | 'ねむり' | 'こおり' | '灰化'

// バトル中の個体 (種族データ + レベルから算出)
export interface Combatant {
  data: MonsterData
  level: number
  talent?: number // 個体の質(0-10)。レア度＆全能力+4%/段の倍率。野生でロール、配合で上昇
  mutant?: boolean // 変異種(色違い・見た目のみ)
  ability?: string // 特性id(バトル中の判定に使用)
  traitBoost?: number // 特性鍛錬Lv。クイック/通常戦闘の基礎能力に少し上乗せする
  heldItem?: string // もちものid
  berryUsed?: boolean // 回復系もちものを使ったか(1戦1回)
  maxHp: number
  hp: number
  atk: number
  def: number
  spd: number
  mag: number
  status: StatusKind | null
  statusTurns: number // ねむりの残りターン等
  // ── 能力ランク(バフ/デバフ)。各 -3..+3。交代/登場でリセット ──
  stages: { atk: number; def: number; spd: number; mag: number }
  guarding?: boolean // guard中(次の自分の行動開始時に解除)。被ダメ×0.3
  lastMoveId?: string // guard連続使用禁止の判定用
  charging?: string // 溜め中の技id(次ターン自動解放)
}

// 技
export interface Move {
  id: string
  name: string
  type: string
  category: 'phys' | 'spec' | 'status'
  power: number
  acc: number // 命中率 0..1
  desc: string
  inflict?: { status: StatusKind; chance: number } // 付与する状態異常
  heal?: number // 自分のHPを maxHp*heal 回復
  cures?: boolean // 自分の状態異常(灰化含む)を治す
  // ── 深化タグ ──
  priority?: number // 行動順ボーナス(+1=先制)。省略=0
  multi?: [number, number] // 連続攻撃 [最小,最大]回。命中は1回、ダメージは各ヒットで乱数
  recoil?: number // 与ダメ×この割合を自分が受ける(最低1)
  drain?: number // 与ダメ×この割合を回復(最低1、maxHp上限)
  guard?: boolean // このターン被ダメ×0.3。連続使用不可
  charge?: boolean // 溜め技: T1溜め→T2解放(powerに2倍込みの値)
  critBoost?: number // 会心率の上書き(既定0.06)
  bonusVsStatus?: number // 相手が状態異常なら威力×この値
  buffs?: { target: 'self' | 'foe'; stat: 'atk' | 'def' | 'spd' | 'mag'; delta: number }[] // ランク操作
  resetStages?: boolean // 相手の能力ランクを全て0に戻す(ちょうりつ)
}

// プレイヤーが所有する個体 (永続データ)
export interface OwnedMonster {
  uid: string
  speciesId: string
  level: number
  exp: number
  hp?: number // 現在HP(未設定=満タン)。バトル間で持続
  talent?: number // 才能(錬成で上昇)。0〜10。全能力に+4%/段
  mutant?: boolean // 変異種(1/100の色違い。強さとは無関係の見た目レア)
  inheritedMoves?: Move[] // 遺伝技(錬成で素材から受け継いだ技)
  traitBoost?: number // 特性鍛錬Lv。クイック/通常戦闘の基礎能力に少し上乗せする
  heldItem?: string // もちものid(heldItems参照)。1体1つ
}

// セーブされるゲーム全体の状態
export interface ResearchEntry {
  caught: number
  bestTalent: number
  mutant: boolean
}

export interface CaptureChain { speciesId: string; count: number }

export interface GameState {
  collection: OwnedMonster[] // 所持する全個体(パーティ＋預かりボックス)
  party: string[] // 戦うパーティの uid 列(先頭=リーダー、最大 PARTY_MAX)。残りは預かりボックス
  seen: string[] // 出会った種のid
  caught: string[] // 捕獲した種のid
  research?: Record<string, ResearchEntry> // species research record: catches / best talent / mutant found
  chain?: CaptureChain // consecutive captures of the same species
  activeUid: string | null // 手持ちの先頭(バトルに出す個体)
  flasks: number // 封獣フラスコ所持数
  wins: number
  pos: { mapId: string; x: number; y: number } // フィールド上の位置
  badges: string[] // 獲得した記章
  defeatedTrainers: string[] // 撃破済みトレーナーid
  items: { heal: number; heal2: number; heal3: number; exp_tome: number; evo_dust: number; trait_elixir: number; catch_charm: number; revive: number } // 傷薬 / 上傷薬
  money: number // 所持金（ゲル）
  flags: string[] // 一度きりイベントの完了フラグ
  // やりこみ(日課・実績・図鑑報酬)
  lastLogin?: string // 最終ログイン日 YYYY-MM-DD
  loginStreak?: number
  loginTotal?: number // cumulative login days for 7-day parcel rewards // 連続ログイン日数
  daily?: { date: string; wild: number; claimed: boolean; todayCatch?: boolean } // 当日のデイリー進捗
  achievements?: string[] // 解除済み実績id
  dexClaimed?: number[]
  dexTypeClaimed?: string[] // claimed type completion rewards // 受取済みの図鑑マイルストーン
  mats?: { talentStone: number; slotCharm: number } // プレミアム錬成素材
  towerBest?: number // 試練の塔の自己ベスト到達階(スコアアタック)
  playerName?: string // プレイヤー名(将来の共通ランキングの識別子)
}

// トレーナー(ジム守護者など)
export interface TrainerData {
  id: string
  name: string
  team: { speciesId: string; level: number; talent?: number; heldItem?: string; moves?: string[] }[]
  badge: string
  portrait?: string // 立ち絵 portraits/<portrait>.png (戦前/戦後の会話・バナー)
  preBattle?: string[] // 戦闘前の台詞
  postBattle?: string[] // 勝利後の台詞(敗北＝相手・記章授与)
}

// バトル開始設定
export type BattleConfig =
  | {
      kind: 'wild'
      pool?: string[]
      min?: number
      max?: number
      biome?: string
      tower?: boolean
      floor?: number
      seed?: string // シード付きラン(塔)。指定時は敵生成+バトル内乱数が決定論(SPEC_RNG_REPLAY.md)
      // ── ヌシ幻獣(パッケージD): 種/レベル/個体値を固定出現させる ──
      forcedSpeciesId?: string
      forcedLevel?: number
      forcedTalent?: number
      forcedStatus?: StatusKind // 開始時の状態異常(灰化ヘルフレア等のストーリー演出)
      chain?: CaptureChain // active capture chain passed into generated wild encounters
      nushiId?: string // 勝利/捕獲で解放するヌシのid(flag=`nushi_<id>`)
    }
  | { kind: 'trainer'; trainer: TrainerData; biome?: string }
