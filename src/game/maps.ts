// フィールドマップとトレーナー定義
// グリッド文字:
//   '#'=木/壁(進入不可)  'H'=建物(進入不可)  'W'=水(進入不可)
//   '.'=道/床(歩行可)    ','=芝生(歩行可・装飾)  'G'=高草(歩行可・エンカウント)
//   'F'=花(歩行可・装飾)  '~'=砂浜(歩行可)
// 広大マップ＋カメラ追従。画面に映るのは一部だけで、移動でスクロールする。
import type { TrainerData } from '../types'

export type NpcKind = 'mentor' | 'mom' | 'inn' | 'sign' | 'villager' | 'shop' | 'alchemist'
export interface Npc {
  x: number
  y: number
  kind: NpcKind
  name: string
  emoji?: string // 画像が無い場合の表示(種別既定を上書き)
  lines?: string[] // villager/sign 用の台詞
  sprite?: string // フィールドの歩きキャラ画像 ui/<sprite>.png (kind既定を上書き)
  portrait?: string // 会話の立ち絵 portraits/<portrait>.png
}

// マップ上の小物(家具・装飾)。solid=通行不可、lines=調べると台詞
export interface Prop {
  x: number
  y: number
  kind: string // bed/bookshelf/cauldron/fountain/barrel/fence... (ui/prop_<kind>.png or 絵文字)
  solid?: boolean
  lines?: string[]
  name?: string
  emoji?: string
}

// 宝箱。開けると item を amount 個入手。開封状態は flag 'chest_<id>' で保存
export interface Chest {
  x: number
  y: number
  id: string
  item: 'heal' | 'heal2' | 'flask' | 'money'
  amount: number
}

export interface GameMap {
  id: string
  name: string
  biome: string // バトル背景の地形キー (public/bg/battle/<biome>.jpg)
  grid: string[]
  // gate:'starter' のワープは御三家入手まで通れない
  warps: { x: number; y: number; to: string; tx: number; ty: number; gate?: string }[]
  leader?: { x: number; y: number; trainerId: string }
  encounter?: { pool: string[]; min: number; max: number }
  npcs?: Npc[]
  props?: Prop[]
  buildings?: { x: number; y: number; w: number; h: number; kind: string }[] // 立体の家(footprintは'H'で進入不可)
  chests?: Chest[]
  indoor?: boolean // 室内(床・壁の見た目)
  intro?: string
}

// ── マップ生成ヘルパー(座標ズレ防止) ──
function grid(w: number, h: number, fill = '.'): string[] {
  return Array.from({ length: h }, () => fill.repeat(w))
}
function set(g: string[], x: number, y: number, ch: string): void {
  if (y < 0 || y >= g.length) return
  const row = g[y]
  if (x < 0 || x >= row.length) return
  g[y] = row.slice(0, x) + ch + row.slice(x + 1)
}
function fill(g: string[], x0: number, y0: number, x1: number, y1: number, ch: string): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(g, x, y, ch)
}
function frame(g: string[], ch = '#'): void {
  const h = g.length
  const w = g[0].length
  for (let x = 0; x < w; x++) {
    set(g, x, 0, ch)
    set(g, x, h - 1, ch)
  }
  for (let y = 0; y < h; y++) {
    set(g, 0, y, ch)
    set(g, w - 1, y, ch)
  }
}

// 室内(壁で囲んだ床)。下壁の doorX に出入口を開ける
function room(w: number, h: number, doorX: number): string[] {
  const g = grid(w, h, '.')
  frame(g, '#')
  set(g, doorX, h - 1, '.')
  return g
}

// 始まりの村ラピス(34x26) 広い芝生に石畳の十字路・家3軒・道具屋・南に森への門
function buildRapis(): string[] {
  const g = grid(34, 26, ',')
  frame(g, '#')
  fill(g, 2, 13, 31, 13, '.') // 横の大通り
  fill(g, 17, 1, 17, 24, '.') // 縦の大通り(南門まで)
  // 家3軒(ブロック＋扉＋小道)
  fill(g, 6, 6, 8, 7, 'H')
  fill(g, 7, 8, 7, 13, '.') // わが家(左)＋扉小道
  fill(g, 16, 4, 18, 5, 'H')
  set(g, 17, 6, '.') // 師の家(中央・縦通り上)
  fill(g, 25, 7, 27, 8, 'H')
  fill(g, 26, 9, 26, 13, '.') // 宿屋(右)＋扉小道
  // 道具屋の露店
  fill(g, 20, 15, 22, 16, 'H')
  // 花壇の装飾
  ;[[10, 9], [12, 6], [29, 11], [5, 18], [30, 20], [24, 19], [12, 21], [4, 9]].forEach(([x, y]) => set(g, x, y, 'F'))
  // 南の門(森へ)
  set(g, 17, 24, '.')
  return g
}

