# 画像素材 一覧（ChatGPT生成用）

モンスター（`MONSTER_ART_PROMPTS.md`）以外に必要な素材のまとめ。
画風は幻獣と同じ **手描きインク＆水彩の世界観** で統一する。

> ⚠️ ChatGPTは画像内の文字（特に日本語）が崩れる。**ロゴ・ボタン・数値などの文字はコード側（CSS）で表示**し、ChatGPTには「文字なしの絵」だけ作ってもらう。

---

## 必要素材 一覧

| 種別 | 用途 | 必要数 | 形式・サイズ | 配置 | 優先度 |
|------|------|--------|--------------|------|--------|
| **幻獣スプライト** | バトル/図鑑/手持ち | 102（作業中） | 透過PNG・正方形 | `public/sprites/<番号>.png` | 進行中 |
| **バトル背景** | 戦闘画面の背景 | 地形ごと 8〜10 | JPG/PNG・横長(3:2) | `public/bg/battle/<地形>.jpg` | ★P1 |
| **タイトル/キービジュアル** | タイトル画面＋X共有OGP | 1 | JPG・16:9(1200×630) | `public/bg/title.jpg` | ★P1 |
| **フィールドマップ絵** | 探索画面の地面（タイル or 一枚絵） | マップごと | PNG | `public/bg/map/<mapId>.png` | P2 |
| **トレーナー/NPC立ち絵** | ジム支部長・宿敵など | 8＋数体 | 透過PNG・全身 or バストアップ | `public/portraits/<id>.png` | P2 |
| **プレイヤー** | フィールドのコマ／顔 | 1〜2 | 透過PNG | `public/portraits/player.png` | P2 |
| **記章（ジムバッジ）** | 獲得記章のアイコン | 8 | 透過PNG・正方形(小) | `public/ui/badges/<番号>.png` | P3 |
| **属性アイコン** | タイプ表示（現状は文字ピル） | 9 | 透過PNG・正方形(小) | `public/ui/types/<属性>.png` | P3 |
| **状態異常アイコン** | やけど等の表示 | 6 | 透過PNG・正方形(小) | `public/ui/status/<状態>.png` | P3 |
| **アイテムアイコン** | 封獣フラスコ・転成触媒など | 数点 | 透過PNG・正方形 | `public/ui/items/<id>.png` | P3 |
| **装飾フレーム** | カード/モーダルの枠（任意） | 数点 | 透過PNG | `public/ui/frame_*.png` | P3 |

---

## 技術メモ（どう取り込むか）

- **バトル背景**: 現在はCSSのタイプ別グラデーション。地形ごとの一枚絵に差し替える（戦闘発生地点＝マップから地形を渡す）。文字なしの風景画でOK、最も費用対効果が高い。
- **フィールドマップ絵**: 現在は絵文字タイル（🌲🏠🌿）。2案 ——
  - (A) **一枚絵**: 各マップの俯瞰イラストを地面に敷き、プレイヤー/NPC/扉のコマを上に重ねる。ChatGPTで作りやすい。グリッド（通行判定）と絵を大まかに合わせる必要あり。
  - (B) **タイルセット**: 草・道・木・建物など部品を個別生成。グリッドに正確に合うが、ChatGPTは“つなぎ目のないタイル”が苦手。
  - → まずは (A) を推奨。
- **立ち絵/コマ**: トレーナー戦のバナーや会話、フィールドのプレイヤー位置に使用。透過全身がベター。
- **記章/属性/状態/アイテム アイコン**: 小さな単体エンブレム。文字を入れず絵柄だけ。属性は色＋モチーフ（火＝炎、水＝雫…）。
- **タイトル＆OGP**: 文字は入れず“鍵となる一枚絵”を作り、タイトル文字はCSSで重ねる。同じ画像を `public/bg/title.jpg` としてOGP（X共有のカード画像）にも使う。

---

## 背景・風景の【マスター指示】（最初に1回貼る）

```
Illustrate environments for a Renaissance-era alchemical fantasy world ("錬金幻獣録"),
matching a hand-painted ink-and-watercolor storybook style.
- Painterly, muted earthy palette, aged-parchment atmosphere, soft natural light.
- Scenery only: NO characters, NO creatures, NO text, NO UI, NO frame, NO watermark.
- Cohesive with a fantasy monster compendium's world.
Render each scene I describe in exactly this style.
```

