// 幻獣を300種まで決定論的に生成して data/monsters.json を更新する。
// 既存 dex(1-100) と bosses は保持し、dex 101-300 を追記する。再実行しても同じ結果。
import { readFileSync, writeFileSync } from 'node:fs'

const path = new URL('../data/monsters.json', import.meta.url)
const data = JSON.parse(readFileSync(path, 'utf8'))
const base = data.dex.filter((d) => d.dex <= 100) // 既存100種のみ保持(再実行で増殖しない)

const TYPES = ['火', '水', '風', '地', '雷', '毒', '聖', '冥', '錬成']
const ROOTS = {
  火: ['カエン', 'グレン', 'イフリ', 'ボルカ', 'マグマ', 'エンバ', 'ホムラ', 'サラマ', 'フレア', 'プロミ', 'ヒノ', 'バーン'],
  水: ['アクア', 'マリン', 'セイレ', 'ネレイ', 'フロス', 'ティア', 'ウンデ', 'ミズチ', 'コーラ', 'アクシ', 'シオ', 'ナギ'],
  風: ['ゼフィ', 'シルフ', 'ガイル', 'テンペ', 'スカイ', 'ヴェント', 'カゼ', 'エアロ', 'ハヤテ', 'ソラ', 'ツバサ', 'レイヴ'],
  地: ['テラ', 'ガイオ', 'ロック', 'クレイ', 'グラン', 'ストン', 'ジオ', 'マウン', 'ドリュ', 'ダイチ', 'イワ', 'ペトラ'],
  雷: ['ボルト', 'スパー', 'ライデ', 'エレキ', 'ボルテ', 'プラズ', 'サンダ', 'イナズ', 'デンジ', 'ガルヴ', 'レイガ', 'ショク'],
  毒: ['ヴェノ', 'トキシ', 'ポイズ', 'ミアズ', 'パピヨ', 'ヘドロ', 'ドクガ', 'モルド', 'スポラ', 'バイラ', 'ニドラ', 'ミスト'],
  聖: ['ルミナ', 'セラフ', 'エンジェ', 'ホーリ', 'サンク', 'オーラ', 'ルクス', 'ピュリ', 'グロリ', 'セイン', 'ヒカル', 'アルバ'],
  冥: ['シャド', 'ネクロ', 'ノクタ', 'アビゾ', 'ファン', 'モルテ', 'グリム', 'レイズ', 'ダーク', 'ヨミガ', 'ナイガ', 'ウンブラ'],
  錬成: ['オーパ', 'メカニ', 'アーコ', 'クロム', 'ゴーレ', 'オトマ', 'アルケ', 'コグル', 'ヒュレ', 'ミスリ', 'エーテ', 'マギナ'],
}
const SUF = {
  1: ['ル', 'ット', 'ピィ', 'コ', 'ミィ', 'ナ', 'リィ', 'ェル'],
  2: ['ーダ', 'ロン', 'ガル', 'ーレ', 'ドス', 'リオ', 'ネス', 'ーザ'],
  3: ['ドーン', 'ザード', 'レオス', 'ガイア', 'クロス', 'ティオ', 'ヴァーン', 'オルグ'],
}
const SIG = {
  火: ['業火斬', '灼熱波', '炎の渦', '獄炎弾', 'フレイムバースト', '紅蓮撃'],
  水: ['激流斬', '津波', '水牢', 'アクアジェット', '氷結波', '渦潮'],
  風: ['真空波', '颪斬', '竜巻', 'ソニックブーム', '嵐撃', '羽根嵐'],
  地: ['大地割', '岩石落', '地隆撃', 'クェイク', '砂塵嵐', '巌砕'],
  雷: ['雷光斬', '放電', '雷鳴撃', 'ボルテッカー', '麻痺針', '電磁砲'],
  毒: ['猛毒牙', '溶解液', '毒霧', 'ヘドロ爆弾', '腐食波', '毒針乱舞'],
  聖: ['聖光斬', '裁きの光', '浄化波', 'ホーリーレイ', '癒しの輝き', '天罰'],
  冥: ['暗黒波', '呪詛', '影縛り', 'シャドーエッジ', '亡者の手', '冥府送り'],
  錬成: ['錬成砲', '金属斬', '機巧撃', 'メタルプレス', '錬金爆発', '歯車旋'],
}
const STAGE_TEXT = { 1: 'の力を宿した幼い幻獣。', 2: 'の力を操る成獣。', 3: 'を極めし幻獣。' }
const WEIGHT = {
  火: [0.18, 0.27, 0.15, 0.19, 0.21], 水: [0.23, 0.16, 0.2, 0.15, 0.26], 風: [0.16, 0.2, 0.13, 0.31, 0.2],
  地: [0.27, 0.22, 0.27, 0.09, 0.15], 雷: [0.15, 0.18, 0.13, 0.29, 0.25], 毒: [0.2, 0.22, 0.19, 0.19, 0.2],
  聖: [0.2, 0.13, 0.18, 0.18, 0.31], 冥: [0.17, 0.19, 0.15, 0.25, 0.24], 錬成: [0.2, 0.2, 0.29, 0.13, 0.18],
}
const TOTAL = { 1: 300, 2: 420, 3: 540 }
const SIZES = [3, 3, 2, 3, 1, 3, 2, 3]

