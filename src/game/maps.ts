// フィールドマップとトレーナー定義
// グリッド文字:
//   '#'=木/壁(進入不可)  'H'=建物(進入不可)  'W'=水(進入不可)
//   '.'=道/床(歩行可)    ','=芝生(歩行可・装飾)  'G'=高草(歩行可・エンカウント)
//   'F'=花(歩行可・装飾)  '~'=砂浜(歩行可)
// 広大マップ＋カメラ追従。画面に映るのは一部だけで、移動でスクロールする。
import type { TrainerData } from '../types'
import monstersJson from '../../data/monsters.json'

// 図鑑から、指定タイプ・進化段階の幻獣idを集める(野生出現プール生成用)
const ALL_DEX = monstersJson.dex as { id: string; type: string; type2?: string; stage: number; dex: number }[]
function wildOfTypes(types: string[], maxStage = 1, opts: { genOnly?: boolean } = {}): string[] {
  return ALL_DEX.filter(
    (d) =>
      (!opts.genOnly || d.dex >= 101) && // 生成幻獣(dex101-300)に限定するか
      d.stage <= maxStage && // 野生は若い個体(序盤は1段階目)
      (types.includes(d.type) || (d.type2 != null && types.includes(d.type2))),
  ).map((d) => d.id)
}

export type NpcKind = 'mentor' | 'mom' | 'inn' | 'sign' | 'villager' | 'shop' | 'alchemist' | 'portal' | 'storage' | 'records'
export interface Npc {
  x: number
  y: number
  kind: NpcKind
  name: string
  emoji?: string // 画像が無い場合の表示(種別既定を上書き)
  lines?: string[] // villager/sign 用の台詞
  sprite?: string // フィールドの歩きキャラ画像 ui/<sprite>.png (kind既定を上書き)
  portrait?: string // 会話の立ち絵 portraits/<portrait>.png
}

// マップ上の小物(家具・装飾)。solid=通行不可、lines=調べると台詞
export interface Prop {
  x: number
  y: number
  kind: string // bed/bookshelf/cauldron/fountain/barrel/fence... (ui/prop_<kind>.png or 絵文字)
  solid?: boolean
  lines?: string[]
  name?: string
  emoji?: string
}

// ── アンビエント(装飾の動く要素) ── ※描画はField側(Codex)。ゲームロジックには非干渉・当たり判定なし。
// Codexの実装契約: area(タイル矩形)内に count 体を出し、style に従って動かす。
//   roam = 地上をゆっくり徘徊(area内をランダム/往復) / fly = areaを横断して飛ぶ(ループ) / flit = その場でふわふわ漂う
//   表示は ui/ambient_<kind>.png があれば画像、無ければ emoji。speed は相対(小さいほど遅い)。prefers-reduced-motion で停止が親切。
export interface Ambient {
  kind: string // 'bird' | 'butterfly' | 'cat' | 'gull' など(Codexが絵に対応付け)
  emoji?: string // 画像が無い時のフォールバック表示
  style: 'roam' | 'fly' | 'flit'
  area: { x: number; y: number; w: number; h: number } // 出現・移動範囲(タイル)
  count?: number // 同種の数(既定1)
  speed?: number // 相対速度(既定1)
}

// 宝箱。開けると item を amount 個入手。開封状態は flag 'chest_<id>' で保存
export interface Chest {
  x: number
  y: number
  id: string
  item: 'heal' | 'heal2' | 'flask' | 'money'
  amount: number
}

export interface GameMap {
  id: string
  name: string
  biome: string // バトル背景の地形キー (public/bg/battle/<biome>.jpg)
  grid: string[]
  // gate:'starter' のワープは御三家入手まで通れない
  warps: { x: number; y: number; to: string; tx: number; ty: number; gate?: string }[]
  leader?: { x: number; y: number; trainerId: string }
  encounter?: { pool: string[]; min: number; max: number }
  npcs?: Npc[]
  props?: Prop[]
  buildings?: { x: number; y: number; w: number; h: number; kind: string }[] // 立体の家(footprintは'H'で進入不可)
  chests?: Chest[]
  ambient?: Ambient[] // 装飾の動く要素(Field側で描画・Codex)
  indoor?: boolean // 室内(床・壁の見た目)
  intro?: string
}

// ── 世界(ワープ先)定義 ──
// 本拠地ラピス村の転送門から各世界へワープ。ボスを倒すとクリア、unlock記章で解放。
export interface World {
  id: string
  name: string
  icon: string // 一覧表示の絵文字
  mapId: string // 入口マップ
  tx: number
  ty: number // 入口座標
  boss: string // クリア判定に使うトレーナーid(TRAINERS)
  unlock: string | null // 解放に必要な記章(nullなら最初から)
  desc: string
}
export const WORLDS: World[] = [
  { id: 'forest', name: '緑霧の森', icon: '🌲', mapId: 'forest', tx: 17, ty: 39, boss: 'gym_forest', unlock: null, desc: '霧立ちこめる迷いの森。守護者シルヴァが待つ、最初の世界。' },
  { id: 'sea', name: '潮鳴りの海', icon: '🌊', mapId: 'coast_road', tx: 2, ty: 6, boss: 'gym_port', unlock: '新緑の記章', desc: '潮騒の道から港町へ。守護者マレアが灰の渦を睨む。' },
]

// ── マップ生成ヘルパー(座標ズレ防止) ──
function grid(w: number, h: number, fill = '.'): string[] {
  return Array.from({ length: h }, () => fill.repeat(w))
}
function set(g: string[], x: number, y: number, ch: string): void {
  if (y < 0 || y >= g.length) return
  const row = g[y]
  if (x < 0 || x >= row.length) return
  g[y] = row.slice(0, x) + ch + row.slice(x + 1)
}
function fill(g: string[], x0: number, y0: number, x1: number, y1: number, ch: string): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(g, x, y, ch)
}
function frame(g: string[], ch = '#'): void {
  const h = g.length
  const w = g[0].length
  for (let x = 0; x < w; x++) {
    set(g, x, 0, ch)
    set(g, x, h - 1, ch)
  }
  for (let y = 0; y < h; y++) {
    set(g, 0, y, ch)
    set(g, w - 1, y, ch)
  }
}

