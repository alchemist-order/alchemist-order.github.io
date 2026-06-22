// フィールドマップとトレーナー定義
// グリッド文字:
//   '#'=木/壁(進入不可)  'H'=建物(進入不可)  'W'=水(進入不可)
//   '.'=道/床(歩行可)    ','=芝生(歩行可・装飾)  'G'=高草(歩行可・エンカウント)
//   'F'=花(歩行可・装飾)  '~'=砂浜(歩行可)
// 広大マップ＋カメラ追従。画面に映るのは一部だけで、移動でスクロールする。
import type { TrainerData } from '../types'

export type NpcKind = 'mentor' | 'mom' | 'inn' | 'sign' | 'villager' | 'shop'
export interface Npc {
  x: number
  y: number
  kind: NpcKind
  name: string
  emoji?: string // 画像が無い場合の表示(種別既定を上書き)
  lines?: string[] // villager/sign 用の台詞
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

// 始まりの村ラピス(24x18) 芝生に石畳・家3軒・道具屋・南に森への門
function buildRapis(): string[] {
  const g = grid(24, 18, ',')
  frame(g, '#')
  fill(g, 2, 8, 21, 8, '.') // 大通り(横)
  fill(g, 11, 1, 11, 16, '.') // 大通り(縦)
  // 家(2x3ブロック)＋扉(下に1マスの道)
  fill(g, 3, 3, 5, 4, 'H')
  set(g, 4, 5, '.')
  fill(g, 4, 5, 4, 8, '.') // 扉→大通り
  fill(g, 10, 2, 12, 3, 'H')
  set(g, 11, 4, '.')
  fill(g, 18, 3, 20, 4, 'H')
  set(g, 19, 5, '.')
  fill(g, 19, 5, 19, 8, '.')
  // 道具屋の露店
  fill(g, 13, 10, 15, 11, 'H')
  // 花壇の装飾
  ;[[6, 11], [7, 6], [16, 12], [20, 10], [3, 14], [8, 13], [17, 6]].forEach(([x, y]) => set(g, x, y, 'F'))
  // 南の門(森へ)
  set(g, 11, 16, '.')
  return g
}

// 緑霧の森(24x20) 縦の小道を軸に高草の群れと木立。北に支部長、東に海への出口
function buildForest(): string[] {
  const g = grid(24, 20, '.')
  frame(g, '#')
  fill(g, 3, 5, 9, 8, 'G')
  fill(g, 14, 4, 20, 7, 'G')
  fill(g, 5, 11, 11, 15, 'G')
  fill(g, 15, 11, 20, 15, 'G')
  // 木立(障害物)
  fill(g, 8, 9, 10, 10, '#')
  fill(g, 14, 9, 16, 10, '#')
  set(g, 4, 16, '#')
  set(g, 19, 16, '#')
  set(g, 6, 3, '#')
  set(g, 18, 3, '#')
  // 通路を確保(縦の背骨＋東への枝)
  fill(g, 12, 2, 12, 18, '.')
  fill(g, 12, 10, 22, 10, '.')
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
      { x: 11, y: 16, to: 'forest', tx: 12, ty: 17, gate: 'starter' }, // 南=森へ
      { x: 11, y: 4, to: 'mentor_house', tx: 3, ty: 3 }, // 中央=師の家
      { x: 4, y: 5, to: 'home', tx: 3, ty: 3 }, // 左=わが家
      { x: 19, y: 5, to: 'inn', tx: 3, ty: 3 }, // 右=宿屋
    ],
    npcs: [
      {
        x: 14,
        y: 9,
        kind: 'shop',
        name: '道具屋のラル',
        emoji: '🛒',
      },
      {
        x: 16,
        y: 8,
        kind: 'villager',
        name: '老人モーリス',
        emoji: '👴',
        lines: [
          'わしも昔は錬獣師でな……。だが近頃の"灰化"は、わしらの知る災いとは違う。',
          '色を失い、心まで失って暴れ出す。あれは……誰かが、作り出しているものだ。',
        ],
      },
      {
        x: 7,
        y: 9,
        kind: 'villager',
        name: '子供ティナ',
        emoji: '🧒',
        lines: ['ねえねえ、幻獣つれてるの！？ いいなあ！ あたしも錬獣師になるんだ！', '強くなったら、また見せてね。約束だよ！'],
      },
    ],
    props: [
      { x: 9, y: 10, kind: 'fountain', solid: true, name: '噴水', lines: ['村の古い噴水。水面に錬金術の紋章が彫られている。'] },
      { x: 16, y: 10, kind: 'barrel', solid: true },
      { x: 16, y: 11, kind: 'crate', solid: true },
      { x: 4, y: 12, kind: 'barrel', solid: true },
      { x: 8, y: 7, kind: 'lamp', solid: true },
      { x: 17, y: 7, kind: 'lamp', solid: true },
      { x: 6, y: 7, kind: 'flower' },
      { x: 18, y: 13, kind: 'flower' },
      { x: 6, y: 13, kind: 'fence', solid: true },
      { x: 7, y: 13, kind: 'fence', solid: true },
      { x: 8, y: 13, kind: 'fence', solid: true },
      { x: 13, y: 15, kind: 'sign', name: '立て札', lines: ['「↓ 南 — 緑霧の森」'] },
    ],
    intro: '錬金工房が並ぶ静かな村。家の扉から中へ。南の門の先に緑霧の森が広がる。',
  },
  mentor_house: {
    id: 'mentor_house',
    name: '師ガレンの家',
    biome: 'town',
    indoor: true,
    grid: ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
    warps: [{ x: 3, y: 4, to: 'rapis', tx: 11, ty: 5 }],
    npcs: [{ x: 3, y: 1, kind: 'mentor', name: '師ガレン' }],
    props: [
      { x: 1, y: 1, kind: 'bookshelf', solid: true, name: '蔵書', lines: ['錬金術の古い写本がぎっしりだ。読めない記号が並んでいる。'] },
      { x: 5, y: 1, kind: 'bookshelf', solid: true, name: '蔵書', lines: ['「賢者の石」について記された頁に、栞がはさまれている……。'] },
      { x: 1, y: 3, kind: 'cauldron', solid: true, name: '錬成釜', lines: ['師の錬成釜。底に、虹色の残滓がこびりついている。'] },
      { x: 5, y: 3, kind: 'candle', solid: true },
      { x: 3, y: 3, kind: 'rug' },
    ],
    intro: '錬金道具と古びた書物が並ぶ、師の家。',
  },
  home: {
    id: 'home',
    name: 'わが家',
    biome: 'town',
    indoor: true,
    grid: ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
    warps: [
      { x: 3, y: 4, to: 'rapis', tx: 4, ty: 6 },
      { x: 5, y: 1, to: 'home2f', tx: 4, ty: 4 },
    ],
    npcs: [{ x: 3, y: 1, kind: 'mom', name: 'おかあさん' }],
    props: [
      { x: 1, y: 1, kind: 'fireplace', solid: true, name: '暖炉', lines: ['ぱちぱちと薪がはぜている。あたたかい。'] },
      { x: 1, y: 2, kind: 'plant', solid: true },
      { x: 5, y: 3, kind: 'plant', solid: true },
      { x: 3, y: 2, kind: 'rug' },
    ],
    intro: 'あたたかな わが家。階段を上ると自分の部屋がある。',
  },
  home2f: {
    id: 'home2f',
    name: 'わが家・2階',
    biome: 'town',
    indoor: true,
    grid: ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
    warps: [{ x: 4, y: 4, to: 'home', tx: 5, ty: 2 }],
    props: [
      { x: 1, y: 1, kind: 'bed', solid: true, name: 'ベッド', lines: ['よく眠った。……今日から、旅が始まる。'] },
      { x: 5, y: 1, kind: 'bookshelf', solid: true, name: '本棚', lines: ['古い幻獣図鑑。いつか、自分の見つけた幻獣を ここに書き足すんだ。'] },
      { x: 4, y: 1, kind: 'candle', solid: true },
      { x: 2, y: 3, kind: 'rug' },
      { x: 3, y: 0, kind: 'window' },
    ],
    intro: '自分の部屋。窓から朝の光が差し込んでいる。',
  },
  inn: {
    id: 'inn',
    name: 'ラピスの宿屋',
    biome: 'town',
    indoor: true,
    grid: ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
    warps: [{ x: 3, y: 4, to: 'rapis', tx: 19, ty: 6 }],
    npcs: [{ x: 3, y: 1, kind: 'inn', name: '宿屋の主人' }],
    props: [
      { x: 1, y: 1, kind: 'bed', solid: true },
      { x: 5, y: 1, kind: 'bed', solid: true },
      { x: 1, y: 3, kind: 'fireplace', solid: true, name: '暖炉', lines: ['旅人たちが暖を取っている。'] },
      { x: 5, y: 3, kind: 'plant', solid: true },
    ],
    intro: '暖炉のぬくもりが心地よい宿屋。',
  },
  forest: {
    id: 'forest',
    name: '緑霧の森',
    biome: 'forest',
    grid: buildForest(),
    warps: [
      { x: 12, y: 18, to: 'rapis', tx: 11, ty: 15 }, // 南=村へ
      { x: 22, y: 10, to: 'coast_road', tx: 2, ty: 6, gate: '新緑の記章' }, // 東=海へ(要・新緑の記章)
    ],
    leader: { x: 12, y: 2, trainerId: 'gym_forest' },
    encounter: {
      pool: ['portabupa', 'venomite', 'sporin', 'hobgobalt', 'tsunousa', 'falcone', 'briezel', 'pibit'],
      min: 4,
      max: 8,
    },
    props: [
      { x: 3, y: 3, kind: 'rock', solid: true },
      { x: 20, y: 17, kind: 'rock', solid: true },
      { x: 6, y: 6, kind: 'mushroom' },
      { x: 18, y: 6, kind: 'mushroom' },
      { x: 9, y: 16, kind: 'log', solid: true },
      { x: 10, y: 17, kind: 'sign', name: '道しるべ', lines: ['「↑ 奥へ — 支部長の気配」', '「→ 東 — 潮騒の道(新緑の記章が必要)」'] },
    ],
    intro: '霧が立ちこめる森。高草には野生の幻獣がひそむ。奥に錬獣師の気配……。',
  },
  coast_road: {
    id: 'coast_road',
    name: '潮騒の道',
    biome: 'sea',
    grid: buildCoast(),
    warps: [
      { x: 1, y: 6, to: 'forest', tx: 21, ty: 10 }, // 西=森へ
      { x: 20, y: 6, to: 'port', tx: 2, ty: 8 }, // 東=港町へ
    ],
    encounter: { pool: ['shelk', 'frost', 'aquab', 'teary', 'pibit', 'briezel'], min: 9, max: 13 },
    props: [
      { x: 3, y: 9, kind: 'rock', solid: true },
      { x: 18, y: 9, kind: 'rock', solid: true },
      { x: 10, y: 9, kind: 'barrel', solid: true },
      { x: 5, y: 10, kind: 'shell' },
      { x: 15, y: 10, kind: 'shell' },
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
        lines: ['沖に"灰の渦"が出てな……船もまともに出せやしねえ。', '支部長のマレアの姉さんが、なんとかしようと睨みを利かせてるよ。'],
      },
    ],
    props: [
      { x: 5, y: 9, kind: 'barrel', solid: true },
      { x: 6, y: 9, kind: 'crate', solid: true },
      { x: 16, y: 9, kind: 'barrel', solid: true },
      { x: 20, y: 11, kind: 'anchor', solid: true, name: '錨', lines: ['大きな船の錨。潮の匂いが染みついている。'] },
      { x: 10, y: 6, kind: 'lamp', solid: true },
      { x: 18, y: 7, kind: 'crate', solid: true },
      { x: 8, y: 9, kind: 'fence', solid: true },
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
  },
}

export const ENCOUNTER_RATE = 0.18

export function isWall(ch: string): boolean {
  return ch === '#' || ch === 'H' || ch === 'W'
}
