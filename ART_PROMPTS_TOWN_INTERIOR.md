# 街・室内 素材プロンプト（森の品質基準を横展開）

`ART_SPEC_AND_PROMPTS.md` §0 の **統一規格 `<ART STYLE>`**（3/4見下ろし・上左光源・水彩・頭身2.5〜3・muted配色）を**各プロンプトの先頭に必ず貼る**こと。
森で確立した3要素を街・室内にも適用：**①地面のバリエーション ②前景＋Y座標で前後（重なり）③境界タイル**。

保存先・ファイル名はCodexのローダー仕様に合わせて調整可。下は推奨名。

---

## A. 街（村ラピス／港町）

### A-1. 地面タイル（シームレス・各4種）
前文：`<ART STYLE>` ＋
```
A seamless TILEABLE ground texture at the unified 3/4 oblique view, edges match on all four sides,
soft even light (no single hard shadow so it tiles), fills the square edge-to-edge, no objects, no text. 512x512. Subject:
```
| ファイル例 | Subject |
|---|---|
| `town_cobble_0`〜`3` | a town cobblestone road — (0) neat fitted stones, (1) worn with gaps, (2) mossy between stones, (3) with a few cracked stones |
| `town_lawn_0`〜`3` | tidy village lawn/turf — (0) plain, (1) with daisies, (2) clover patch, (3) slightly trampled with bare spots |
| `town_dirt_0`,`1` | packed earth yard — plain / with cart-wheel ruts |
| `plaza_stone_0`,`1` | polished plaza flagstones with a faint alchemical inlay pattern |
| `port_plank_0`,`1` | weathered wooden dock planks (港町用) |

### A-2. 境界タイル（草⇄石畳・岸⇄水）
前文：`<ART STYLE>` ＋ `ART_SPEC §3` の境界前文。組：**lawn→cobble / cobble→lawn / sand→water**。
各組：`top/bottom/left/right edge` ＋ `outer corner ×4`（＋理想は `inner corner ×4`）。
例 `edge_lawn_on_cobble_top` …「上が芝、下が石畳、上辺で芝がにじむ」。

### A-3. 前景＋接地オブジェクト（透過・Y座標で前後）
前文：`<ART STYLE>` ＋
```
A town object at the unified 3/4 oblique view, TRANSPARENT background, soft contact shadow at the base,
taller than its footprint so it overlaps the tiles above it (so the player can walk BEHIND it). 512x512. Subject:
```
| ファイル例 | Subject |
|---|---|
| `lamp_post` | a wrought-iron street lamp post with a warm glowing lantern at the top (tall, foreground) |
| `town_tree_trunk` / `town_tree_canopy` | a village shade tree split into lower trunk (ground layer) and leafy crown (foreground layer), like the forest tree |
| `well` | a round stone well with a wooden roof, bucket and rope |
| `signboard` | a wooden hanging signboard on a post |
| `market_stall` | a market stall with a striped awning and goods on the counter (awning = foreground) |
| `flowerbed` | a low planter box overflowing with colorful flowers |
| `fence_h` / `fence_post` | a low wooden fence rail section / a single corner post |
| `barrel_stack` / `crate_stack` | stacked barrels / stacked crates with rope |
| `fountain` | a round multi-tile stone fountain with flowing water and a small statue (3x3) |
| `laundry_line` | a rope of hanging laundry strung between poles (foreground, overhead) |
| `cart` | a small wooden hand-cart with crates |

### A-4. 建物（3/4見下ろし・正面の扉つき）
前文：`<ART STYLE>` ＋ `ART_SPEC §4` の建物前文（屋根＋前壁が見える3/4、扉は下端中央、足元より高くはみ出す、768x768）。
| ファイル例 | Subject |
|---|---|
| `building_home` | a cozy cottage, warm terracotta roof, timber-and-plaster walls, round window, inviting wooden door |
| `building_inn` | a two-story inn, gabled roof, hanging signboard, glowing windows, large double door |
| `building_shop` | a small item shop, striped awning over the front, crates and bottles by the wall, open shop door |
| `building_mentor` | an old alchemist's workshop, steep dark roof, smoking chimney, arcane runes on timber |
| `townhouse_a`〜`c` | generic Renaissance townhouses for streetscape variety (different roof colors/heights), each with a front door |
| `port_warehouse` / `lighthouse` | 港町用：a dockside warehouse with big doors / a small stone lighthouse |

> 庇・屋根の張り出しは**前景レイヤー**にしてプレイヤーが軒下を通れるように（森の樹冠と同様）。