// 緑霧の森(34x30) 密林の中を細い小道が曲がりくねる迷路。蛇行して奥の広間の支部長へ。
// 草地=エンカウント、行き止まり=宝箱用。各部屋・通路は一つの連結網に接続(構築順で重なりを担保)。
function buildForest(): string[] {
  const g = grid(34, 30, '#') // 一面の密林(木)
  // 南の入口(3マス幅)
  fill(g, 16, 25, 18, 29, '.')
  fill(g, 17, 22, 17, 26, '.') // 入口→大廊下
  // 東西の大廊下(row22)
  fill(g, 3, 22, 28, 22, '.')
  // 南西/南東の草地(廊下に接続)
  fill(g, 3, 19, 6, 24, 'G')
  fill(g, 21, 19, 27, 24, 'G')
  // 西の縦廊下→中段の横廊下→草地R3→中央縦廊下
  fill(g, 7, 12, 7, 22, '.')
  fill(g, 7, 16, 12, 16, '.')
  fill(g, 8, 12, 12, 16, 'G')
  fill(g, 12, 10, 12, 16, '.')
  // 上段の横廊下(row10)＋東の出口へ
  fill(g, 12, 10, 30, 10, '.')
  fill(g, 23, 11, 28, 15, 'G') // 草地R4
  fill(g, 30, 10, 30, 15, '.')
  fill(g, 30, 15, 32, 15, '.') // (32,15)=東の出口
  // ボスへ: 縦廊下→上段の横廊下→広間
  fill(g, 22, 6, 22, 10, '.')
  fill(g, 3, 6, 22, 6, '.')
  fill(g, 13, 3, 21, 7, '.') // 支部長の広間(leader 17,3)
  // 行き止まり(宝箱用)
  fill(g, 2, 4, 5, 7, '.') // 北西
  fill(g, 28, 25, 31, 28, '.')
  fill(g, 27, 24, 28, 25, '.') // 南東(R2へ接続)
  return g
}

// 潮騒の道(22x12) 海沿いの砂浜。葦(高草)で水辺の幻獣が出る
function buildCoast(): string[] {
  const g = grid(22, 12, '~')
  frame(g, '#')
  fill(g, 1, 1, 20, 2, 'W') // 北は海
  fill(g, 4, 5, 9, 8, 'G')
  fill(g, 12, 5, 17, 8, 'G')
  fill(g, 1, 6, 20, 6, '~') // 砂の小道(横)
  return g
}

// 潮鳴りの港町(24x16) 石畳の港町。北に支部長、南東に停泊する船(水)
function buildPort(): string[] {
  const g = grid(24, 16, ',')
  frame(g, '#')
  fill(g, 1, 8, 22, 8, '.') // 大通り(横)
  fill(g, 12, 2, 12, 13, '.') // 大通り(縦)
  fill(g, 15, 12, 22, 14, 'W') // 港の水面
  fill(g, 5, 4, 7, 5, 'H')
  fill(g, 16, 4, 18, 5, 'H')
  ;[[3, 10], [9, 11], [20, 6]].forEach(([x, y]) => set(g, x, y, 'F'))
  set(g, 1, 8, '.') // 西の出口
  return g
}