const used = new Set(base.map((d) => d.name))
function uniqueName(n) {
  if (!used.has(n)) { used.add(n); return n }
  for (const tag of ['改', '真', 'II', 'EX', 'γ']) {
    const c = n + '・' + tag
    if (!used.has(c)) { used.add(c); return c }
  }
  let i = 2
  while (used.has(n + i)) i++
  used.add(n + i)
  return n + i
}
function stats(type, stage, dex) {
  const total = TOTAL[stage] + ((dex % 31) - 15) // ±15 の決定論的ばらつき
  const w = WEIGHT[type]
  return w.map((wt) => Math.max(20, Math.round(total * wt)))
}

const out = []
let dex = 101
let fam = 0
while (dex <= 300) {
  const type = TYPES[fam % 9]
  let size = SIZES[fam % SIZES.length]
  if (dex + size - 1 > 300) size = 300 - dex + 1 // 末尾は溢れないよう調整
  const root = ROOTS[type][Math.floor(fam / 9) % ROOTS[type].length]
  const sufPick = fam % 8
  const sig = SIG[type][fam % SIG[type].length]
  const type2 = fam % 6 === 5 ? TYPES[(fam + 4) % 9] : undefined
  const ids = []
  for (let s = 0; s < size; s++) ids.push('g' + (dex + s))
  for (let s = 0; s < size; s++) {
    const stage = size === 1 ? 1 : s + 1
    const tier = Math.min(3, stage)
    const name = uniqueName(root + SUF[tier][(sufPick + s) % 8])
    const e = {
      dex: dex + s,
      id: ids[s],
      name,
      type,
      stage,
      from: s > 0 ? ids[s - 1] : null,
      to: s < size - 1 ? ids[s + 1] : null,
      at: s < size - 1 ? (s === 0 ? 16 + (fam % 4) : 34 + (fam % 5)) : null,
      stats: stats(type, tier, dex + s),
      sig,
      dex_text: type + STAGE_TEXT[tier],
    }
    if (type2 && s === size - 1) e.type2 = type2 // 最終形のみ複合タイプを付与することがある
    out.push(e)
  }
  dex += size
  fam++
}

data.dex = [...base, ...out]
data.meta.count = data.dex.length
data.meta.generated_note = '101-300は scripts/gen_monsters.mjs による自動生成種(決定論的)。'
writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
console.log('total dex:', data.dex.length, ' new:', out.length, ' last:', out[out.length - 1].name, out[out.length - 1].id)
