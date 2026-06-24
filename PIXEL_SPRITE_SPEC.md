# フィールド ドット絵 統一規格（16bit 昔風・全員サイズ統一）

**対象＝フィールドの歩きキャラ全員**（主人公／村人NPC／守護者／四賢／ライバル／ボス）。
**絵柄の基準は「森の番人 シルヴァ」=`public/ui/gym_forest.png`**（16bit昔風・きれいすぎない）。
※バトル/図鑑の幻獣スプライトは従来の水彩のまま（混ぜない）。

> **なぜ作り直すか**：現状はキャラごとに「フレーム内で占める大きさ」がバラバラで、NPCが主人公より大きく見えていた。ゲームは画像を**高さ基準**で表示するため、**全スプライトを同じフレーム規格で描けばサイズが必ず揃う**。

---

## 0. マスター・スタイル（各プロンプト先頭に貼る）
```
STYLE — apply identically to EVERY field sprite:
16-bit era pixel art, SNES/GBA classic JRPG overworld character. Hand-pixeled, NOT smooth, NOT AI-glossy:
chunky visible square pixels, hard edges, NO anti-aliasing, NO soft gradients, NO blur.
Limited retro palette (about 12-20 colors), minimal dithering, a clean 1px darker outline,
flat cel shading, single light from the upper-left. 3/4 top-down oblique view (slight downward tilt).
Match the reference sprite "the forest guardian": same pixel chunkiness, outline weight, muted storybook palette.
```

## ★0.5 統一フレーム規格（サイズを必ず揃える・最重要）
**全キャラでこれを厳守。**ここが揃えば表示サイズが揃う。
```
FRAMING — identical for EVERY character (this guarantees equal on-screen size):
- Canvas: a TALL rectangle, aspect ~3:4 (e.g., 192 x 256 px). Transparent background.
- The character is drawn at the SAME full-body height in EVERY sprite:
  head top near the very top, FEET resting ON the bottom edge, centered horizontally.
- Character height = about 90% of the canvas height (fills it vertically). 2.5-3 heads tall.
- Do NOT shrink a character inside the frame; do NOT add empty padding above/below.
  Only WIDTH varies by build (a fat innkeeper is wider, a child is slimmer) — HEIGHT stays the same.
- A small built-in oval shadow directly under the feet.
- One character only, full body, no frame, no text, no ground tiles.
```
- **書き出し**：透過PNG、**高さ256px**（幅は120〜200pxでキャラ次第）。ゲーム側は高さ基準で約1.5タイルに統一表示。
- 子供（ティナ等）も“縮めて小さく”ではなく**同じ全身高さ**で頭身を低め（2〜2.3頭身）にして表現＝並んでも極端な段差にしない。

## ★0.6 実装メモ（反映済み/Codex）
- 描画は**全トークン高さ基準・倍率`TILE*1.5`に統一済み**（player/npc/leader）。PlayerTokenも`height:size, width:auto`に修正済み。→ あとは**上のフレーム規格で描けば**サイズが揃う。
- くっきり拡大には**キャラ系imgだけ**`image-rendering: pixelated`（任意・Codex）。

---

## 1. 主人公（4方向 × 2コマ）
ファイル：`ui/player_<down|up|right>_<a|b>.png`（`left`は`right`の左右反転で自動対応）。a=直立 / b=歩き。
※既存の主人公ドットも**この統一フレームで描き直し**（今は正方形フレームで小さく見えるため）。
```
<STYLE> <FRAMING> Pose: facing {toward viewer (down) / away, seen from the back (up) / to the right},
{standing still / mid-stride one foot forward}.
Subject: a young alchemist apprentice in travel clothes and a short mantle, a round capture-flask on the belt,
satchel, gender-neutral, brown short hair.
```
必要4枚（×2コマ=8）：`player_down_a/b`, `player_up_a/b`, `player_right_a/b`。

## 2. 村人・施設NPC（1コマ・手前向き）
前文：`<STYLE> <FRAMING> Single standing NPC, facing the viewer (front), one frame. Subject:`
| ファイル | 名前 | Subject |
|---|---|---|
| `npc_mentor` | 師ガレン | old master alchemist, long white beard, deep teal-green robe with brass clasps, wooden staff |
| `npc_mom` | 母リーゼ | gentle middle-aged woman, chestnut hair tied with cloth, apron over a dress |
| `npc_inn` | 宿屋ボルガ | portly cheerful innkeeper, vest and apron, holding a wooden mug |
| `npc_laru` | 道具屋ラル | friendly merchant, leather apron, bandolier of potion vials, coin pouch |
| `npc_mirka` | 錬成師ミルカ | young alchemist, brass goggles on forehead, rune-trimmed coat, glowing flask |
| `npc_morris` | 老人モーリス | wizened old villager, hunched, plain clothes and shawl, cane |
| `npc_tina` | 子供ティナ | energetic little girl, short braids, simple dress（低頭身・但し全身高さは統一） |
| `npc_peddler` | 行商人ドラン | weathered traveling merchant, big backpack, hooded cloak, walking staff |
| `npc_flowergirl` | 花売りノラ | cheerful girl holding a basket of colorful flowers, apron dress |
| `npc_scholar` | 司書エルマ | scholarly woman, round glasses, long coat, a thick tome under one arm |
| `npc_oldwoman` | 老婆ハーゼル | hunched kindly old woman, head & shoulder shawl, wooden cane |
| `npc_guard` | 門番ゴルド | stout village guard, leather-and-brass armor, helmet, holding a spear |
| `npc_bard` | 吟遊詩人リコ | slim bard, feathered cap, short cape, playing a fiddle |
| `npc_storage` | 預かり所の管理人 | round friendly caretaker, apron, holding a ledger, a stacked-crates motif beside |
| `npc_records` | 記録係エイダ | calm clerk woman, quill and a big record book/scroll, neat vest |
| `npc_sailor` | 船乗り | weathered sailor, striped shirt, knit cap, rolled sleeves |
| `npc_kaito` | ライバル カイト | confident teen boy, reddish-brown hair, cocky grin, travel outfit, one sleeve rolled |
| `npc_portal` | 転送門（装置） | NOT a person: a glowing arcane warp gate — stone arch + swirling blue-violet portal energy + runes（同フレーム・足元=台座） |

## 3. 守護者・四賢・ボス（同規格で順次）
基準の `gym_forest`(=済) に**サイズ・絵柄を合わせて**残りを統一。容姿は `CHARACTERS.md` 準拠。
| ファイル | 対象 |
|---|---|
| `gym_port` `gym_volcano` `gym_peak` `gym_volt` `gym_works` `gym_tomb` `gym_astra` | 守護者8（forest以外）※既存があれば統一フレームで描き直し |
| `sage_*` ×4、`magnus`、`sinel` | 四賢・ラスボス・シネル |

前文は §2 と同じ（`<STYLE> <FRAMING> Single standing character, facing the viewer, one frame. Subject: …`）。

---

## 4. 優先順
1. **主人公4方向**（統一フレームで描き直し）＝まず基準を作る
2. **村人・施設NPC**（§2）を統一フレームで（既存npc_morris/tina/mentor/mom/inn/sailor/kaito も描き直し）
3. 転送門`npc_portal`・記録係`npc_records`
4. 守護者（forest以外）→ 四賢・ボス
> 差し替えはファイル名据え置きで自動反映。`gym_forest`の“サイズ感”に全員を合わせるのが合言葉。
