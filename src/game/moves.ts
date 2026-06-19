// 技プール。各タイプの「基本技/強技/特殊技(状態異常・回復)」＋固有技を組み合わせて
// 各幻獣のレベルに応じた技セット(最大4)を生成する。
import type { Move, MonsterData } from '../types'

interface TypeKit {
  basic: Move // 低威力・高命中の物理
  blast: Move // 高威力の特殊
  tech: Move // 状態異常 or 回復 or 追加打撃
}

const m = (mv: Move): Move => mv

export const TYPE_KIT: Record<string, TypeKit> = {
  火: {
    basic: m({ id: 'fire_b', name: 'ひのこ', type: '火', category: 'phys', power: 45, acc: 0.95, desc: '小さな炎をぶつける。' }),
    blast: m({ id: 'fire_x', name: 'かえんほうしゃ', type: '火', category: 'spec', power: 80, acc: 0.9, desc: '激しい炎を浴びせる。' }),
    tech: m({ id: 'fire_t', name: 'ひのいぶき', type: '火', category: 'status', power: 0, acc: 0.85, desc: '相手をやけど状態にする。', inflict: { status: 'やけど', chance: 1 } }),
  },
  水: {
    basic: m({ id: 'water_b', name: 'みずでっぽう', type: '水', category: 'phys', power: 45, acc: 0.95, desc: '水を勢いよく飛ばす。' }),
    blast: m({ id: 'water_x', name: 'みずのはどう', type: '水', category: 'spec', power: 80, acc: 0.9, desc: '水の波動で攻撃。' }),
    tech: m({ id: 'water_t', name: 'れいきゃく', type: '水', category: 'status', power: 0, acc: 0.7, desc: '相手をこおらせる。', inflict: { status: 'こおり', chance: 1 } }),
  },
  風: {
    basic: m({ id: 'wind_b', name: 'つつく', type: '風', category: 'phys', power: 45, acc: 0.95, desc: 'くちばしや爪でつつく。' }),
    blast: m({ id: 'wind_x', name: 'エアスラッシュ', type: '風', category: 'spec', power: 80, acc: 0.9, desc: '風の刃で切り裂く。' }),
    tech: m({ id: 'wind_t', name: 'たつまき', type: '風', category: 'spec', power: 60, acc: 0.95, desc: '竜巻で確実に攻撃する。' }),
  },
  地: {
    basic: m({ id: 'earth_b', name: 'たいあたり', type: '地', category: 'phys', power: 45, acc: 0.95, desc: '全身でぶつかる。' }),
    blast: m({ id: 'earth_x', name: 'じしん', type: '地', category: 'phys', power: 85, acc: 0.9, desc: '大地を揺らす。' }),
    tech: m({ id: 'earth_t', name: 'ねむりごな', type: '地', category: 'status', power: 0, acc: 0.75, desc: '相手をねむり状態にする。', inflict: { status: 'ねむり', chance: 1 } }),
  },
  雷: {
    basic: m({ id: 'volt_b', name: 'でんきショック', type: '雷', category: 'spec', power: 45, acc: 0.95, desc: '電撃を浴びせる。' }),
    blast: m({ id: 'volt_x', name: 'かみなり', type: '雷', category: 'spec', power: 90, acc: 0.8, desc: '強力な雷を落とす。' }),
    tech: m({ id: 'volt_t', name: 'でんじは', type: '雷', category: 'status', power: 0, acc: 0.9, desc: '相手をまひ状態にする。', inflict: { status: 'まひ', chance: 1 } }),
  },
  毒: {
    basic: m({ id: 'pois_b', name: 'どくづき', type: '毒', category: 'phys', power: 50, acc: 0.95, desc: '毒の牙や針で突く。', inflict: { status: 'どく', chance: 0.2 } }),
    blast: m({ id: 'pois_x', name: 'ヘドロこうげき', type: '毒', category: 'spec', power: 80, acc: 0.9, desc: '汚泥を浴びせる。' }),
    tech: m({ id: 'pois_t', name: 'どくのこな', type: '毒', category: 'status', power: 0, acc: 0.9, desc: '相手をどく状態にする。', inflict: { status: 'どく', chance: 1 } }),
  },
  聖: {
    basic: m({ id: 'holy_b', name: 'ようせいのかぜ', type: '聖', category: 'spec', power: 45, acc: 0.95, desc: '神聖な風を起こす。' }),
    blast: m({ id: 'holy_x', name: 'マジカルレイ', type: '聖', category: 'spec', power: 80, acc: 0.9, desc: '聖なる光線を放つ。' }),
    tech: m({ id: 'holy_t', name: 'いやしのいのり', type: '聖', category: 'status', power: 0, acc: 1, desc: 'HPを回復し、自分の状態異常を治す。', heal: 0.5, cures: true }),
  },
  冥: {
    basic: m({ id: 'dark_b', name: 'かげうち', type: '冥', category: 'phys', power: 45, acc: 0.95, desc: '影から不意を突く。' }),
    blast: m({ id: 'dark_x', name: 'シャドーボール', type: '冥', category: 'spec', power: 80, acc: 0.9, desc: '闇の塊をぶつける。' }),
    tech: m({ id: 'dark_t', name: 'はいかののろい', type: '冥', category: 'status', power: 0, acc: 0.85, desc: '相手を灰化させる。徐々に蝕む。', inflict: { status: '灰化', chance: 1 } }),
  },
  錬成: {
    basic: m({ id: 'opus_b', name: 'メタルクロー', type: '錬成', category: 'phys', power: 50, acc: 0.95, desc: '硬い爪で引っかく。' }),
    blast: m({ id: 'opus_x', name: 'ラスターカノン', type: '錬成', category: 'spec', power: 80, acc: 0.9, desc: '光の砲撃を放つ。' }),
    tech: m({ id: 'opus_t', name: 'リペア', type: '錬成', category: 'status', power: 0, acc: 1, desc: '自己修復してHPを回復する。', heal: 0.45 }),
  },
}

/** 固有技(その幻獣の代名詞。高威力の特殊技) */
export function signatureMove(sp: MonsterData): Move {
  return {
    id: `sig_${sp.id}`,
    name: sp.sig,
    type: sp.type,
    category: 'spec',
    power: 85,
    acc: 0.9,
    desc: 'この幻獣の代名詞となる必殺技。',
  }
}

/** レベルに応じた技セット(最大4)。低Lvは2技、育つと状態異常・別タイプ技を覚える。 */
export function getMoveset(sp: MonsterData, level: number): Move[] {
  const t1 = sp.type
  const kit1 = TYPE_KIT[t1]
  const moves: Move[] = [signatureMove(sp), kit1.basic]
  if (level >= 8) moves.push(kit1.tech)
  if (level >= 12) {
    const t2 = sp.type2
    moves.push(t2 && TYPE_KIT[t2] ? TYPE_KIT[t2].blast : kit1.blast)
  }
  return moves
}