### A-5. 雰囲気（実装＝Codex）
街は**朝/夕の薄い色被り＋四隅減光**、夜は**窓と街灯の暖色グロー**。各オブジェクトに薄い接地楕円。

---

## B. 室内（家・宿・道具屋・工房）

### B-1. 床タイル（シームレス・各3種）
前文：A-1と同じ（室内床として）。
| ファイル例 | Subject |
|---|---|
| `floor_wood_0`〜`2` | warm timber plank floor — (0) clean, (1) with knots & grain, (2) worn/scuffed |
| `floor_stone_0`,`1` | stone slab floor — plain / with a faint crack |
| `floor_tile_0` | patterned ceramic tile (kitchen) |
| `rug_round` / `rug_rect` | decorative woven rugs (overlay on floor, single object) |

### B-2. 壁（背面レイヤー・シームレス＋壁ぎわ）
前文：`<ART STYLE>` ＋
```
A seamless interior WALL surface at the unified 3/4 oblique view (seen as the back wall behind furniture),
tileable horizontally, soft even light. 512x512. Subject:
```
| ファイル例 | Subject |
|---|---|
| `wall_plaster_0`,`1` | cream plaster wall with timber framing — plain / with a small window frame |
| `wall_stone_0` | stacked stone wall |
| `wall_wood_0` | wooden plank wall (cabin) |
| `wall_base_trim` | the skirting/baseboard strip where wall meets floor (壁ぎわの見切り) |

> 実装：壁は**背面レイヤー**、家具・人物はその手前。Y座標で前後を解決（壁際の家具の手前/奥を歩ける）。

### B-3. 家具（3/4見下ろし・接地・Y座標で前後）
前文：A-3の前文（town→interior に読み替え）。**1マス中央固定をやめ、隣マスへ少しはみ出す前提**。
| ファイル例 | Subject |
|---|---|
| `bed` | an ornate wooden bed with linen sheets and pillow |
| `table` / `chair` / `stool` | a sturdy wooden table / a chair / a round stool |
| `counter_long` | a long shop/inn counter (multi-tile width) |
| `shelf` / `cupboard` | a tall shelf of tomes & jars / a kitchen cupboard with plates |
| `bookshelf` | a tall bookshelf packed with leather tomes and scrolls |
| `stove` / `pot` | a stone-and-iron kitchen stove with warm fire / a cast-iron cooking pot |
| `fireplace` | a stone fireplace with crackling fire and mantel |
| `cauldron` | a black alchemy cauldron bubbling with rainbow liquid |
| `barrel` / `crate` | a wooden barrel / a roped crate |
| `plant_pot` / `vase` | a potted houseplant / a ceramic flower vase |
| `candlestick` / `lantern` | a brass candlestick with flame / a hanging lantern (foreground) |
| `cabinet_potions` | an apothecary cabinet of glowing reagent vials (工房用) |

### B-4. 壁掛け（正面向き・壁レイヤーに貼る）
前文：`<ART STYLE>`（ただし**正面向き＝front-facing**、壁に貼る平面物として）＋ `TRANSPARENT background. 512x512. Subject:`
| ファイル例 | Subject |
|---|---|
| `wallhang_window` | an arched cottage window with warm daylight through it |
| `wallhang_painting` | a framed landscape painting in an ornate gold frame |
| `wallhang_clock` | a round wooden wall clock |
| `wallhang_shelf` | a small wall shelf with potion bottles |
| `wallhang_torch` | a wall sconce with a warm flame (foreground glow) |

### B-5. 雰囲気（実装＝Codex）
室内は**暖色のランプ光＋四隅減光（ビネット）**。窓からの斜光を1筋。家具に薄い接地影。

---

## C. 優先順（横展開の推奨）
1. **室内 床/壁**（数種）＋壁の背面レイヤー化 → 部屋の"駒っぽさ"解消
2. **室内 家具**を3/4見下ろしで主要15種
3. **街 地面（石畳/芝）＋境界（芝⇄石畳）**
4. **街 前景オブジェクト**（街灯/木/井戸/露店/洗濯物）＝Y座標前後
5. **建物を3/4見下ろし**へ（home/inn/shop/mentor＋汎用townhouse）
6. 光・減光・接地影で仕上げ

> 既存の建物画像(building_*.png)は現在ほぼ真正面寄り。3/4見下ろしへ描き直すと統一感が出る。差し替えはファイル名据え置きで自動反映。
