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
