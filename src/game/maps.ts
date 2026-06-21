// フィールドマップとトレーナー定義
// グリッド文字: '#'=壁/木, 'H'=建物, '.'=地面, 'G'=草むら(エンカウント)
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
  indoor?: boolean // 室内(壁に木を出さず床表示)
  intro?: string
}

export const MAPS: Record<string, GameMap> = {
  rapis: {
    id: 'rapis',
    name: '始まりの村ラピス',
    biome: 'town',
    grid: [
      '#########',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#########',
    ],
    // 絵に合わせ: 上段=家3軒(左=わが家/中央=師/右=宿屋)、下中央=森への道
    warps: [
      { x: 4, y: 6, to: 'forest', tx: 4, ty: 5, gate: 'starter' },
      { x: 4, y: 2, to: 'mentor_house', tx: 3, ty: 3 },
      { x: 2, y: 2, to: 'home', tx: 3, ty: 3 },
      { x: 6, y: 2, to: 'inn', tx: 3, ty: 3 },
    ],
    npcs: [
      {
        x: 6,
        y: 4,
        kind: 'villager',
        name: '老人モーリス',
        emoji: '👴',
        lines: [
          'わしも昔は錬獣師でな……。だが近頃の"灰化"は、わしらの知る災いとは違う。',
          '色を失い、心まで失って暴れ出す。あれは……誰かが、作り出しているものだ。',
        ],
      },
      {
        x: 2,
        y: 5,
        kind: 'villager',
        name: '子供ティナ',
        emoji: '🧒',
        lines: ['ねえねえ、幻獣つれてるの！？ いいなあ！ あたしも錬獣師になるんだ！', '強くなったら、また見せてね。約束だよ！'],
      },
      { x: 6, y: 5, kind: 'shop', name: '道具屋のラル', emoji: '🛒' },
    ],
    intro: '錬金工房が並ぶ静かな村。家の扉から中へ。村の出口の先に緑霧の森が広がる。',
  },
  mentor_house: {
    id: 'mentor_house',
    name: '師ガレンの家',
    biome: 'town',
    indoor: true,
    grid: ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
    warps: [{ x: 3, y: 4, to: 'rapis', tx: 4, ty: 3 }],
    npcs: [{ x: 3, y: 1, kind: 'mentor', name: '師ガレン' }],
    intro: '錬金道具と古びた書物が並ぶ、師の家。',
  },
  home: {
    id: 'home',
    name: 'わが家',
    biome: 'town',
    indoor: true,
    grid: ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
    // (3,4)=外への扉、(5,1)=2階への階段
    warps: [
      { x: 3, y: 4, to: 'rapis', tx: 2, ty: 3 },
      { x: 5, y: 1, to: 'home2f', tx: 4, ty: 4 },
    ],
    npcs: [{ x: 3, y: 1, kind: 'mom', name: 'おかあさん' }],
    intro: 'あたたかな わが家。階段を上ると自分の部屋がある。',
  },
  home2f: {
    id: 'home2f',
    name: 'わが家・2階',
    biome: 'town',
    indoor: true,
    grid: ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
    // (4,4)=1階への階段
    warps: [{ x: 4, y: 4, to: 'home', tx: 5, ty: 2 }],
    intro: '自分の部屋。窓から朝の光が差し込んでいる。',
  },
  inn: {
    id: 'inn',
    name: 'ラピスの宿屋',
    biome: 'town',
    indoor: true,
    grid: ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
    warps: [{ x: 3, y: 4, to: 'rapis', tx: 6, ty: 3 }],
    npcs: [{ x: 3, y: 1, kind: 'inn', name: '宿屋の主人' }],
    // (宿屋の戻り先は村の右の家の前)
    intro: '暖炉のぬくもりが心地よい宿屋。',
  },
  forest: {
    id: 'forest',
    name: '緑霧の森',
    biome: 'forest',
    grid: [
      '#########',
      '#...L...#',
      '#.GGGGG.#',
      '#.GGGGG.#',
      '#.GGGGG.#',
      '#.GGGGG.#',
      '#...W...#',
      '#########',
    ],
    warps: [{ x: 4, y: 6, to: 'rapis', tx: 4, ty: 5 }],
    leader: { x: 4, y: 1, trainerId: 'gym_forest' },
    encounter: {
      pool: ['portabupa', 'venomite', 'sporin', 'hobgobalt', 'tsunousa', 'falcone', 'briezel', 'pibit'],
      min: 4,
      max: 8,
    },
    intro: '霧が立ちこめる森。草むらには野生の幻獣がひそむ。奥に錬獣師の気配……。',
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
}

export const ENCOUNTER_RATE = 0.18

export function isWall(ch: string): boolean {
  return ch === '#' || ch === 'H'
}
