// 特性(とくせい)＆もちもの の定義。バトルengine(battleEngine.ts)とUIが参照。
// スキーマ先行: 全幻獣はタイプ既定の特性を持つ(個別は MonsterData.ability で上書き)。
import type { MonsterData } from '../types'

export interface Ability {
  id: string
  name: string
  desc: string
}
// 実装済みの特性(効果は battleEngine / Battle のフックで処理)
export const ABILITIES: Record<string, Ability> = {
  blaze: { id: 'blaze', name: '烈火', desc: 'HPが1/3以下のとき、自分のタイプ技の威力が1.5倍。' },
  regen: { id: 'regen', name: '自然回復', desc: '毎ターン終了時にHPを少し回復する。' },
  sturdy: { id: 'sturdy', name: '頑丈', desc: 'HP満タンなら、一撃で倒される攻撃を耐える(HP1で残る)。' },
  swift: { id: 'swift', name: '俊足', desc: 'すばやさが15%上がる。' },
  guts: { id: 'guts', name: '剛力', desc: '状態異常のとき、物理技の威力が1.5倍。' },
  toxictouch: { id: 'toxictouch', name: '毒手', desc: '物理技を当てたとき、30%で相手をどくにする。' },
  ward: { id: 'ward', name: '加護', desc: '受けるダメージが15%減る。' },
  levitate: { id: 'levitate', name: '浮遊', desc: '地タイプの技を受けない。' },
}
// タイプ → 既定特性(個別未指定の300種をこれで自動カバー)
export const ABILITY_BY_TYPE: Record<string, string> = {
  火: 'blaze', 水: 'regen', 地: 'sturdy', 風: 'swift', 雷: 'guts',
  毒: 'toxictouch', 聖: 'ward', 冥: 'levitate', 錬成: 'swift',
}
export function abilityIdOf(data: MonsterData): string {
  return data.ability ?? ABILITY_BY_TYPE[data.type] ?? 'ward'
}
export function abilityOf(data: MonsterData): Ability {
  return ABILITIES[abilityIdOf(data)] ?? ABILITIES.ward
}

// ── もちもの ──
// statMult=生成時の能力倍率 / dmgTakenMult=被ダメ倍率 / pinchHeal=HP25%以下で1度だけ自動回復(maxHp比)
export interface HeldItem {
  id: string
  name: string
  desc: string
  statMult?: { atk?: number; mag?: number; hp?: number; spd?: number }
  dmgTakenMult?: number
  pinchHeal?: number
}
export const HELD_ITEMS: Record<string, HeldItem> = {
  powerband: { id: 'powerband', name: '力のハチマキ', desc: 'こうげき+15%', statMult: { atk: 1.15 } },
  magicstone: { id: 'magicstone', name: '魔石', desc: 'まりょく+15%', statMult: { mag: 1.15 } },
  lifering: { id: 'lifering', name: '命の輪', desc: '最大HP+15%', statMult: { hp: 1.15 } },
  swiftboots: { id: 'swiftboots', name: '俊足のブーツ', desc: 'すばやさ+15%', statMult: { spd: 1.15 } },
  guardamulet: { id: 'guardamulet', name: '守りの護符', desc: '受けるダメージ-10%', dmgTakenMult: 0.9 },
  oranberry: { id: 'oranberry', name: '回復の実', desc: 'HPが25%以下になると1度だけ最大HPの30%回復', pinchHeal: 0.3 },
}
export function heldItemOf(id?: string): HeldItem | null {
  return id ? HELD_ITEMS[id] ?? null : null
}
// 装備カタログ(UIの選択肢順)
export const HELD_ITEM_IDS = ['powerband', 'magicstone', 'lifering', 'swiftboots', 'guardamulet', 'oranberry']
