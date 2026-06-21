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
  maxHp: number
  hp: number
  atk: number
  def: number
  spd: number
  mag: number
  status: StatusKind | null
  statusTurns: number // ねむりの残りターン等
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
}

// プレイヤーが所有する個体 (永続データ)
export interface OwnedMonster {
  uid: string
  speciesId: string
  level: number
  exp: number
  hp?: number // 現在HP(未設定=満タン)。バトル間で持続
}

// セーブされるゲーム全体の状態
export interface GameState {
  collection: OwnedMonster[]
  seen: string[] // 出会った種のid
  caught: string[] // 捕獲した種のid
  activeUid: string | null // 手持ちの先頭(バトルに出す個体)
  flasks: number // 封獣フラスコ所持数
  wins: number
  pos: { mapId: string; x: number; y: number } // フィールド上の位置
  badges: string[] // 獲得した記章
  defeatedTrainers: string[] // 撃破済みトレーナーid
  items: { heal: number } // 傷薬の所持数
  flags: string[] // 一度きりイベントの完了フラグ
}

// トレーナー(ジム支部長など)
export interface TrainerData {
  id: string
  name: string
  team: { speciesId: string; level: number }[]
  badge: string
}

// バトル開始設定
export type BattleConfig =
  | { kind: 'wild'; pool?: string[]; min?: number; max?: number; biome?: string }
  | { kind: 'trainer'; trainer: TrainerData; biome?: string }
