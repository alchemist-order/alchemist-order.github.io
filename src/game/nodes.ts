
import { TRAINERS, WORLDS } from './maps'
import type { Chest, Npc, NushiSpot, RuneSwitch } from './maps'
import type { BattleConfig, TrainerData } from '../types'
import { STAGES, buildStagePool, type StageDef } from './stages'

export type ExploreEvent =
  | { id: string; kind: 'battle'; title: string; desc: string; mapId: string; biome: string; config: Extract<BattleConfig, { kind: 'wild' }> }
  | { id: string; kind: 'chest'; title: string; desc: string; mapId: string; chest: Chest }
  | { id: string; kind: 'nushi'; title: string; desc: string; mapId: string; biome: string; nushi: NushiSpot }
  | { id: string; kind: 'switch'; title: string; desc: string; mapId: string; sw: RuneSwitch }
  | { id: string; kind: 'talk'; title: string; desc: string; mapId: string; npc: Npc }
  | { id: string; kind: 'trainer'; title: string; desc: string; mapId: string; biome: string; trainer: TrainerData }

export interface ExploreNode {
  id: string
  worldId: string
  mapId: string
  name: string
  subtitle: string
  depth: number
  background: string
  stage: StageDef
  events: ExploreEvent[]
}

export interface ExploreWorld {
  id: string
  name: string
  icon: string
  desc: string
  unlock: string | null
  boss: string
  nodes: ExploreNode[]
}

const WORLD_META: Record<string, { name: string; icon: string; desc: string; boss: string; unlock: string | null }> = {
  forest: WORLDS.find((w) => w.id === 'forest') ?? { name: '緑霧の森', icon: 'F', desc: '霧立ちこめる迷いの森。', boss: 'gym_forest', unlock: null },
  sea: WORLDS.find((w) => w.id === 'sea') ?? { name: '潮鳴りの海', icon: 'S', desc: '潮騒の道から港町へ。', boss: 'gym_port', unlock: '新緑の記章' },
  volcano: WORLDS.find((w) => w.id === 'volcano') ?? { name: '紅蓮の火山郷', icon: 'V', desc: '灼熱の溶岩回廊。', boss: 'gym_fire', unlock: '蒼潮の記章' },
  deep: { name: '星蝕の深域', icon: '*', desc: '記章を集めた錬獣師だけが潜れる高難度の深域。', boss: 'deep', unlock: '新緑の記章' },
}

function mapIdFor(stage: StageDef): string {
  if (stage.bg.includes('coast_road')) return 'coast_road'
  if (stage.bg.includes('port')) return 'port'
  if (stage.bg.includes('volcano_road')) return 'volcano_road'
  if (stage.bg.includes('volcano_town')) return 'volcano_town'
  if (stage.worldId === 'deep') return 'forest'
  return 'forest'
}

function stageEvents(stage: StageDef): ExploreEvent[] {
  const biome = stage.worldId === 'deep' ? 'forest' : stage.worldId
  const mapId = mapIdFor(stage)
  const events: ExploreEvent[] = [{
    id: `${stage.id}:wild`,
    kind: 'battle',
    title: `${stage.name}の幻獣`,
    desc: `Lv.${stage.band[0]}-${stage.band[1]}の野生幻獣が出現`,
    mapId,
    biome,
    config: { kind: 'wild', biome, pool: buildStagePool(stage), min: stage.band[0], max: stage.band[1] },
  }]
  if (stage.bossTrainerId && TRAINERS[stage.bossTrainerId]) {
    const trainer = TRAINERS[stage.bossTrainerId]
    events.push({ id: `${stage.id}:trainer:${trainer.id}`, kind: 'trainer', title: trainer.name, desc: 'この地の守護者に挑む', mapId, biome, trainer })
  }
  return events
}

function nodeForStage(stage: StageDef, index: number): ExploreNode {
  const mapId = mapIdFor(stage)
  return {
    id: stage.id,
    worldId: stage.worldId,
    mapId,
    name: stage.name,
    subtitle: stage.desc,
    depth: index + 1,
    background: stage.bg,
    stage,
    events: stageEvents(stage),
  }
}

export const EXPLORE_WORLDS: ExploreWorld[] = Object.entries(WORLD_META)
  .map(([id, meta]) => ({
    id,
    name: meta.name,
    icon: meta.icon,
    desc: meta.desc,
    unlock: meta.unlock,
    boss: meta.boss,
    nodes: STAGES.filter((stage) => stage.worldId === id).map(nodeForStage),
  }))
  .filter((world) => world.nodes.length > 0)

export const MAP_BACKGROUNDS = Array.from(new Set(STAGES.map((stage) => stage.bg)))
