// フィールドマップとトレーナー定義
// グリッド文字: '#'=壁/木, 'H'=建物, '.'=地面, 'G'=草むら(エンカウント)
import type { TrainerData } from '../types'

export type NpcKind = 'mentor' | 'mom' | 'inn' | 'sign'
export interface Npc {
  x: number
  y: number
  kind: NpcKind
  name: string
}

export interface GameMap {
  id: string
  name: string
  biome: string // バトル背景の地形キー (public/bg/battle/<biome>.jpg)
  grid: string[]
  warps: { x: number; y: number; to: string; tx: number; ty: number }[]
  leader?: { x: number; y: number; trainerId: string }
  encounter?: { pool: string[]; min: number; max: number }
  npcs?: Npc[]
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
    // 上(4,1)が北の門＝森への道。スタートは下(4,6)。
    warps: [{ x: 4, y: 1, to: 'forest', tx: 4, ty: 5 }],
    npcs: [
      { x: 2, y: 2, kind: 'mentor', name: '師ガレン' },
      { x: 6, y: 2, kind: 'inn', name: '宿屋の主人' },
      { x: 4, y: 4, kind: 'mom', name: 'おかあさん' },
    ],
    intro: '錬金工房が並ぶ静かな村。北の門の先に緑霧の森が広がる。',
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
    warps: [{ x: 4, y: 6, to: 'rapis', tx: 4, ty: 2 }],
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