### すぐ作れる優先プロンプト（バトル背景・横長 3:2）
- `bg/battle/forest.jpg` — a misty enchanted forest clearing, soft fog between old trees, dappled light, painterly. (緑霧の森)
- `bg/battle/plains.jpg` — a calm grassy plain under a gentle sky, distant hills, painterly. (序盤の草原)
- `bg/battle/town.jpg` — a quiet Renaissance alchemist town square, cobblestones and stone houses, warm light. (村ラピス周辺)
- `bg/battle/cave.jpg` — a dim crystal cave / old mine interior, faint glowing minerals. (洞窟/鉱脈)
- `bg/battle/sea.jpg` — a windswept harbor coastline, waves and old docks, overcast painterly sky. (潮鳴りの港町)
- `bg/battle/peak.jpg` — a stormy mountain peak above the clouds, jagged rocks, gusting wind. (嵐嶺グランドピーク)
- `bg/battle/graveyard.jpg` — a foggy twilight graveyard, crooked tombstones, eerie calm. (黄昏の墓所)
- `bg/battle/furnace.jpg` — the interior of a vast alchemical transmutation furnace, molten light and machinery, ominous. (大錬成炉/最終)

### タイトル・キービジュアル（16:9）
- `bg/title.jpg` — a grand alchemist's study at dusk: an open glowing tome ("錬金幻獣録"), bubbling flasks, faint spectral creatures rising from the pages, warm candlelight; epic but cozy; NO text. (タイトル背景兼OGP)

---

## フィールド俯瞰マップ絵（最優先で着手）
各マップの**俯瞰（真上から見た）一枚絵**。中央が歩けるエリア、周囲が木や壁で囲まれた構図にすると、上に重ねるキャラのコマと噛み合う。文字・キャラ・グリッド線は入れない。`public/bg/map/<mapId>.png` に保存（透過不要）。

> 背景マスター指示を貼った上で、以下を投げる。アスペクトは正方形でOK（はみ出しは自動でカバー表示）。

- `bg/map/forest.png`（緑霧の森） — `Top-down (bird's-eye) view of a misty forest clearing as a game map. A large oval grassy clearing in the CENTER (open and walkable), densely surrounded by big trees along ALL edges. A small open glade at the TOP-CENTER, and a dirt path opening at the BOTTOM-CENTER. Soft fog, dappled light. No characters, no text, no grid.`
- `bg/map/rapis.png`（始まりの村ラピス） — `Top-down (bird's-eye) view of a small Renaissance alchemist village square as a game map. An open cobblestone-and-grass square in the CENTER (walkable), a few stone houses with chimneys along the TOP edge, low stone walls/fences around the BORDER, and a road opening at the BOTTOM-CENTER. Warm daylight. No characters, no text, no grid.`

→ 保存して教えてくれれば、`<mapId>.png` に整えて配置（PNG変換含む）し、本番反映する。コマ（🧝主人公・🧙‍♀️支部長・🚪出口）は私が絵の上に重ねる位置を調整する。

## 室内マップ（家・宿屋の内装・俯瞰）
`public/bg/map/<id>.png` に置くと床タイル表示から一枚絵に差替わる。背景マスター指示を先に貼る。中央=歩ける床／上=NPC位置／下中央=出入口。正方形でOK。
- `bg/map/mentor_house.png`（師ガレンの家）— `Top-down view of a cozy alchemist's study interior, open wooden floor center, shelves of bubbling flasks/books/alembics along walls, a small cauldron, a desk near the top, a doorway with a rug at bottom-center, warm candlelight, watercolor, no characters/text/grid.`
- `bg/map/home.png`（わが家）— `Top-down view of a warm humble cottage home interior, open wooden floor center, stone fireplace with a cooking pot, dining table and chairs, a small bed in a corner, cupboards along walls, doormat at bottom-center, cozy daylight, watercolor, no characters/text/grid.`
- `bg/map/home2f.png`（わが家・2階＝主人公の自室）— `Top-down view of a cozy small bedroom (a young adventurer's attic room) interior, open wooden floor center, a bed with a quilt in a corner (top-left), a small desk and chair, a window with morning light, a rug, a staircase opening at the right side, watercolor, no characters/text/grid.`
- `bg/map/inn.png`（ラピスの宿屋）— `Top-down view of a snug medieval inn interior, open wooden floor center, several quilted beds along the sides, a warm fireplace, a reception counter near the top, barrels and a rug, doorway at bottom-center, inviting warm light, watercolor, no characters/text/grid.`

## プレイヤーキャラ（2種・テイストを使い分け）
主人公は「錬金術師の見習い」。用途で画風を分ける。

### ① マップ移動用＝ドット絵 → `public/ui/player.png`
背景は水彩、キャラはドット絵の **HD-2D**（Octopath Traveler）風の組み合わせ。透過PNG・正方形。
```
Top-down RPG character sprite, 16-bit SNES JRPG pixel art, a young alchemist apprentice
with a satchel and a small glowing potion flask, facing the viewer (front/down view),
full body, clean readable silhouette, limited retro palette, crisp pixels,
transparent background, no text.
```
> 入れると🧝絵文字を置き換え、移動の向きで左右反転する（実装済み）。性別・髪色など見た目は自由に指定してOK。

