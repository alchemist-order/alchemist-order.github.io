# アルケミスト・オーダー ＝ 統一アート規格 ＆ 生成プロンプト集

Codexによるマップ描画刷新（斜め見下ろし水彩で統一・森を品質基準→街/室内へ横展開）向けの素材プロンプト集。
**最重要は「全素材を同じ視点・光源・縮尺・画風で作る」こと。** 個々の絵の巧拙よりも"統一"がチープさを消す。

---

## 0. 統一規格（全素材の先頭に必ず貼る）

```
ART STYLE — apply identically to EVERY asset:
Hand-painted ink-and-watercolor storybook illustration, Renaissance western-alchemy fantasy bestiary look.
Camera: consistent 3/4 TOP-DOWN oblique view, about 35-40 degrees downward tilt (NOT straight overhead, NOT pure side view).
Lighting: a single soft light source from the upper-left; gentle shadows fall to the lower-right.
Palette: muted, warm, cohesive storybook colors (no neon, no photoreal texture).
Rendering: clean readable silhouette, soft painterly washes, fine ink accents, no harsh black outlines, no cel-shading, no pixel art.
No text, no frame, no UI.
```

**縮尺の基準**：1タイル＝地面の正方形。人物は「足元が1タイル、頭まで約1.5タイル」に収まる大きさ＝**頭身2.5〜3**。建物・木は複数タイル分の高さで上にはみ出してよい（接地は1〜数タイル）。この比率を全素材で厳守。

---

## 1. マップ用キャラスプライト（最優先・浮きの主因）

立ち絵の縮小をやめ、**マップ専用ドット〜水彩スプライト**を用意する。

**フレーム仕様**
- 向き4方向：`down`(手前向き) / `up`(奥向き・背中) / `left` / `right`（leftはrightの反転で代用可＝実質 down/up/right の3方向）
- 各向き3フレーム：`0`=直立、`1`=右足前、`2`=左足前（0→1→0→2で歩行）
- 頭身2.5〜3、3/4見下ろし、**足元を画像下端中央に接地**、影は薄い楕円を内蔵
- 透過PNG、1コマ **約128×128px**、**全キャラで体格・縮尺・頭身・光源を統一**
- 保存形式はCodexのローダー仕様に合わせる（個別コマ推奨。例 `sprites/char/<id>_<dir>_<0|2>.png`）

**共通前文（各キャラの先頭に）**
```
<ART STYLE>
A map character sprite for a top-down RPG at the unified 3/4 oblique view, 2.5-3 heads tall,
full body, feet centered at the bottom edge, soft built-in oval shadow, TRANSPARENT background,
128x128. Same body scale and proportions as all other characters. Pose: {向き} {歩行フレーム}.
Subject:
```
（{向き}＝facing toward viewer / seen from behind / facing right。{歩行フレーム}＝standing still / mid-stride right foot forward / mid-stride left foot forward）

| キャラ | Subject |
|---|---|
| 主人公 | a young alchemist apprentice in travel clothes and a short mantle, a round capture-flask on the belt, gender-neutral |
| 師ガレン | an old master alchemist, long white beard, deep teal-green robe with brass clasps, wooden staff |
| 母リーゼ | a gentle middle-aged woman, chestnut hair tied with a cloth, apron over a dress |
| 宿屋ボルガ | a portly cheerful innkeeper, vest and apron, holding a wooden mug |
| 老人モーリス | a wizened old villager, hunched, plain clothes and shawl |
| 子供ティナ | an energetic little village girl, short braids, simple dress |
| 道具屋ラル | a friendly merchant, leather apron, bandolier of potion vials, coin pouch |
| 錬成師ミルカ | a young alchemist with brass goggles on her forehead, rune-trimmed coat, holding a glowing flask |
| 船乗り | a weathered sailor, striped shirt, knit cap, rolled sleeves |
| 支部長シルヴァ | a calm woman, moss-green hooded robe with leaf/vine motifs, a budding wooden staff |
| 支部長マレア | a sun-tanned woman sea-captain, tricorn hat, windswept coat, anchor-motif prosthetic arm |
| ライバル カイト | a confident teen boy, reddish-brown hair, cocky grin, travel outfit, one sleeve rolled |

> 残り6支部長/四賢/マグヌス等も同じ前文＋[CHARACTERS.md]の容姿で同様に。

---

## 2. 森タイルセット（緑霧の森・品質基準）

「木のタイルを敷いた壁」を脱却し、**地面＝タイル / 木＝幹(背面)＋樹冠(前景) の分離オブジェクト**にする。

### 2a. 地面タイル（シームレス・各タイプ4〜8種）
**共通前文**
```
<ART STYLE>
A seamless TILEABLE ground texture at the unified 3/4 oblique view, edges match on all four sides,
no single hard shadow (so it tiles), fills the square frame edge-to-edge, no objects, no text. Square 512x512.
Subject:
```
| ファイル例 | Subject |
|---|---|
| `grass_0`〜`grass_3` | forest grass — (0) normal short grass, (1) grass with small wildflowers, (2) grass with a bare-earth patch, (3) dense tall grass |
| `floor_dirt_0`〜`2` | forest dirt floor — (0) packed earth, (1) earth with scattered pebbles & twigs, (2) earth with fallen leaves |
| `path_0`〜`2` | a worn forest trail of packed dirt and a few flat stones — (0) plain, (1) cracked, (2) edges encroached by grass |
| `water_0`,`1` | shallow forest stream water — (0) calm with reflections, (1) gentle ripples |
| `moss_0`,`1` | mossy ground over roots and stone |

