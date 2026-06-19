// フィールドマップとトレーナー定義
// グリッド文字: '#'=壁/木, 'H'=建物, '.'=地面, 'G'=草むら(エンカウント)
import type { TrainerData } from '../types'

export interface GameMap {
  id: string
  name: string
  biome: string // バトル背景の地形キー (public/bg/battle/<biome>.jpg)
  grid: string[]
  warps: { x: number; y: number; to: string; tx: number; ty: number }[]
  leader?: { x: number; y: number; trainerId: string }
  encounter?: { pool: string[]; min: number; max: number }
  intro?: string
}

export const MAPS: Record<string, GameMap> = {
  rapis: {
    id: 'rapis',
    name: '始まりの村ラピス',
    biome: 'town',
    grid: [
      '#########',
      '#.H...H.#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#...W...#',
      '#########',
    ],
    warps: [{ x: 4, y: 6, to: 'forest', tx: 4, ty: 6 }],
    intro: '錬金工房が並ぶ静かな村。北の森へ続く道がある。',
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
    warps: [{ x: 4, y: 6, to: 'rapis', tx: 4, ty: 6 }],
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