### ② ストーリー/会話用＝水彩 → `public/portraits/player.png`
モンスターと同じ手描きインク＆水彩。会話・イベント用の立ち絵（実装は会話システム導入時）。
```
A young alchemist apprentice adventurer, waist-up portrait, hand-painted ink-and-watercolor
style matching a fantasy bestiary, warm and characterful expression,
transparent background, no text.
```

## 敵トレーナー（支部長・宿敵・ボス）
プレイヤー同様、**フィールド用＝ドット絵／会話・バトル用＝水彩立ち絵**の2種。水彩立ち絵は前述の【キャラ用マスター指示】を貼ってから生成する。

### 森の支部長 シルヴァ（gym_forest）
設定：緑霧の森を統べる植物使いの錬獣師。地/毒系（スポアリン/マンドラゴ/アルラウネ）を操る。落ち着いた女性。
- ドット絵（🧙‍♀️置き換え）→ `public/ui/gym_forest.png`
  ```
  Top-down RPG character sprite, 16-bit SNES JRPG pixel art, a calm forest alchemist-botanist
  woman in moss-green hooded robes adorned with leaves, holding a small wooden staff,
  facing the viewer (front/down view), full body, clean readable silhouette,
  limited retro palette, crisp pixels, transparent background, no text.
  ```
- 水彩立ち絵（会話・バトル）→ `public/portraits/gym_forest.png`（※キャラ用マスターを先に貼る）
  ```
  Silva, the forest gym leader — a calm woman alchemist-botanist in her late 20s,
  flowing moss-green and earth-toned robes adorned with leaves and vines,
  holding a wooden staff topped with a budding flower, gentle confident expression,
  waist-up portrait, transparent background, no text.
  ```

### ラスボス 灰王マグヌス（人型・magnus）
※幻獣図鑑の `101` はバトル時の姿。会話用に人型の立ち絵を別途用意する場合：
- 水彩立ち絵 → `public/portraits/magnus.png`（※キャラ用マスターを先に貼る）
  ```
  Magnus, the Ashen King — a gaunt fallen genius alchemist, tattered grey-and-black robes
  wreathed in faint drifting ash and glowing corrupted alchemical sigils, intense haunted eyes,
  imposing and tragic, waist-up portrait, transparent background, no text.
  ```

### 村のNPC 水彩立ち絵（会話の枠に表示。先にキャラ用マスターを貼る）
無い間はドット絵(ui/npc_*.png)で代用表示される。
- `portraits/mentor.png`（師ガレン）— `Garen, an old wise alchemist mentor, long grey beard, deep teal robe with brass clasps, kindly but stern eyes, waist-up portrait, transparent background, no text.`
- `portraits/mom.png`（おかあさん）— `a kind middle-aged village woman in an apron and simple dress, warm gentle smile, waist-up portrait, transparent background, no text.`
- `portraits/inn.png`（宿屋の主人）— `a cheerful stout innkeeper, a man with a vest and apron holding a mug, friendly grin, waist-up portrait, transparent background, no text.`

### 敵トレーナー汎用テンプレート（水彩立ち絵）
`{ }` を差し替えて量産。先頭にキャラ用マスターを貼る。
```
{年代/性別} alchemist (錬獣師) themed around {属性/モチーフ},
wearing {服装}, holding {持ち物}, {表情/雰囲気},
waist-up portrait, transparent background, no text.
```

## 命名・配置 規約
- バトル背景: `public/bg/battle/<地形キー>.jpg`（forest/plains/town/cave/sea/peak/graveyard/furnace）
- マップ絵: `public/bg/map/<mapId>.png`（rapis / forest）
- 立ち絵: `public/portraits/<id>.png`（gym_forest=シルヴァ, player, magnus…）
- 記章: `public/ui/badges/01.png`〜（獲得順）
- 属性/状態/アイテム: `public/ui/types/<火|水|…>.png` / `public/ui/status/<やけど|…>.png` / `public/ui/items/flask.png` 等
- 文字は入れない（コード側で表示）。背景は横長、アイコン/立ち絵は透過。

---

## おすすめ着手順
1. **バトル背景 `forest` と `town`（または `plains`）** … いま使う2マップ分。即・最も見栄えが変わる。
2. **タイトル／OGP `title.jpg`** … 共有時の第一印象。
3. ジム支部長 `gym_forest` の立ち絵 → トレーナー戦が締まる。
4. 以降、地形背景を全8種・記章・アイコン…と拡張。
