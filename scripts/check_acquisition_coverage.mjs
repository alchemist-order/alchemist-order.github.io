
import fs from 'node:fs'

const monsters = JSON.parse(fs.readFileSync('data/monsters.json', 'utf8')).dex
const stages = JSON.parse(fs.readFileSync('data/stages.json', 'utf8')).stages
const catchable = monsters.filter((m) => m.role !== 'legendary')
const byId = new Map(monsters.map((m) => [m.id, m]))

function stableHash(input) {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function routeOf(id) {
  const data = byId.get(id)
  if (!data) return 'wild'
  if (data.role === 'legendary') return 'legendary'
  if (data.stage === 1) return 'wild'
  if (data.stage === 2) return 'levelup'
  if (!data.id.startsWith('g')) return 'levelup'
  return (stableHash(data.id) & 1) === 0 ? 'fusion' : 'item'
}
function hasStageType(mon, stage) {
  return stage.typeWeights[mon.type] != null || (mon.type2 != null && stage.typeWeights[mon.type2] != null)
}
function weightOf(mon, stage) {
  return Math.max(stage.typeWeights[mon.type] ?? 0, mon.type2 ? stage.typeWeights[mon.type2] ?? 0 : 0)
}
function sortForStage(stage, mons) {
  return [...mons].sort((a, b) => {
    const wa = weightOf(a, stage)
    const wb = weightOf(b, stage)
    if (wa !== wb) return wb - wa
    return stableHash(`${stage.id}|${a.id}`) - stableHash(`${stage.id}|${b.id}`)
  })
}
function buildStagePool(stage) {
  const explicit = stage.extra ?? []
  const candidates = catchable.filter((m) => routeOf(m.id) === 'wild' && hasStageType(m, stage))
  const picked = sortForStage(stage, candidates).slice(0, stage.poolSize).map((m) => m.id)
  return [...new Set([...explicit, ...picked])]
}

const coveredWild = new Set()
for (const stage of stages) for (const id of buildStagePool(stage)) coveredWild.add(id)
const wild = catchable.filter((m) => routeOf(m.id) === 'wild')
const missingWild = wild.filter((m) => !coveredWild.has(m.id))
const illegalWild = [...coveredWild].map((id) => byId.get(id)).filter((m) => !m || routeOf(m.id) !== 'wild')
const brokenEvolution = catchable.filter((m) => {
  const r = routeOf(m.id)
  if ((r === 'fusion' || r === 'item') && m.from) {
    const prev = byId.get(m.from)
    return !prev || routeOf(prev.id) !== 'levelup'
  }
  return false
})
const routeCounts = catchable.reduce((acc, m) => {
  const r = routeOf(m.id)
  acc[r] = (acc[r] ?? 0) + 1
  return acc
}, {})
if (missingWild.length || illegalWild.length || brokenEvolution.length) {
  if (missingWild.length) console.error(`missing wild stage1: ${missingWild.map((m) => m.id).join(', ')}`)
  if (illegalWild.length) console.error(`non-wild in stage pools: ${illegalWild.map((m) => m?.id ?? 'unknown').join(', ')}`)
  if (brokenEvolution.length) console.error(`locked route has unreachable previous stage: ${brokenEvolution.map((m) => m.id).join(', ')}`)
  process.exit(1)
}
console.log(`? check_acquisition_coverage: wild ${routeCounts.wild ?? 0}, levelup ${routeCounts.levelup ?? 0}, fusion ${routeCounts.fusion ?? 0}, item ${routeCounts.item ?? 0}`)