### 2b. 樹木＆林床オブジェクト（透過・接地）
**共通前文**
```
<ART STYLE>
A forest object at the unified 3/4 oblique view, TRANSPARENT background, soft contact shadow at the base.
Designed to overlap neighboring tiles (height taller than its footprint). Square 512x512. Subject:
```
| ファイル例 | Subject |
|---|---|
| `tree_trunk` | the lower trunk and roots of a tall forest tree (drawn so the player can stand BEHIND the canopy), gnarled bark, moss |
| `tree_canopy` | the leafy crown of a tall forest tree as a FOREGROUND layer (drawn above the player), dense layered foliage, dappled light |
| `tree_pine` | a tall conifer, full silhouette, dark green layered needles |
| `bush_0`,`1` | a low forest shrub / fern cluster |
| `log_fallen` | a moss-covered fallen log lying across the ground |
| `rock_mossy` | a mossy grey boulder |
| `stump` | an old tree stump with rings and small mushrooms |
| `fern`,`flower_wild` | undergrowth: ferns / a small cluster of wildflowers |

> 描画方針(実装側=Codex)：`tree_trunk`は地面層、`tree_canopy`は前景層に分け、**プレイヤーのY座標で前後**を切替＝「木の後ろを歩く」。

---

## 3. 境界（オートタイル）タイル — 四角いグリッド感の除去

草・道・水の**辺と角**を専用画像で用意（現行の丸コーナー差し込みを置換）。RPGツクール式の **47ブロブ** か、簡易 **16辺角** セット。

**共通前文**
```
<ART STYLE>
A seamless autotile EDGE/CORNER piece for a 3/4 oblique tilemap. The {上地形} blends organically over
the {下地形} along the indicated side(s) with a soft, slightly irregular hand-painted border (no straight
hard line). Transparent where the lower terrain shows. Tileable. Square 512x512. Edge: {辺/角の指定}.
Subject: the boundary where {上地形} meets {下地形}.
```
- 必要セット（{上地形}→{下地形} の各組）：**草→土/道**、**道→草**、**水→岸(土/草)**
- {辺/角の指定}：`top edge` / `bottom edge` / `left edge` / `right edge` / `outer corner TL/TR/BL/BR` / `inner corner TL/TR/BL/BR`（最低でも 4辺＋4外角＝8枚、理想は内角4枚も＝12枚/組、47ブロブなら定形シート）
- 例：`overlay_grass_on_dirt_topEdge` … 「上が草・下が土、上辺で草が土へにじむ縁」

> 1組12枚は多い場合、まず **草→土** と **水→岸** の2組だけ先行で十分効果が出る。

---

## 4. 建物（斜め見下ろしに統一）

正面視点をやめ、**マップと同じ3/4見下ろし**の立体建物に。

**共通前文**
```
<ART STYLE>
A small building for a top-down RPG at the unified 3/4 oblique view (you see the roof AND the front wall),
TRANSPARENT background, soft contact shadow, taller than its footprint so it overlaps tiles above.
A clearly visible front DOOR at the bottom-center (the entrance faces the player). About 3 tiles wide. 768x768. Subject:
```
| ファイル例 | Subject |
|---|---|
| `building_home` | a cozy cottage, warm terracotta roof, timber-and-plaster walls, a round window, an inviting wooden door |
| `building_inn` | a two-story inn, wide gabled roof, a hanging signboard, glowing windows, a large double door |
| `building_shop` | a small item shop, striped awning over the front, crates and bottles by the wall, an open shop door |
| `building_mentor` | an old alchemist's house/workshop, steep dark roof, a small smoking chimney, arcane symbols on the timber |

---

## 5. 室内（床・壁・家具を3/4見下ろしで統一）

| カテゴリ | 共通前文 | 例 |
|---|---|---|
| 床(シームレス) | 2a地面の前文 | `floor_wood`(温かい板張り) / `floor_stone`(石床) / `rug`(模様入り敷物・単体) |
| 壁(シームレス) | 2a地面の前文（ただし壁面） | `wall_plaster`(漆喰＋木枠) / `wall_stone` |
| 家具(透過・接地) | 2b前文（forest→interiorに読み替え） | bed / table / chair / shelf / cupboard / stove / pot / fireplace / cauldron / barrel / crate / plant / painting(正面・壁掛) / clock(正面・壁掛) / window(正面・壁掛) / vase / candle |

> 家具も**3/4見下ろし・上左光源・同縮尺**で。1マス中央固定をやめ、Codex側で隣マスへ少しはみ出し＋Y座標前後で"駒っぽさ"を解消。

---

## 6. 仕上げ（実装側・Codex）メモ
- `image-rendering: pixelated` は**非ドット絵に使わない**（拡大が荒れる）。`auto`/`high-quality`へ。
- 原画は大きく作り、表示は縮小しすぎない（タイル40px表示なら原画128〜256pxで十分、512pxは潰れる）。
- 緑霧：マップ上に薄い緑のグラデ＋周辺減光（ビネット）レイヤー。
- 影：各オブジェクトに薄い接地楕円（素材に内蔵 or 実装で付与）。

---

### 着手順（推奨）
1. **主人公スプライト**（4方向×3コマ）→ 即「ゲームらしさ」向上
2. **森 地面タイル＋樹木(幹/樹冠)** → 品質基準マップ完成
3. **草→土／水→岸 の境界タイル**
4. **建物4種を3/4見下ろし**
5. **室内 床/壁/家具**
6. 各キャラ・他マップへ横展開
