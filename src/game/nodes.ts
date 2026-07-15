import type { Chest, GameMap, Npc, NushiSpot, RuneSwitch } from './maps'
import { MAPS, TRAINERS, WORLDS } from './maps'
import type { BattleConfig, TrainerData } from '../types'

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

const NODE_MAPS: Record<string, string[]> = {
  forest: ['forest'],
  sea: ['coast_road', 'port'],
  volcano: ['volcano_road', 'volcano_town'],
}

const NODE_NAMES: Record<string, string[]> = {
  forest: ['森の入口', '深い森', '霧の最深部', '守護者の広場'],
  sea: ['潮騒の道', '珊瑚の岩場', '港の外れ', '守護者の桟橋'],
  volcano: ['溶岩回廊', '湯けむり岩場', '火口への道', '火山郷の炉前'],
}

function bg(mapId: string): string {
  return `bg/map/${mapId}.png`
}

function mapEvents(map: GameMap): ExploreEvent[] {
  const events: ExploreEvent[] = []
  const biome = map.biome

  map.zones?.forEach((z, i) => {
    events.push({
      id: `${map.id}:zone:${i}`,
      kind: 'battle',
      title: i >= (map.zones?.length ?? 1) - 1 ? '濃い気配' : '野生の気配',
      desc: `Lv.${z.min}-${z.max} の幻獣が潜んでいる`,
      mapId: map.id,
      biome,
      config: { kind: 'wild', biome, pool: z.pool, min: z.min, max: z.max },
    })
    if (z.rarePool?.length) {
      events.push({
        id: `${map.id}:rare:${i}`,
        kind: 'battle',
        title: '珍しい足跡',
        desc: `まれな幻獣の痕跡。Lv.${z.min}-${z.max}`,
        mapId: map.id,
        biome,
        config: { kind: 'wild', biome, pool: z.rarePool, min: z.min + 1, max: z.max + 1 },
      })
    }
  })

  if (!events.some((e) => e.kind === 'battle') && map.encounter?.pool.length) {
    events.push({
      id: `${map.id}:encounter`,
      kind: 'battle',
      title: '野生の気配',
      desc: `Lv.${map.encounter.min}-${map.encounter.max} の幻獣が現れそうだ`,
      mapId: map.id,
      biome,
      config: { kind: 'wild', biome, pool: map.encounter.pool, min: map.encounter.min, max: map.encounter.max },
    })
  }

  map.chests?.forEach((chest) => {
    events.push({ id: `${map.id}:chest:${chest.id}`, kind: 'chest', title: '古い宝箱', desc: '探索の途中で宝箱を見つけた', mapId: map.id, chest })
  })
  map.nushi?.forEach((nushi) => {
    events.push({ id: `${map.id}:nushi:${nushi.id}`, kind: 'nushi', title: 'ヌシの気配', desc: '道を塞ぐ大きな幻獣がいる', mapId: map.id, biome, nushi })
  })
  map.switches?.forEach((sw) => {
    events.push({ id: `${map.id}:switch:${sw.id}`, kind: 'switch', title: sw.name ?? 'ルーン盤', desc: '古い仕掛けが淡く光っている', mapId: map.id, sw })
  })
  map.npcs?.filter((npc) => npc.kind === 'villager' || npc.kind === 'sign').forEach((npc, i) => {
    events.push({ id: `${map.id}:talk:${npc.kind}:${i}`, kind: 'talk', title: npc.name, desc: npc.kind === 'sign' ? '案内板を読む' : '旅人の話を聞く', mapId: map.id, npc })
  })
  if (map.leader) {
    const trainer = TRAINERS[map.leader.trainerId]
    if (trainer) {
      events.push({ id: `${map.id}:trainer:${trainer.id}`, kind: 'trainer', title: trainer.name, desc: 'この地の守護者に挑む', mapId: map.id, biome, trainer })
    }
  }
  return events
}

function splitEvents(events: ExploreEvent[], chunks: number): ExploreEvent[][] {
  const out = Array.from({ length: chunks }, () => [] as ExploreEvent[])
  events.forEach((event, i) => out[Math.min(chunks - 1, i % chunks)].push(event))
  return out
}

function buildNodes(worldId: string, mapIds: string[]): ExploreNode[] {
  const names = NODE_NAMES[worldId] ?? mapIds
  const all = mapIds.flatMap((mapId) => mapEvents(MAPS[mapId]).map((event) => ({ ...event, mapId })))
  const chunks = splitEvents(all, Math.max(3, Math.min(4, names.length)))
  return chunks.map((events, i) => {
    const mapId = mapIds[Math.min(mapIds.length - 1, Math.floor((i / Math.max(1, chunks.length - 1)) * (mapIds.length - 1)))]
    return {
      id: `${worldId}_${i + 1}`,
      worldId,
      mapId,
      name: names[i] ?? `${MAPS[mapId].name} ${i + 1}`,
      subtitle: MAPS[mapId].intro ?? MAPS[mapId].name,
      depth: i + 1,
      background: bg(mapId),
      events,
    }
  })
}

export const EXPLORE_WORLDS: ExploreWorld[] = WORLDS.map((world) => ({
  id: world.id,
  name: world.name,
  icon: world.icon,
  desc: world.desc,
  unlock: world.unlock,
  boss: world.boss,
  nodes: buildNodes(world.id, NODE_MAPS[world.id] ?? [world.mapId]),
}))

export const MAP_BACKGROUNDS = Object.keys(MAPS).map((mapId) => bg(mapId))