// 室内(壁で囲んだ床)。下壁の doorX に出入口を開ける
function room(w: number, h: number, doorX: number): string[] {
  const g = grid(w, h, '.')
  frame(g, '#')
  set(g, doorX, h - 1, '.')
  return g
}

// 始まりの村ラピス(34x26) 広い芝生に石畳の十字路・家3軒・道具屋・南に森への門
function buildRapis(): string[] {
  const g = grid(34, 26, ',')
  frame(g, '#')
  fill(g, 2, 13, 31, 13, '.') // 横の大通り
  fill(g, 17, 1, 17, 24, '.') // 縦の大通り(南門まで)
  // 家3軒(ブロック＋扉＋小道)
  fill(g, 6, 6, 8, 7, 'H')
  fill(g, 7, 8, 7, 13, '.') // わが家(左)＋扉小道
  fill(g, 16, 4, 18, 5, 'H')
  set(g, 17, 6, '.') // 師の家(中央・縦通り上)
  fill(g, 25, 7, 27, 8, 'H')
  fill(g, 26, 9, 26, 13, '.') // 宿屋(右)＋扉小道
  // 道具屋の露店
  fill(g, 20, 15, 22, 16, 'H')
  // モブ民家(進入不可・扉なしの背景建物)で町並みを賑やかに
  fill(g, 3, 4, 4, 4, 'H') // 民家A(北西)
  fill(g, 11, 4, 12, 4, 'H') // 民家B(北・中央左)
  fill(g, 21, 3, 22, 3, 'H') // 民家C(北・中央右)
  fill(g, 29, 3, 30, 3, 'H') // 民家D(北東)
  fill(g, 3, 19, 4, 19, 'H') // 民家E(南西)
  // 花壇の装飾
  ;[[10, 9], [12, 6], [29, 11], [5, 18], [30, 20], [24, 19], [12, 21], [4, 9]].forEach(([x, y]) => set(g, x, y, 'F'))
  // 南の門(森へ)
  set(g, 17, 24, '.')
  return g
}

// 緑霧の森(34x42) 密林を蛇行する長い迷路。南の入口から6本の横廊下を折り返しながら最奥の守護者へ。
// 横廊下に沿って草地6部屋(G=エンカウント)が口を開け、東端で潮騒の道へ抜ける。
// 連結はサーペンタイン(一本道の折り返し)で担保。袋小路に宝箱。solid小物は草地内のみ(通路は塞がない)。
function buildForest(): string[] {
  const g = grid(34, 42, '#') // 一面の密林(木)
  // ── 南の入口(3マス幅・最下段まで開口) ──
  fill(g, 16, 38, 18, 41, '.')
  // ── サーペンタイン本道(下→上へ折り返し) ──
  fill(g, 4, 39, 17, 39, '.') // 廊下1(入口から西へ)
  fill(g, 4, 33, 4, 39, '.') // 西端を上へ
  fill(g, 4, 33, 29, 33, '.') // 廊下2(東へ)
  fill(g, 29, 27, 29, 33, '.') // 東端を上へ
  fill(g, 4, 27, 29, 27, '.') // 廊下3(西へ)
  fill(g, 4, 21, 4, 27, '.') // 西端を上へ
  fill(g, 4, 21, 29, 21, '.') // 廊下4(東へ)
  fill(g, 29, 15, 29, 21, '.') // 東端を上へ
  fill(g, 4, 15, 32, 15, '.') // 廊下5(東の(32,15)=潮騒の道へ抜ける)
  fill(g, 4, 9, 4, 15, '.') // 西端を上へ
  fill(g, 4, 9, 24, 9, '.') // 廊下6(東へ)
  fill(g, 16, 4, 16, 9, '.') // 中央を上へ→広間
  fill(g, 12, 2, 21, 6, '.') // 守護者の広間(leader 17,3)
  // ── 草地6部屋(各横廊下に口を開け接続。Gの行に通路行を含めて連結) ──
  fill(g, 7, 30, 12, 33, 'G') // 草地A(廊下2)
  fill(g, 20, 33, 26, 36, 'G') // 草地B(廊下2)
  fill(g, 8, 24, 14, 27, 'G') // 草地C(廊下3)
  fill(g, 18, 18, 24, 21, 'G') // 草地D(廊下4)
  fill(g, 24, 12, 30, 16, 'G') // 草地E(廊下5・東の出口そば)
  fill(g, 8, 9, 14, 12, 'G') // 草地F(廊下6)
  // ── 袋小路(宝箱用) ──
  fill(g, 1, 33, 4, 36, '.') // 北西寄りの袋小路(廊下2の西端から)
  return g
}

// 潮騒の道(22x12) 海沿いの砂浜。葦(高草)で水辺の幻獣が出る
function buildCoast(): string[] {
  const g = grid(22, 12, '~')
  frame(g, '#')
  fill(g, 1, 1, 20, 2, 'W') // 北は海
  fill(g, 4, 5, 9, 8, 'G')
  fill(g, 12, 5, 17, 8, 'G')
  fill(g, 1, 6, 20, 6, '~') // 砂の小道(横)
  return g
}

// 潮鳴りの港町(24x16) 石畳の港町。北に守護者、南東に停泊する船(水)
function buildPort(): string[] {
  const g = grid(24, 16, ',')
  frame(g, '#')
  fill(g, 1, 8, 22, 8, '.') // 大通り(横)
  fill(g, 12, 2, 12, 13, '.') // 大通り(縦)
  fill(g, 15, 12, 22, 14, 'W') // 港の水面
  fill(g, 5, 4, 7, 5, 'H')
  fill(g, 16, 4, 18, 5, 'H')
  ;[[3, 10], [9, 11], [20, 6]].forEach(([x, y]) => set(g, x, y, 'F'))
  set(g, 1, 8, '.') // 西の出口
  return g
}