export const MAPS: Record<string, GameMap> = {
  rapis: {
    id: 'rapis',
    name: '始まりの村ラピス',
    biome: 'town',
    grid: buildRapis(),
    warps: [
      { x: 17, y: 24, to: 'forest', tx: 17, ty: 27, gate: 'starter' }, // 南=森へ
      { x: 17, y: 6, to: 'mentor_house', tx: 5, ty: 7 }, // 中央=師の家
      { x: 7, y: 8, to: 'home', tx: 5, ty: 7 }, // 左=わが家
      { x: 26, y: 9, to: 'inn', tx: 5, ty: 7 }, // 右=宿屋
      { x: 21, y: 17, to: 'shop', tx: 4, ty: 5 }, // 道具屋(店内へ)
    ],
    npcs: [
      {
        x: 24,
        y: 13,
        kind: 'villager',
        name: '老人モーリス',
        emoji: '👴',
        sprite: 'npc_morris',
        portrait: 'morris',
        lines: [
          'わしも昔は錬獣師でな……。だが近頃の"灰化"は、わしらの知る災いとは違う。',
          '色を失い、心まで失って暴れ出す。あれは……誰かが、作り出しているものだ。',
        ],
      },
      {
        x: 11,
        y: 17,
        kind: 'villager',
        name: '子供ティナ',
        emoji: '🧒',
        sprite: 'npc_tina',
        portrait: 'tina',
        lines: ['ねえねえ、幻獣つれてるの！？ いいなあ！ あたしも錬獣師になるんだ！', '強くなったら、また見せてね。約束だよ！'],
      },
    ],
    buildings: [
      { x: 6, y: 6, w: 3, h: 2, kind: 'home' }, // わが家(左)
      { x: 16, y: 4, w: 3, h: 2, kind: 'mentor' }, // 師の家(中央)
      { x: 25, y: 7, w: 3, h: 2, kind: 'inn' }, // 宿屋(右)
      { x: 20, y: 15, w: 3, h: 2, kind: 'shop' }, // 道具屋
    ],
    props: [
      // ── 噴水広場(中央) ──
      { x: 14, y: 15, kind: 'fountain', solid: true, name: '噴水', lines: ['村の古い噴水。水面に錬金術の紋章が彫られている。'] },
      { x: 12, y: 14, kind: 'flower' }, { x: 16, y: 14, kind: 'flower' }, { x: 12, y: 16, kind: 'flower' }, { x: 16, y: 16, kind: 'flower' }, // 噴水を囲む花壇
      { x: 13, y: 17, kind: 'plant', solid: true }, { x: 15, y: 17, kind: 'plant', solid: true }, // 広場の植え込み
      { x: 12, y: 17, kind: 'lamp', solid: true }, { x: 16, y: 17, kind: 'lamp', solid: true }, // 広場灯
      { x: 13, y: 12, kind: 'sign', name: '立て札', lines: ['「ようこそ、始まりの村ラピスへ。」'] },
      // ── わが家の前庭(西・扉7,8) ──
      { x: 5, y: 8, kind: 'flower' }, { x: 6, y: 8, kind: 'flower' }, { x: 8, y: 8, kind: 'flower' }, { x: 9, y: 8, kind: 'flower' }, // 玄関脇の花壇
      { x: 4, y: 8, kind: 'fence', solid: true }, { x: 4, y: 9, kind: 'fence', solid: true }, { x: 4, y: 10, kind: 'fence', solid: true }, { x: 5, y: 10, kind: 'fence', solid: true }, { x: 6, y: 10, kind: 'fence', solid: true }, // 庭の柵
      { x: 5, y: 9, kind: 'flower' }, { x: 6, y: 9, kind: 'flower' }, // 庭の中
      { x: 9, y: 9, kind: 'barrel', solid: true }, { x: 10, y: 8, kind: 'plant', solid: true }, // 雨水樽・生垣
      // ── 師の家の前(中央北・扉17,6) ──
      { x: 14, y: 4, kind: 'plant', solid: true }, { x: 20, y: 4, kind: 'plant', solid: true }, // 家を囲む木
      { x: 15, y: 6, kind: 'lamp', solid: true }, { x: 19, y: 6, kind: 'lamp', solid: true }, // 玄関灯(扉を挟む)
      { x: 15, y: 5, kind: 'flower' }, { x: 19, y: 5, kind: 'flower' },
      // ── 宿屋の前(東・扉26,9) ──
      { x: 24, y: 8, kind: 'sign', name: '看板', lines: ['「ラピスの宿屋 — 一泊で幻獣も元気に」'] },
      { x: 24, y: 9, kind: 'lamp', solid: true }, { x: 28, y: 9, kind: 'lamp', solid: true }, // 玄関灯
      { x: 24, y: 10, kind: 'flower' }, { x: 28, y: 10, kind: 'flower' },
      { x: 29, y: 9, kind: 'barrel', solid: true }, { x: 29, y: 10, kind: 'barrel', solid: true }, { x: 29, y: 11, kind: 'crate', solid: true }, // 酒樽
      // ── 市場(道具屋20-22,15-16 / ラル21,17) ──
      { x: 18, y: 16, kind: 'sign', name: '看板', lines: ['「道具屋ラル — 傷薬・封獣フラスコ あります」'] },
      { x: 19, y: 15, kind: 'crate', solid: true }, { x: 19, y: 16, kind: 'barrel', solid: true }, // 陳列(左)
      { x: 23, y: 15, kind: 'barrel', solid: true }, { x: 23, y: 16, kind: 'crate', solid: true }, // 陳列(右)
      { x: 24, y: 16, kind: 'barrel', solid: true }, { x: 19, y: 17, kind: 'crate', solid: true }, // 在庫
      { x: 22, y: 18, kind: 'barrel', solid: true }, { x: 23, y: 18, kind: 'crate', solid: true },
      // ── 街路灯(縦の大通りを等間隔で挟む) ──
      { x: 16, y: 9, kind: 'lamp', solid: true }, { x: 18, y: 9, kind: 'lamp', solid: true },
      { x: 16, y: 20, kind: 'lamp', solid: true }, { x: 18, y: 20, kind: 'lamp', solid: true },
      // ── 街路灯(横の大通りを挟む) ──
      { x: 9, y: 12, kind: 'lamp', solid: true }, { x: 9, y: 14, kind: 'lamp', solid: true }, { x: 29, y: 14, kind: 'lamp', solid: true },
      // ── 沿道の花(リズム) ──
      { x: 16, y: 11, kind: 'flower' }, { x: 18, y: 11, kind: 'flower' }, { x: 16, y: 22, kind: 'flower' }, { x: 18, y: 22, kind: 'flower' },
      // ── 町外周の生垣 ──
      { x: 2, y: 2, kind: 'plant', solid: true }, { x: 31, y: 2, kind: 'plant', solid: true },
      { x: 2, y: 12, kind: 'plant', solid: true }, { x: 31, y: 12, kind: 'plant', solid: true },
      { x: 2, y: 24, kind: 'plant', solid: true }, { x: 8, y: 24, kind: 'plant', solid: true }, { x: 28, y: 24, kind: 'plant', solid: true },
      // ── 南門の案内板 ──
      { x: 18, y: 23, kind: 'sign', name: '立て札', lines: ['「↓ 南 — 緑霧の森」'] },
    ],
    chests: [
      { x: 31, y: 22, id: 'rapis_corner', item: 'heal', amount: 2 }, // 村の隅
      { x: 3, y: 5, id: 'rapis_garden', item: 'money', amount: 150 }, // 家の脇
    ],
    intro: '錬金工房が並ぶ静かな村。家の扉から中へ。南の門の先に緑霧の森が広がる。',
  },
  mentor_house: {
    id: 'mentor_house',
    name: '師ガレンの家',
    biome: 'town',
    indoor: true,
    grid: room(11, 9, 5),
    warps: [{ x: 5, y: 8, to: 'rapis', tx: 17, ty: 7 }],
    npcs: [
      { x: 5, y: 2, kind: 'mentor', name: '師ガレン' },
      { x: 2, y: 5, kind: 'alchemist', name: '錬成師ミルカ', emoji: '🧑‍🔬' }, // 錬成釜のそば
    ],
    props: [
      // 壁の装飾
      { x: 2, y: 0, kind: 'window' }, { x: 8, y: 0, kind: 'painting' }, { x: 6, y: 0, kind: 'clock' },
      // 蔵書(左右の本棚)
      { x: 1, y: 1, kind: 'bookshelf', solid: true, name: '蔵書', lines: ['錬金術の古い写本がぎっしりだ。読めない記号が並んでいる。'] },
      { x: 2, y: 1, kind: 'bookshelf', solid: true, name: '蔵書', lines: ['「賢者の石」について記された頁に、栞がはさまれている……。'] },
      { x: 8, y: 1, kind: 'bookshelf', solid: true }, { x: 9, y: 1, kind: 'bookshelf', solid: true },
      // 錬成工房(左)
      { x: 1, y: 6, kind: 'cauldron', solid: true, name: '錬成釜', lines: ['師の錬成釜。底に、虹色の残滓がこびりついている。'] },
      { x: 2, y: 6, kind: 'pot', solid: true },
      { x: 1, y: 3, kind: 'shelf', solid: true, name: '薬棚', lines: ['色とりどりの薬瓶と乾いた薬草が並ぶ。'] },
      // 書斎(右)
      { x: 8, y: 5, kind: 'table', solid: true }, { x: 8, y: 6, kind: 'chair', solid: true },
      { x: 9, y: 5, kind: 'candle', solid: true }, { x: 9, y: 3, kind: 'vase', solid: true },
      // 中央・緑
      { x: 5, y: 5, kind: 'rug' }, { x: 9, y: 7, kind: 'plant', solid: true },
    ],
    intro: '錬金道具と古びた書物が並ぶ、広い師の家。',
  },
  home: {
    id: 'home',
    name: 'わが家',
    biome: 'town',
    indoor: true,
    grid: room(11, 9, 5),
    warps: [
      { x: 5, y: 8, to: 'rapis', tx: 7, ty: 9 },
      { x: 9, y: 1, to: 'home2f', tx: 5, ty: 7 }, // 階段(上)
    ],
    npcs: [{ x: 3, y: 2, kind: 'mom', name: 'おかあさん' }],
    props: [
      // 壁
      { x: 3, y: 0, kind: 'window' }, { x: 7, y: 0, kind: 'painting' }, { x: 5, y: 0, kind: 'clock' },
      // 台所(左上)
      { x: 1, y: 1, kind: 'stove', solid: true }, { x: 2, y: 1, kind: 'shelf', solid: true, name: '食器棚' },
      { x: 1, y: 2, kind: 'pot', solid: true }, { x: 1, y: 4, kind: 'vase', solid: true },
      // 食卓(中央)
      { x: 4, y: 5, kind: 'table', solid: true }, { x: 3, y: 5, kind: 'chair', solid: true }, { x: 4, y: 6, kind: 'chair', solid: true },
      // 暖炉のある居間(右)
      { x: 9, y: 4, kind: 'fireplace', solid: true, name: '暖炉', lines: ['ぱちぱちと薪がはぜている。あたたかい。'] },
      { x: 8, y: 5, kind: 'rug' }, { x: 9, y: 6, kind: 'plant', solid: true }, { x: 1, y: 6, kind: 'plant', solid: true },
      // 玄関マット
      { x: 5, y: 7, kind: 'rug' },
    ],
    intro: 'あたたかな わが家。奥の階段を上ると自分の部屋がある。',
  },
  home2f: {
    id: 'home2f',
    name: 'わが家・2階',
    biome: 'town',
    indoor: true,
    grid: room(11, 9, 5),
    warps: [{ x: 5, y: 8, to: 'home', tx: 9, ty: 2 }], // 階段(下)
    props: [
      // 壁
      { x: 5, y: 0, kind: 'window' }, { x: 3, y: 0, kind: 'painting' }, { x: 8, y: 0, kind: 'clock' },
      // 寝床(左)
      { x: 1, y: 1, kind: 'bed', solid: true, name: 'ベッド', lines: ['よく眠った。……今日から、旅が始まる。'] },
      { x: 2, y: 2, kind: 'rug' }, { x: 1, y: 6, kind: 'plant', solid: true },
      // 学習机(右)
      { x: 9, y: 1, kind: 'bookshelf', solid: true, name: '本棚', lines: ['古い幻獣図鑑。いつか、自分の見つけた幻獣を ここに書き足すんだ。'] },
      { x: 8, y: 2, kind: 'table', solid: true }, { x: 8, y: 3, kind: 'chair', solid: true },
      { x: 9, y: 2, kind: 'candle', solid: true }, { x: 9, y: 6, kind: 'vase', solid: true },
      // 中央
      { x: 5, y: 5, kind: 'rug' },
    ],
    intro: '自分の部屋。窓から朝の光が差し込んでいる。',
  },
  inn: {
    id: 'inn',
    name: 'ラピスの宿屋',
    biome: 'town',
    indoor: true,
    grid: room(11, 9, 5),
    warps: [{ x: 5, y: 8, to: 'rapis', tx: 26, ty: 10 }],
    npcs: [{ x: 8, y: 6, kind: 'inn', name: '宿屋の主人' }], // 右下の受付に
    props: [
      // 壁
      { x: 3, y: 0, kind: 'window' }, { x: 7, y: 0, kind: 'window' }, { x: 5, y: 0, kind: 'clock' },
      // 客室のベッド(上の四隅)
      { x: 1, y: 1, kind: 'bed', solid: true }, { x: 2, y: 1, kind: 'bed', solid: true },
      { x: 8, y: 1, kind: 'bed', solid: true }, { x: 9, y: 1, kind: 'bed', solid: true },
      // 受付カウンター(右下・主人を机で囲む。手前(8,7)から話しかける)
      { x: 7, y: 5, kind: 'table', solid: true }, { x: 8, y: 5, kind: 'table', solid: true }, { x: 9, y: 5, kind: 'table', solid: true },
      { x: 7, y: 6, kind: 'table', solid: true }, { x: 9, y: 6, kind: 'shelf', solid: true, name: '宿帳棚' },
      // 暖炉のある休憩スペース(左下)
      { x: 1, y: 6, kind: 'fireplace', solid: true, name: '暖炉', lines: ['旅人たちが暖を取っている。'] },
      { x: 2, y: 6, kind: 'rug' }, { x: 1, y: 3, kind: 'shelf', solid: true, name: '酒棚' }, { x: 1, y: 4, kind: 'barrel', solid: true },
      { x: 3, y: 5, kind: 'plant', solid: true }, { x: 5, y: 5, kind: 'rug' },
    ],
    intro: '暖炉のぬくもりが心地よい広い宿屋。受付は右奥。',
  },
  shop: {
    id: 'shop',
    name: '道具屋',
    biome: 'town',
    indoor: true,
    grid: room(9, 7, 4),
    warps: [{ x: 4, y: 6, to: 'rapis', tx: 21, ty: 18 }],
    npcs: [{ x: 4, y: 2, kind: 'shop', name: '道具屋のラル', emoji: '🧑‍💼', sprite: 'npc_laru' }],
    props: [
      // 長机のカウンター(店主を挟む)
      { x: 2, y: 2, kind: 'table', solid: true }, { x: 3, y: 2, kind: 'table', solid: true },
      { x: 5, y: 2, kind: 'table', solid: true }, { x: 6, y: 2, kind: 'table', solid: true },
      // カウンター奥の品物
      { x: 1, y: 1, kind: 'shelf', solid: true }, { x: 2, y: 1, kind: 'barrel', solid: true },
      { x: 4, y: 1, kind: 'pot', solid: true }, { x: 6, y: 1, kind: 'crate', solid: true }, { x: 7, y: 1, kind: 'shelf', solid: true },
      // 装飾・店内の在庫
      { x: 4, y: 0, kind: 'sign', name: '看板', lines: ['「道具屋ラル ―― 旅の必需品、そろえてます」'] },
      { x: 1, y: 5, kind: 'barrel', solid: true }, { x: 7, y: 5, kind: 'crate', solid: true },
      { x: 1, y: 4, kind: 'plant', solid: true },
    ],
    intro: '所狭しと道具が並ぶ店。長机の奥に店主が立っている。',
  },
  forest: {
    id: 'forest',
    name: '緑霧の森',
    biome: 'forest',
    grid: buildForest(),
    warps: [
      { x: 17, y: 28, to: 'rapis', tx: 17, ty: 23 }, // 南=村へ
      { x: 32, y: 15, to: 'coast_road', tx: 2, ty: 6, gate: '新緑の記章' }, // 東=海へ(要・新緑の記章)
    ],
    leader: { x: 17, y: 3, trainerId: 'gym_forest' },
    encounter: {
      pool: ['portabupa', 'venomite', 'sporin', 'hobgobalt', 'tsunousa', 'falcone', 'briezel', 'pibit'],
      min: 4,
      max: 8,
    },
    props: [
      { x: 16, y: 27, kind: 'sign', name: '道しるべ', lines: ['「奥へ進むほど 道は入り組む。支部長は 最奥の広間に。」', '「→ 東 — 潮騒の道(新緑の記章が必要)」'] },
      { x: 4, y: 20, kind: 'mushroom' },
      { x: 24, y: 21, kind: 'mushroom' },
      { x: 10, y: 14, kind: 'mushroom' },
      { x: 26, y: 13, kind: 'mushroom' },
      { x: 27, y: 19, kind: 'rock', solid: true },
      { x: 3, y: 4, kind: 'rock', solid: true },
      { x: 5, y: 24, kind: 'log', solid: true },
      // ── 追加(非ソリッドは通路にも可、ソリッドは草地/広間/行き止まりのみ) ──
      { x: 5, y: 21, kind: 'mushroom' }, { x: 22, y: 20, kind: 'mushroom' }, { x: 9, y: 15, kind: 'mushroom' },
      { x: 25, y: 14, kind: 'mushroom' }, { x: 18, y: 5, kind: 'mushroom' }, { x: 3, y: 5, kind: 'mushroom' },
      { x: 29, y: 26, kind: 'mushroom' }, { x: 26, y: 20, kind: 'mushroom' },
      { x: 6, y: 19, kind: 'flower' }, { x: 23, y: 23, kind: 'flower' }, { x: 11, y: 13, kind: 'flower' },
      { x: 27, y: 11, kind: 'flower' }, { x: 15, y: 4, kind: 'flower' }, { x: 20, y: 6, kind: 'flower' },
      { x: 5, y: 20, kind: 'flower' }, { x: 30, y: 26, kind: 'flower' }, { x: 9, y: 12, kind: 'flower' },
      { x: 4, y: 23, kind: 'rock', solid: true }, { x: 25, y: 23, kind: 'rock', solid: true },
      { x: 24, y: 14, kind: 'rock', solid: true }, { x: 15, y: 6, kind: 'rock', solid: true },
      { x: 29, y: 27, kind: 'rock', solid: true },
      { x: 22, y: 21, kind: 'log', solid: true }, { x: 10, y: 13, kind: 'log', solid: true },
    ],
    chests: [
      { x: 3, y: 6, id: 'forest_nw', item: 'heal2', amount: 1 }, // 北西の行き止まり
      { x: 30, y: 27, id: 'forest_se', item: 'flask', amount: 2 }, // 南東の行き止まり
      { x: 27, y: 12, id: 'forest_r4', item: 'money', amount: 300 }, // 東の草地
    ],
    intro: '霧が立ちこめる森。高草には野生の幻獣がひそむ。奥に錬獣師の気配……。',
  },
  coast_road: {
    id: 'coast_road',
    name: '潮騒の道',
    biome: 'sea',
    grid: buildCoast(),
    warps: [
      { x: 1, y: 6, to: 'forest', tx: 31, ty: 15 }, // 西=森へ
      { x: 20, y: 6, to: 'port', tx: 2, ty: 8 }, // 東=港町へ
    ],
    encounter: { pool: ['shelk', 'frost', 'aquab', 'teary', 'pibit', 'briezel'], min: 9, max: 13 },
    props: [
      { x: 3, y: 9, kind: 'rock', solid: true },
      { x: 18, y: 9, kind: 'rock', solid: true },
      { x: 10, y: 9, kind: 'barrel', solid: true },
      { x: 5, y: 10, kind: 'shell' },
      { x: 15, y: 10, kind: 'shell' },
      // ── 追加 ──
      { x: 8, y: 10, kind: 'shell' }, { x: 12, y: 10, kind: 'shell' }, { x: 2, y: 9, kind: 'shell' },
      { x: 19, y: 10, kind: 'shell' }, { x: 4, y: 9, kind: 'shell' },
      { x: 6, y: 9, kind: 'rock', solid: true }, { x: 16, y: 9, kind: 'rock', solid: true },
      { x: 13, y: 9, kind: 'barrel', solid: true }, { x: 14, y: 9, kind: 'crate', solid: true },
    ],
    intro: '潮の香りが満ちる海沿いの道。葦のしげみに水辺の幻獣が現れる。',
  },
  port: {
    id: 'port',
    name: '潮鳴りの港町',
    biome: 'sea',
    grid: buildPort(),
    warps: [{ x: 1, y: 8, to: 'coast_road', tx: 19, ty: 6 }], // 西=潮騒の道へ
    leader: { x: 12, y: 2, trainerId: 'gym_port' },
    npcs: [
      {
        x: 8,
        y: 8,
        kind: 'villager',
        name: '船乗り',
        emoji: '🧑‍✈️',
        sprite: 'npc_sailor',
        portrait: 'sailor',
        lines: ['沖に"灰の渦"が出てな……船もまともに出せやしねえ。', '支部長のマレアの姉さんが、なんとかしようと睨みを利かせてるよ。'],
      },
    ],
    buildings: [
      { x: 5, y: 4, w: 3, h: 2, kind: 'home' },
      { x: 16, y: 4, w: 3, h: 2, kind: 'inn' },
    ],
    props: [
      { x: 5, y: 9, kind: 'barrel', solid: true },
      { x: 6, y: 9, kind: 'crate', solid: true },
      { x: 16, y: 9, kind: 'barrel', solid: true },
      { x: 20, y: 11, kind: 'anchor', solid: true, name: '錨', lines: ['大きな船の錨。潮の匂いが染みついている。'] },
      { x: 10, y: 6, kind: 'lamp', solid: true },
      { x: 18, y: 7, kind: 'crate', solid: true },
      { x: 8, y: 9, kind: 'fence', solid: true },
      // ── 追加 ──
      { x: 3, y: 3, kind: 'flower' }, { x: 21, y: 3, kind: 'flower' }, { x: 4, y: 11, kind: 'flower' },
      { x: 10, y: 11, kind: 'flower' }, { x: 20, y: 10, kind: 'flower' },
      { x: 6, y: 10, kind: 'barrel', solid: true }, { x: 5, y: 10, kind: 'crate', solid: true },
      { x: 17, y: 9, kind: 'barrel', solid: true }, { x: 18, y: 9, kind: 'crate', solid: true },
      { x: 4, y: 6, kind: 'lamp', solid: true }, { x: 20, y: 6, kind: 'lamp', solid: true },
      { x: 2, y: 3, kind: 'plant', solid: true }, { x: 22, y: 3, kind: 'plant', solid: true },
      { x: 2, y: 11, kind: 'plant', solid: true }, { x: 22, y: 11, kind: 'plant', solid: true },
    ],
    intro: '船が行き交う潮鳴りの港町。海風の向こう、支部長マレアが待つ。',
  },
}

