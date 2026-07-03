// データ表ジェネレータ(S4)。src/game/{maps,abilities,state}.ts を直接importして
// docs/DATA_TABLES.md を生成する。手書きで表を作ると実装とdriftするため、
// 「表=実データから機械生成」にして同期を構造的に保証する。
// 実行: npx tsx scripts/gen_data_docs.mjs
import { writeFileSync } from 'node:fs'
import { MAPS } from '../src/game/maps.ts'
import { ABILITIES, ABILITY_BY_TYPE, HELD_ITEMS, HELD_ITEM_IDS } from '../src/game/abilities.ts'
import { RECIPES, LEGEND_BY_TYPE, LEGEND_MOVE_NAME, FUSION_COST, TALENT_MAX, MAX_INHERITED, species, DEX } from '../src/game/state.ts'

const name = (id) => { try { return species(id).name } catch { return `?${id}` } }
const typeOf = (id) => { try { const s = species(id); return s.type + (s.type2 ? '/' + s.type2 : '') } catch { return '?' } }

let out = []
out.push('# データ表（S4・自動生成 — 手編集しないこと）')
out.push('')
out.push(`生成元: \`src/game/maps.ts\` / \`src/game/abilities.ts\` / \`src/game/state.ts\`。`)
out.push('データを変更したら `npx tsx scripts/gen_data_docs.mjs` を再実行してこのファイルを更新する。')
out.push('')

// ── 1. 出現プール ──
out.push('## 1. 出現プール（マップ別）')
out.push('')
for (const [mapId, m] of Object.entries(MAPS)) {
  if (!m.encounter && !m.zones?.length) continue
  out.push(`### ${m.name}（\`${mapId}\`）`)
  if (m.encounter) {
    out.push(`- **基本プール**（zones未指定エリア）: Lv${m.encounter.min}-${m.encounter.max}`)
    out.push(`  ${m.encounter.pool.map((id) => `${name(id)}(${typeOf(id)})`).join('、')}`)
  }
  if (m.zones?.length) {
    out.push('')
    out.push('| 区画 | 範囲(x,y) | Lv帯 | プール | レア枠 |')
    out.push('|---|---|---|---|---|')
    m.zones.forEach((z, i) => {
      const rare = z.rarePool?.length ? `${Math.round((z.rareChance ?? 0) * 100)}% ${z.rarePool.length}種` : '-'
      out.push(`| ${i + 1} | (${z.x0},${z.y0})-(${z.x1},${z.y1}) | ${z.min}-${z.max} | ${z.pool.map(name).join('、')} | ${rare} |`)
    })
  }
  if (m.nushi?.length) {
    out.push('')
    out.push('**ヌシ幻獣**:')
    for (const n of m.nushi) out.push(`- ${name(n.speciesId)} Lv${n.level} talent${n.talent}（宝箱ルートを封鎖。flag=\`nushi_${n.id}\`で解放）`)
  }
  if (m.switches?.length || m.gates?.length) {
    out.push('')
    out.push('**ルーンスイッチ/ゲート**:')
    for (const s of m.switches ?? []) out.push(`- スイッチ(${s.x},${s.y}) → flag=\`${s.flag}\``)
    for (const g of m.gates ?? []) out.push(`- ゲート(${g.x},${g.y}) ← flag=\`${g.flag}\` が立つまで進入不可`)
  }
  out.push('')
}

// ── 2. 特性 ──
out.push('## 2. 特性（とくせい）')
out.push('')
out.push('| id | 名前 | 効果 |')
out.push('|---|---|---|')
for (const a of Object.values(ABILITIES)) out.push(`| ${a.id} | ${a.name} | ${a.desc} |`)
out.push('')
out.push('### タイプ既定（個別指定が無い種はこれに従う）')
out.push('')
out.push('| タイプ | 既定特性 |')
out.push('|---|---|')
for (const [t, aid] of Object.entries(ABILITY_BY_TYPE)) out.push(`| ${t} | ${ABILITIES[aid]?.name ?? aid} |`)
out.push('')

// ── 3. もちもの ──
out.push('## 3. もちもの')
out.push('')
out.push('| id | 名前 | 効果 |')
out.push('|---|---|---|')
for (const id of HELD_ITEM_IDS) { const it = HELD_ITEMS[id]; out.push(`| ${it.id} | ${it.name} | ${it.desc} |`) }
out.push('')

// ── 4. 錬成レシピ ──
out.push('## 4. 錬成（融合）レシピ')
out.push('')
out.push(`- 費用: ${FUSION_COST}ゲル / talent上限: ${TALENT_MAX} / 遺伝技の保持上限: ${MAX_INHERITED}(継承の符で+1)`)
out.push('- 一般式: `talent = min(TALENT_MAX, max(親talent) + 1 + 才能の結晶ボーナス)`、`Lv = clamp(round((親Lv平均)+3), 5, 60)`')
out.push('')
out.push('### 隠し配合（特定2種の組み合わせ・順不同）')
out.push('')
out.push('| ベース | 素材 | 結果 | 専用技 |')
out.push('|---|---|---|---|')
for (const r of RECIPES) out.push(`| ${name(r.base)} | ${name(r.material)} | ${name(r.result)} | ${r.move.name}（威力${r.move.power}） |`)
out.push('')
out.push('### 汎用レア配合（同タイプの最終形=stage3を2体錬成）')
out.push('')
out.push('| タイプ | 生まれる伝説種 | 専用技 |')
out.push('|---|---|---|')
for (const [t, id] of Object.entries(LEGEND_BY_TYPE)) out.push(`| ${t} | ${name(id)} | ${LEGEND_MOVE_NAME[t]}（威力110） |`)
const uncovered = ['毒', '雷', '錬成'].filter((t) => !LEGEND_BY_TYPE[t])
if (uncovered.length) out.push('')
if (uncovered.length) out.push(`> 未対応タイプ(${uncovered.join('/')})は隠し配合のみで到達可能な伝説種が未定義。将来の拡張候補。`)
out.push('')

out.push(`---\n件数: マップ${Object.keys(MAPS).filter((k) => MAPS[k].encounter || MAPS[k].zones?.length).length} / 特性${Object.keys(ABILITIES).length} / もちもの${HELD_ITEM_IDS.length} / 隠し配合${RECIPES.length} / 汎用レア配合${Object.keys(LEGEND_BY_TYPE).length} / 図鑑総数${DEX.length}`)

writeFileSync(new URL('../docs/DATA_TABLES.md', import.meta.url), out.join('\n') + '\n')
console.log('✓ docs/DATA_TABLES.md を生成しました')