export const MAPS: Record<string, GameMap> = {
  rapis: {
    id: 'rapis',
    name: '始まりの村ラピス',
    biome: 'town',
    grid: buildRapis(),
    warps: [
      // 森へは徒歩でなく中央広場の転送門からワープ(App側で世界選択)
      { x: 17, y: 6, to: 'mentor_house', tx: 5, ty: 7 }, // 中央=師の家
      { x: 7, y: 8, to: 'home', tx: 5, ty: 6 }, // 左=わが家
      { x: 26, y: 9, to: 'inn', tx: 5, ty: 7 }, // 右=宿屋
      { x: 21, y: 17, to: 'shop', tx: 4, ty: 5 }, // 道具屋(店内へ)
    ],
    npcs: [
      {
        x: 24,
        y: 13,
        kind: 'villager',
        name: '老人モーリス',
        emoji: '👴',
        sprite: 'npc_morris',
        portrait: 'morris',
        lines: [
          'わしも昔は錬獣師でな……。だが近頃の"灰化"は、わしらの知る災いとは違う。',
          '色を失い、心まで失って暴れ出す。あれは……誰かが、作り出しているものだ。',
        ],
      },
      {
        x: 11,
        y: 17,
        kind: 'villager',
        name: '子供ティナ',
        emoji: '🧒',
        sprite: 'npc_tina',
        portrait: 'tina',
        lines: ['ねえねえ、幻獣つれてるの！？ いいなあ！ あたしも錬獣師になるんだ！', '強くなったら、また見せてね。約束だよ！'],
      },
      // ── 転送門(本拠地ハブ): 調べると世界選択(App側で処理) ──
      { x: 17, y: 20, kind: 'portal', name: '転送門', emoji: '🌀' },
      // ── 預かり所: 調べるとメニュー(手持ち/編成)へ ──
      { x: 20, y: 18, kind: 'storage', name: '預かり所の管理人', emoji: '📦' },
      // ── 記録の間: 調べるとプロフィール/戦績(記録タブ)へ ──
      { x: 24, y: 18, kind: 'records', name: '記録係エイダ', emoji: '📜' },
      // ── 村人(拡充): 世界観・ヒント・人々の暮らし ──
      {
        x: 8, y: 21, kind: 'villager', name: '行商人ドラン', emoji: '🧳', sprite: 'npc_peddler', portrait: 'peddler',
        lines: ['よう、錬獣師さん。あちこちの世界を渡り歩いて 商売してるのさ。', '転送門が開けば 行ける土地も増える。記章を集めることだな。', '……どの世界も、灰化のせいで景気は さっぱりだがね。'],
      },
      {
        x: 5, y: 16, kind: 'villager', name: '花売りのノラ', emoji: '💐', sprite: 'npc_flowergirl', portrait: 'flowergirl',
        lines: ['お花、いかが？ 緑霧の森で摘んできたの。', 'あなたの幻獣さんにも、元気が移るといいな！'],
      },
      {
        x: 30, y: 17, kind: 'villager', name: '司書エルマ', emoji: '📚', sprite: 'npc_scholar', portrait: 'scholar',
        lines: ['この大陸の空には《エーテル》が満ちている。幻獣はそれが象を結んだ姿よ。', '錬成――幻獣を掛け合わせる術も、元をたどれば賢者の石の研究から生まれたの。', '知りたいことがあれば、いつでもおいで。'],
      },
      {
        x: 22, y: 22, kind: 'villager', name: '老婆ハーゼル', emoji: '👵', sprite: 'npc_oldwoman', portrait: 'oldwoman',
        lines: ['灰化はねえ……ただの病じゃない。色を奪い、心まで奪っていく。', '昔の言い伝えでは、灰は"満たされぬ願い"から生まれるという。', '気をつけて行きなされ、若いの。'],
      },
      {
        x: 14, y: 22, kind: 'villager', name: '門番ゴルド', emoji: '💂', sprite: 'npc_guard', portrait: 'guard',
        lines: ['村の守りは おれの仕事だ。安心して旅立ちな。', 'そこの転送門から、各地の世界へ跳べる。まずは緑霧の森だ。'],
      },
      {
        x: 30, y: 6, kind: 'villager', name: '吟遊詩人リコ', emoji: '🎻', sprite: 'npc_bard', portrait: 'bard',
        lines: ['♪ 八つの記章を集めし者 ―― 灰の王と相見えん……', 'おっと、これは古い詩さ。だが、あながち作り話でもないらしいぜ。'],
      },
      // ── 遊び心: 看板猫・番犬・かくれんぼっ子 ──
      { x: 15, y: 12, kind: 'villager', name: '看板猫ミケ', emoji: '🐈', lines: ['ニャ〜ン。（撫でてほしそうに すり寄ってきた）', '（喉を ゴロゴロ鳴らしている。なんだか 幸運が 舞い込みそうだ。）'] },
      { x: 28, y: 12, kind: 'villager', name: '番犬ロッキー', emoji: '🐕', lines: ['ワンッ！ ……君は 悪いやつじゃ なさそうだ、と 尻尾を 振っている。', 'グルル……灰化した幻獣の匂いには、めっぽう 敏感らしい。'] },
      { x: 31, y: 5, kind: 'villager', name: '？？？', emoji: '🧒', lines: ['しーっ！ いま かくれんぼ中なんだ。', '鬼に 見つかっちゃうから……あっち 行ってて！'] },
    ],
    buildings: [
      { x: 6, y: 6, w: 3, h: 2, kind: 'home' }, // わが家(左)
      { x: 16, y: 4, w: 3, h: 2, kind: 'mentor' }, // 師の家(中央)
      { x: 25, y: 7, w: 3, h: 2, kind: 'inn' }, // 宿屋(右)
      { x: 20, y: 15, w: 3, h: 2, kind: 'shop' }, // 道具屋
      // モブ民家(背景・入れない)
      { x: 3, y: 4, w: 2, h: 1, kind: 'townhouse' },
      { x: 11, y: 4, w: 2, h: 1, kind: 'townhouse' },
      { x: 21, y: 3, w: 2, h: 1, kind: 'townhouse' },
      { x: 29, y: 3, w: 2, h: 1, kind: 'townhouse' },
      { x: 3, y: 19, w: 2, h: 1, kind: 'townhouse' },
    ],
    props: [
      // ── 噴水広場(中央) ──
      { x: 14, y: 15, kind: 'fountain', solid: true, name: '噴水', lines: ['村の古い噴水。水面に錬金術の紋章が彫られている。'] },
      { x: 12, y: 14, kind: 'flower' }, { x: 16, y: 14, kind: 'flower' }, { x: 12, y: 16, kind: 'flower' }, { x: 16, y: 16, kind: 'flower' }, // 噴水を囲む花壇
      { x: 13, y: 17, kind: 'plant', solid: true }, { x: 15, y: 17, kind: 'plant', solid: true }, // 広場の植え込み
      { x: 12, y: 17, kind: 'lamp', solid: true }, { x: 16, y: 17, kind: 'lamp', solid: true }, // 広場灯
      { x: 13, y: 12, kind: 'sign', name: '立て札', lines: ['「ようこそ、始まりの村ラピスへ。」'] },
      // ── わが家の前庭(西・扉7,8) ──
      { x: 5, y: 8, kind: 'flower' }, { x: 6, y: 8, kind: 'flower' }, { x: 8, y: 8, kind: 'flower' }, { x: 9, y: 8, kind: 'flower' }, // 玄関脇の花壇
      { x: 4, y: 8, kind: 'fence', solid: true }, { x: 4, y: 9, kind: 'fence', solid: true }, { x: 4, y: 10, kind: 'fence', solid: true }, { x: 5, y: 10, kind: 'fence', solid: true }, { x: 6, y: 10, kind: 'fence', solid: true }, // 庭の柵
      { x: 5, y: 9, kind: 'flower' }, { x: 6, y: 9, kind: 'flower' }, // 庭の中
      { x: 9, y: 9, kind: 'barrel', solid: true }, { x: 10, y: 8, kind: 'plant', solid: true }, // 雨水樽・生垣
      // ── 師の家の前(中央北・扉17,6) ──
      { x: 14, y: 4, kind: 'plant', solid: true }, { x: 20, y: 4, kind: 'plant', solid: true }, // 家を囲む木
      { x: 15, y: 6, kind: 'lamp', solid: true }, { x: 19, y: 6, kind: 'lamp', solid: true }, // 玄関灯(扉を挟む)
      { x: 15, y: 5, kind: 'flower' }, { x: 19, y: 5, kind: 'flower' },
      // ── 宿屋の前(東・扉26,9) ──
      { x: 24, y: 8, kind: 'sign', name: '看板', lines: ['「ラピスの宿屋 — 一泊で幻獣も元気に」'] },
      { x: 24, y: 9, kind: 'lamp', solid: true }, { x: 28, y: 9, kind: 'lamp', solid: true }, // 玄関灯
      { x: 24, y: 10, kind: 'flower' }, { x: 28, y: 10, kind: 'flower' },
      { x: 29, y: 9, kind: 'barrel', solid: true }, { x: 29, y: 10, kind: 'barrel', solid: true }, { x: 29, y: 11, kind: 'crate', solid: true }, // 酒樽
      // ── 市場(道具屋20-22,15-16 / ラル21,17) ──
      { x: 18, y: 16, kind: 'sign', name: '看板', lines: ['「道具屋ラル — 傷薬・封獣フラスコ あります」'] },
      { x: 19, y: 15, kind: 'crate', solid: true }, { x: 19, y: 16, kind: 'barrel', solid: true }, // 陳列(左)
      { x: 23, y: 15, kind: 'barrel', solid: true }, { x: 23, y: 16, kind: 'crate', solid: true }, // 陳列(右)
      { x: 24, y: 16, kind: 'barrel', solid: true }, { x: 19, y: 17, kind: 'crate', solid: true }, // 在庫
      { x: 22, y: 18, kind: 'barrel', solid: true }, { x: 23, y: 18, kind: 'crate', solid: true },
      // ── 街路灯(縦の大通りを等間隔で挟む) ──
      { x: 16, y: 9, kind: 'lamp', solid: true }, { x: 18, y: 9, kind: 'lamp', solid: true },
      { x: 16, y: 20, kind: 'lamp', solid: true }, { x: 18, y: 20, kind: 'lamp', solid: true },
      // ── 街路灯(横の大通りを挟む) ──
      { x: 9, y: 12, kind: 'lamp', solid: true }, { x: 9, y: 14, kind: 'lamp', solid: true }, { x: 29, y: 14, kind: 'lamp', solid: true },
      // ── 沿道の花(リズム) ──
      { x: 16, y: 11, kind: 'flower' }, { x: 18, y: 11, kind: 'flower' }, { x: 16, y: 22, kind: 'flower' }, { x: 18, y: 22, kind: 'flower' },
      // ── 町外周の生垣 ──
      { x: 2, y: 2, kind: 'plant', solid: true }, { x: 31, y: 2, kind: 'plant', solid: true },
      { x: 2, y: 12, kind: 'plant', solid: true }, { x: 31, y: 12, kind: 'plant', solid: true },
      { x: 2, y: 24, kind: 'plant', solid: true }, { x: 8, y: 24, kind: 'plant', solid: true }, { x: 28, y: 24, kind: 'plant', solid: true },
      // ── 転送門の案内板(中央広場) ──
      { x: 15, y: 20, kind: 'sign', name: '立て札', lines: ['「中央の転送門に触れれば、各地の世界へ跳べる。」', '「記章を集めるほど、新たな世界が開かれる。」'] },
      // ── 遊び心の小物 ──
      { x: 10, y: 20, kind: 'sign', emoji: '🌾', name: 'かかし', lines: ['畑のかかし。なぜか 錬獣師のローブを 着せられている。', '……どこかの 子供の イタズラだろうか。'] },
      { x: 16, y: 12, kind: 'sign', name: '張り紙', lines: ['「ねこ さがしています。みつけたら 噴水前まで。 ―ミケの飼い主」', '（……張り紙の すぐ横で、当の猫が のんびり 寝ている。）'] },
      { x: 12, y: 20, kind: 'barrel', solid: true, name: '古い樽', lines: ['樽の中を のぞいてみた。……空っぽだ。', 'いや、底に 古いゲル硬貨が 1枚 こびりついている。（もったいないので そのままにした）'] },
      { x: 5, y: 4, kind: 'sign', name: '古い石碑', lines: ['苔むした石碑。「ラピス建村 ―― 賢者ここに 幻獣と憩いし地」', '……最後の一行は 削られていて 読めない。'] },
    ],
    chests: [
      { x: 31, y: 22, id: 'rapis_corner', item: 'heal', amount: 2 }, // 村の隅
      { x: 3, y: 5, id: 'rapis_garden', item: 'money', amount: 150 }, // 家の脇
      { x: 2, y: 20, id: 'rapis_hidden', item: 'flask', amount: 2 }, // 民家Eの裏の隠し宝箱
      { x: 31, y: 24, id: 'rapis_corner2', item: 'heal2', amount: 1 }, // 南東の隅の隠し宝箱
    ],
    ambient: [
      { kind: 'bird', emoji: '🐦', style: 'fly', area: { x: 1, y: 1, w: 32, h: 9 }, count: 3, speed: 1.2 }, // 上空を横切る小鳥
      { kind: 'butterfly', emoji: '🦋', style: 'flit', area: { x: 11, y: 13, w: 8, h: 6 }, count: 2 }, // 噴水広場の蝶
      { kind: 'cat', emoji: '🐈', style: 'roam', area: { x: 26, y: 19, w: 5, h: 4 }, count: 1, speed: 0.6 }, // 南東を歩く野良猫(看板猫ミケとは別)
    ],
    intro: '錬金工房が並ぶ静かな村。ここがあなたの本拠地。中央広場の転送門から、各地の世界へ旅立とう。',
  },
  mentor_house: {
    id: 'mentor_house',
    name: '師ガレンの家',
    biome: 'town',
    indoor: true,
    grid: room(11, 9, 5),
    warps: [{ x: 5, y: 8, to: 'rapis', tx: 17, ty: 7 }],
    npcs: [
      { x: 5, y: 2, kind: 'mentor', name: '師ガレン' },
      { x: 2, y: 5, kind: 'alchemist', name: '錬成師ミルカ', emoji: '🧑‍🔬', sprite: 'npc_mirka' }, // 錬成釜のそば
    ],
    props: [
      // 壁の装飾
      { x: 2, y: 0, kind: 'window' }, { x: 8, y: 0, kind: 'painting' }, { x: 6, y: 0, kind: 'clock' },
      // 蔵書(左右の本棚)
      { x: 1, y: 1, kind: 'bookshelf', solid: true, name: '蔵書', lines: ['錬金術の古い写本がぎっしりだ。読めない記号が並んでいる。'] },
      { x: 2, y: 1, kind: 'bookshelf', solid: true, name: '蔵書', lines: ['「賢者の石」について記された頁に、栞がはさまれている……。'] },
      { x: 8, y: 1, kind: 'bookshelf', solid: true, name: '蔵書', lines: ['幻獣図鑑の初版。曰く「幻獣の強さは、共に過ごした時間に比例する」。'] }, { x: 9, y: 1, kind: 'bookshelf', solid: true, name: '蔵書', lines: ['錬成の手引き。「同じ種でも、才能(レア度)の高い個体ほど良い結果になる」とある。'] },
      // 錬成工房(左)
      { x: 1, y: 6, kind: 'cauldron', solid: true, name: '錬成釜', lines: ['師の錬成釜。底に、虹色の残滓がこびりついている。'] },
      { x: 2, y: 6, kind: 'pot', solid: true },
      { x: 1, y: 3, kind: 'shelf', solid: true, name: '薬棚', lines: ['色とりどりの薬瓶と乾いた薬草が並ぶ。'] },
      // 書斎(右)
      { x: 8, y: 5, kind: 'table', solid: true }, { x: 8, y: 6, kind: 'chair', solid: true },
      { x: 9, y: 5, kind: 'candle', solid: true }, { x: 9, y: 3, kind: 'vase', solid: true },
      // 中央・緑
      { x: 5, y: 5, kind: 'rug' }, { x: 9, y: 7, kind: 'plant', solid: true },
    ],
    intro: '錬金道具と古びた書物が並ぶ、広い師の家。',
  },
  home: {
    id: 'home',
    name: 'わが家',
    biome: 'town',
    indoor: true,
    grid: room(9, 8, 5),
    warps: [
      { x: 5, y: 7, to: 'rapis', tx: 7, ty: 9 },
      { x: 7, y: 1, to: 'home2f', tx: 4, ty: 6 }, // 階段(上)
    ],
    npcs: [{ x: 3, y: 2, kind: 'mom', name: 'おかあさん' }],
    props: [
      // 壁
      { x: 2, y: 0, kind: 'window', name: '窓', lines: ['窓の外に、村の朝。鳥が一羽、屋根から飛び立っていった。'] }, { x: 6, y: 0, kind: 'painting', name: '絵', lines: ['家族の肖像画。幼い自分が、母に手をひかれて笑っている。'] }, { x: 4, y: 0, kind: 'clock' },
      // 台所(左)
      { x: 1, y: 1, kind: 'stove', solid: true, name: 'かまど', lines: ['母の鍋から いい匂い。「味見は あとでね」と 言われた気がした。'] }, { x: 2, y: 1, kind: 'shelf', solid: true, name: '食器棚', lines: ['お気に入りのスープ皿。欠けた縁も、なんだか愛おしい。'] },
      { x: 1, y: 2, kind: 'pot', solid: true }, { x: 1, y: 4, kind: 'vase', solid: true },
      // 食卓(中央)
      { x: 4, y: 4, kind: 'table', solid: true }, { x: 3, y: 4, kind: 'chair', solid: true }, { x: 4, y: 5, kind: 'chair', solid: true },
      // 暖炉のある居間(右)
      { x: 7, y: 3, kind: 'fireplace', solid: true, name: '暖炉', lines: ['ぱちぱちと薪がはぜている。あたたかい。', '薪箱の底で、何かが きらりと光った……。'] },
      { x: 6, y: 4, kind: 'rug' }, { x: 7, y: 5, kind: 'plant', solid: true },
      // 玄関マット
      { x: 5, y: 6, kind: 'rug' },
    ],
    chests: [{ x: 6, y: 3, id: 'home_hearth', item: 'money', amount: 80 }], // 暖炉そばの薪箱(発見)
    intro: 'あたたかな わが家。奥の階段を上ると自分の部屋がある。',
  },
  home2f: {
    id: 'home2f',
    name: 'わが家・2階',
    biome: 'town',
    indoor: true,
    grid: room(9, 8, 5),
    warps: [{ x: 5, y: 7, to: 'home', tx: 7, ty: 2 }], // 階段(下)
    props: [
      // 壁
      { x: 5, y: 0, kind: 'window', name: '窓', lines: ['朝の光がまぶしい。空の向こうに、まだ見ぬ世界が広がっている。'] }, { x: 3, y: 0, kind: 'painting' }, { x: 7, y: 0, kind: 'clock' },
      // 寝床(左)
      { x: 1, y: 1, kind: 'bed', solid: true, name: 'ベッド', lines: ['よく眠った。……今日から、旅が始まる。', 'ベッドの下に、子供の頃 隠した宝箱が ある気がする。'] },
      { x: 2, y: 2, kind: 'rug' }, { x: 1, y: 5, kind: 'plant', solid: true },
      // 学習机(右)
      { x: 7, y: 1, kind: 'bookshelf', solid: true, name: '本棚', lines: ['古い幻獣図鑑。いつか、自分の見つけた幻獣を ここに書き足すんだ。', '巻末の落書き――幼い自分が描いた"最強のモンスター"。今見ると、ちょっと恥ずかしい。'] },
      { x: 6, y: 2, kind: 'table', solid: true }, { x: 6, y: 3, kind: 'chair', solid: true },
      { x: 7, y: 5, kind: 'vase', solid: true },
      // 中央
      { x: 4, y: 4, kind: 'rug' },
    ],
    chests: [{ x: 1, y: 2, id: 'home2f_keepsake', item: 'flask', amount: 2 }], // ベッド下の隠し宝箱(子供の頃の宝物)
    intro: '自分の部屋。窓から朝の光が差し込んでいる。',
  },
  inn: {
    id: 'inn',
    name: 'ラピスの宿屋',
    biome: 'town',
    indoor: true,
    grid: room(11, 9, 5),
    warps: [{ x: 5, y: 8, to: 'rapis', tx: 26, ty: 10 }],
    npcs: [{ x: 8, y: 6, kind: 'inn', name: '宿屋の主人' }], // 右下の受付に
    props: [
      // 壁
      { x: 3, y: 0, kind: 'window' }, { x: 7, y: 0, kind: 'window' }, { x: 5, y: 0, kind: 'clock' },
      // 客室のベッド(上の四隅)
      { x: 1, y: 1, kind: 'bed', solid: true }, { x: 2, y: 1, kind: 'bed', solid: true, name: '客室のベッド', lines: ['ふかふかのベッド。受付で頼めば、幻獣ともども ぐっすり休めるそうだ。'] },
      { x: 8, y: 1, kind: 'bed', solid: true }, { x: 9, y: 1, kind: 'bed', solid: true },
      // 受付カウンター(右下・主人を机で囲む。手前(8,7)から話しかける)
      { x: 7, y: 5, kind: 'table', solid: true }, { x: 8, y: 5, kind: 'table', solid: true }, { x: 9, y: 5, kind: 'table', solid: true },
      { x: 7, y: 6, kind: 'table', solid: true }, { x: 9, y: 6, kind: 'shelf', solid: true, name: '宿帳棚' },
      // 暖炉のある休憩スペース(左下)
      { x: 1, y: 6, kind: 'fireplace', solid: true, name: '暖炉', lines: ['旅人たちが暖を取っている。'] },
      { x: 2, y: 6, kind: 'rug' }, { x: 1, y: 3, kind: 'shelf', solid: true, name: '酒棚', lines: ['各地の地酒がずらり。「灰の渦が晴れたら、また港の酒が入るんだがね」と主人。'] }, { x: 1, y: 4, kind: 'barrel', solid: true },
      { x: 3, y: 5, kind: 'plant', solid: true }, { x: 5, y: 5, kind: 'rug' },
    ],
    intro: '暖炉のぬくもりが心地よい広い宿屋。受付は右奥。',
  },
  shop: {
    id: 'shop',
    name: '道具屋',
    biome: 'town',
    indoor: true,
    grid: room(9, 7, 4),
    warps: [{ x: 4, y: 6, to: 'rapis', tx: 21, ty: 18 }],
    npcs: [{ x: 4, y: 2, kind: 'shop', name: '道具屋のラル', emoji: '🧑‍💼', sprite: 'npc_laru' }],
    props: [
      // 長机のカウンター(店主を挟む)
      { x: 2, y: 2, kind: 'table', solid: true }, { x: 3, y: 2, kind: 'table', solid: true },
      { x: 5, y: 2, kind: 'table', solid: true }, { x: 6, y: 2, kind: 'table', solid: true },
      // カウンター奥の品物
      { x: 1, y: 1, kind: 'shelf', solid: true }, { x: 2, y: 1, kind: 'barrel', solid: true },
      { x: 4, y: 1, kind: 'pot', solid: true }, { x: 6, y: 1, kind: 'crate', solid: true }, { x: 7, y: 1, kind: 'shelf', solid: true },
      // 装飾・店内の在庫
      { x: 4, y: 0, kind: 'sign', name: '看板', lines: ['「道具屋ラル ―― 旅の必需品、そろえてます」'] },
      { x: 1, y: 5, kind: 'barrel', solid: true }, { x: 7, y: 5, kind: 'crate', solid: true },
      { x: 1, y: 4, kind: 'plant', solid: true },
    ],
    intro: '所狭しと道具が並ぶ店。長机の奥に店主が立っている。',
  },
  forest: {
    id: 'forest',
    name: '緑霧の森',
    biome: 'forest',
    grid: buildForest(),
    warps: [
      { x: 17, y: 41, to: 'rapis', tx: 17, ty: 22 }, // 南=本拠地へ帰還(転送門の近く)
    ],
    leader: { x: 17, y: 3, trainerId: 'gym_forest' },
    encounter: {
      // 固有8(アート完成・森向き) ＋ 生成種は地/毒/風から2体だけ＝計10種に厳選。火/雷は後の世界へ
      pool: [
        'portabupa', 'venomite', 'sporin', 'hobgobalt', 'tsunousa', 'falcone', 'briezel', 'pibit',
        ...wildOfTypes(['地', '毒', '風'], 1, { genOnly: true }).slice(0, 2),
      ],
      min: 4,
      max: 8,
    },
    props: [
      // 道しるべ(入口)
      { x: 18, y: 38, kind: 'sign', name: '道しるべ', lines: ['「奥へ進むほど 道は折り返し 入り組む。守護者は 最奥の広間に。」', '「南へ戻れば 本拠地ラピス村へ 帰れる。」'] },
      // 草地A(7-12,30-33) 廊下は row33
      { x: 8, y: 31, kind: 'mushroom' }, { x: 10, y: 30, kind: 'flower' }, { x: 11, y: 31, kind: 'rock', solid: true },
      // 草地B(20-26,33-36) 廊下は row33
      { x: 22, y: 35, kind: 'mushroom' }, { x: 24, y: 34, kind: 'flower' }, { x: 23, y: 35, kind: 'log', solid: true },
      // 草地C(8-14,24-27) 廊下は row27
      { x: 10, y: 25, kind: 'mushroom' }, { x: 12, y: 26, kind: 'flower' }, { x: 13, y: 25, kind: 'rock', solid: true },
      // 草地D(18-24,18-21) 廊下は row21
      { x: 20, y: 19, kind: 'mushroom' }, { x: 22, y: 20, kind: 'flower' }, { x: 21, y: 19, kind: 'log', solid: true },
      // 草地E(24-30,12-16) 廊下は row15・東の出口そば
      { x: 26, y: 14, kind: 'mushroom' }, { x: 28, y: 13, kind: 'flower' }, { x: 27, y: 14, kind: 'rock', solid: true },
      // 草地F(8-14,9-12) 廊下は row9
      { x: 10, y: 11, kind: 'mushroom' }, { x: 13, y: 11, kind: 'flower' },
      // 守護者の広間(12-21,2-6) leader 17,3
      { x: 13, y: 5, kind: 'plant', solid: true }, { x: 20, y: 5, kind: 'plant', solid: true },
      { x: 14, y: 2, kind: 'flower' }, { x: 19, y: 2, kind: 'flower' },
      // 通路沿いの装飾(非ソリッド・折り返しの角)
      { x: 5, y: 36, kind: 'flower' }, { x: 29, y: 30, kind: 'mushroom' }, { x: 5, y: 24, kind: 'flower' },
      { x: 29, y: 18, kind: 'mushroom' }, { x: 5, y: 12, kind: 'flower' }, { x: 17, y: 40, kind: 'mushroom' },
      // 北西の袋小路(1-4,33-36)
      { x: 3, y: 34, kind: 'mushroom' },
    ],
    chests: [
      { x: 2, y: 35, id: 'forest_nw', item: 'heal2', amount: 1 }, // 北西の袋小路
      { x: 25, y: 35, id: 'forest_se', item: 'flask', amount: 2 }, // 草地B
      { x: 29, y: 13, id: 'forest_r4', item: 'money', amount: 300 }, // 草地E(東の出口そば)
      { x: 11, y: 10, id: 'forest_top', item: 'heal', amount: 3 }, // 草地F(最奥手前)
    ],
    ambient: [
      { kind: 'butterfly', emoji: '🦋', style: 'flit', area: { x: 4, y: 9, w: 26, h: 30 }, count: 4 }, // 森を漂う蝶
      { kind: 'bird', emoji: '🐦', style: 'fly', area: { x: 1, y: 2, w: 32, h: 10 }, count: 2, speed: 1.1 }, // 梢を渡る鳥
      { kind: 'firefly', emoji: '✨', style: 'flit', area: { x: 7, y: 30, w: 20, h: 8 }, count: 3, speed: 0.5 }, // 林床の光(蛍/胞子)
    ],
    intro: '霧が立ちこめる森。高草には野生の幻獣がひそむ。奥に錬獣師の気配……。',
  },
  coast_road: {
    id: 'coast_road',
    name: '潮騒の道',
    biome: 'sea',
    grid: buildCoast(),
    warps: [
      { x: 1, y: 6, to: 'rapis', tx: 17, ty: 22 }, // 西=本拠地へ帰還(転送門の近く)
      { x: 20, y: 6, to: 'port', tx: 2, ty: 8 }, // 東=港町へ(海の世界の内部)
    ],
    encounter: {
      // 既定の固有幻獣 ＋ 海辺に合う生成幻獣(水/風/雷の1段階目)
      pool: ['shelk', 'frost', 'aquab', 'teary', 'pibit', 'briezel', ...wildOfTypes(['水', '風', '雷'], 1, { genOnly: true })],
      min: 9,
      max: 13,
    },
    props: [
      { x: 3, y: 9, kind: 'rock', solid: true },
      { x: 18, y: 9, kind: 'rock', solid: true },
      { x: 10, y: 9, kind: 'barrel', solid: true },
      { x: 5, y: 10, kind: 'shell' },
      { x: 15, y: 10, kind: 'shell' },
      // ── 追加 ──
      { x: 8, y: 10, kind: 'shell' }, { x: 12, y: 10, kind: 'shell' }, { x: 2, y: 9, kind: 'shell' },
      { x: 19, y: 10, kind: 'shell' }, { x: 4, y: 9, kind: 'shell' },
      { x: 6, y: 9, kind: 'rock', solid: true }, { x: 16, y: 9, kind: 'rock', solid: true },
      { x: 13, y: 9, kind: 'barrel', solid: true }, { x: 14, y: 9, kind: 'crate', solid: true },
    ],
    ambient: [
      { kind: 'gull', emoji: '🕊️', style: 'fly', area: { x: 1, y: 1, w: 20, h: 5 }, count: 4, speed: 1.3 }, // 海上を舞うカモメ
    ],
    intro: '潮の香りが満ちる海沿いの道。葦のしげみに水辺の幻獣が現れる。',
  },
  port: {
    id: 'port',
    name: '潮鳴りの港町',
    biome: 'sea',
    grid: buildPort(),
    warps: [{ x: 1, y: 8, to: 'coast_road', tx: 19, ty: 6 }], // 西=潮騒の道へ
    leader: { x: 12, y: 2, trainerId: 'gym_port' },
    npcs: [
      {
        x: 8,
        y: 8,
        kind: 'villager',
        name: '船乗り',
        emoji: '🧑‍✈️',
        sprite: 'npc_sailor',
        portrait: 'sailor',
        lines: ['沖に"灰の渦"が出てな……船もまともに出せやしねえ。', '守護者のマレアの姉さんが、なんとかしようと睨みを利かせてるよ。'],
      },
    ],
    buildings: [
      { x: 5, y: 4, w: 3, h: 2, kind: 'home' },
      { x: 16, y: 4, w: 3, h: 2, kind: 'inn' },
    ],
    props: [
      { x: 5, y: 9, kind: 'barrel', solid: true },
      { x: 6, y: 9, kind: 'crate', solid: true },
      { x: 16, y: 9, kind: 'barrel', solid: true },
      { x: 20, y: 11, kind: 'anchor', solid: true, name: '錨', lines: ['大きな船の錨。潮の匂いが染みついている。'] },
      { x: 10, y: 6, kind: 'lamp', solid: true },
      { x: 18, y: 7, kind: 'crate', solid: true },
      { x: 8, y: 9, kind: 'fence', solid: true },
      // ── 追加 ──
      { x: 3, y: 3, kind: 'flower' }, { x: 21, y: 3, kind: 'flower' }, { x: 4, y: 11, kind: 'flower' },
      { x: 10, y: 11, kind: 'flower' }, { x: 20, y: 10, kind: 'flower' },
      { x: 6, y: 10, kind: 'barrel', solid: true }, { x: 5, y: 10, kind: 'crate', solid: true },
      { x: 17, y: 9, kind: 'barrel', solid: true }, { x: 18, y: 9, kind: 'crate', solid: true },
      { x: 4, y: 6, kind: 'lamp', solid: true }, { x: 20, y: 6, kind: 'lamp', solid: true },
      { x: 2, y: 3, kind: 'plant', solid: true }, { x: 22, y: 3, kind: 'plant', solid: true },
      { x: 2, y: 11, kind: 'plant', solid: true }, { x: 22, y: 11, kind: 'plant', solid: true },
    ],
    intro: '船が行き交う潮鳴りの港町。海風の向こう、守護者マレアが待つ。',
  },
}