export const TRAINERS: Record<string, TrainerData> = {
  gym_forest: {
    id: 'gym_forest',
    name: '森の支部長 シルヴァ',
    team: [
      { speciesId: 'sporin', level: 9 },
      { speciesId: 'mandrago', level: 10 },
      { speciesId: 'alraune', level: 12 },
    ],
    badge: '新緑の記章',
    portrait: 'gym_forest',
    preBattle: ['ようこそ、緑霧の森へ。', 'この森も、灰に蝕まれはじめている。……あなたの覚悟、見せて。'],
    postBattle: [
      '見事。あなたの幻獣は、よく育てられているわ。……時間をかけて、ね。',
      '新緑の記章を受け取って。',
      '灰の源は、北から流れてくる。まずは海へ――港の支部長マレアを訪ねなさい。',
    ],
  },
  gym_port: {
    id: 'gym_port',
    name: '港の支部長 マレア',
    team: [
      { speciesId: 'shelk', level: 16 },
      { speciesId: 'aquab', level: 17 },
      { speciesId: 'marinel', level: 19 },
    ],
    badge: '蒼潮の記章',
    portrait: 'gym_port',
    preBattle: ['あたしの海を濁す、灰の渦……。', 'あんたに、立ち向かう度胸はあるかい？'],
    postBattle: [
      'はっ、いい波に乗ってるじゃないか！ 認めるよ。',
      '蒼潮の記章だ、持っていきな。',
      'あたしの船で大陸へ送ってやる。灰の使徒の尻尾、掴んでみせな。',
    ],
  },
}

export const ENCOUNTER_RATE = 0.18

export function isWall(ch: string): boolean {
  return ch === '#' || ch === 'H' || ch === 'W'
}
