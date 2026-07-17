
import monstersJson from '../../data/monsters.json'
import stagesJson from '../../data/stages.json'
import type { MonsterData } from '../types'
import { isWildCatchable } from './acquisition'

export interface StageDrop { key: string; rate: number }
export interface StageDef {
  id: string
  worldId: string
  name: string
  desc: string
  band: [number, number]
  typeWeights: Record<string, number>
  tiers: number[]
  poolSize: number
  rare?: { tiers: number[]; chance: number } | null
  bossTrainerId?: string | null
  unlock: { prev?: string; badge?: string; badges?: number }
  dropTable: StageDrop[]
  bg: string
  extra?: string[]
}

const ALL_DEX = (monstersJson.dex as MonsterData[]).filter((m) => m.role !== 'legendary')
export const STAGES = (stagesJson.stages as unknown as StageDef[])

function stableHash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function hasStageType(mon: MonsterData, stage: StageDef): boolean {
  return stage.typeWeights[mon.type] != null || (mon.type2 != null && stage.typeWeights[mon.type2] != null)
}

function weightOf(mon: MonsterData, stage: StageDef): number {
  return Math.max(stage.typeWeights[mon.type] ?? 0, mon.type2 ? stage.typeWeights[mon.type2] ?? 0 : 0)
}

function sortForStage(stage: StageDef, mons: MonsterData[]): MonsterData[] {
  return [...mons].sort((a, b) => {
    const wa = weightOf(a, stage)
    const wb = weightOf(b, stage)
    if (wa !== wb) return wb - wa
    return stableHash(`${stage.id}|${a.id}`) - stableHash(`${stage.id}|${b.id}`)
  })
}

export function buildStagePool(stage: StageDef): string[] {
  const explicit = stage.extra ?? []
  const candidates = ALL_DEX.filter((m) => isWildCatchable(m.id) && hasStageType(m, stage))
  const picked = sortForStage(stage, candidates).slice(0, stage.poolSize).map((m) => m.id)
  return Array.from(new Set([...explicit, ...picked]))
}

export function buildStageRarePool(stage: StageDef): string[] {
  if (!stage.rare) return []
  const candidates = ALL_DEX.filter((m) => isWildCatchable(m.id) && hasStageType(m, stage))
  return sortForStage(stage, candidates).slice(0, 4).map((m) => m.id)
}

export function stageById(id: string): StageDef | undefined {
  return STAGES.find((stage) => stage.id === id)
}