export const TRAINERS: Record<string, TrainerData> = {
  gym_forest: {
    id: 'gym_forest',
    name: '森の守護者 シルヴァ',
    team: [
      { speciesId: 'sporin', level: 9 },
      { speciesId: 'mandrago', level: 10 },
      { speciesId: 'alraune', level: 12 },
    ],
    badge: '新緑の記章',
    portrait: 'gym_forest',
    preBattle: ['ようこそ、緑霧の森へ。', 'この森も、灰に蝕まれはじめている。……あなたの覚悟、見せて。'],
    postBattle: [
      '見事。あなたの幻獣は、よく育てられているわ。……時間をかけて、ね。',
      '新緑の記章を受け取って。',
      '灰の源は、北から流れてくる。まずは海へ――港の守護者マレアを訪ねなさい。',
    ],
  },
  gym_port: {
    id: 'gym_port',
    name: '港の守護者 マレア',
    team: [
      { speciesId: 'shelk', level: 16 },
      { speciesId: 'aquab', level: 17 },
      { speciesId: 'marinel', level: 19 },
    ],
    badge: '蒼潮の記章',
    portrait: 'gym_port',
    preBattle: ['あたしの海を濁す、灰の渦……。', 'あんたに、立ち向かう度胸はあるかい？'],
    postBattle: [
      'はっ、いい波に乗ってるじゃないか！ 認めるよ。',
      '蒼潮の記章だ、持っていきな。',
      'あたしの船で大陸へ送ってやる。灰の使徒の尻尾、掴んでみせな。',
    ],
  },
}

export const ENCOUNTER_RATE = 0.18

export function isWall(ch: string): boolean {
  return ch === '#' || ch === 'H' || ch === 'W'
}
