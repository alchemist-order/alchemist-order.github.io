# 未生成アセット 総まとめ（Codex 一括生成用）

現状スキャン（`public/`）に基づく**未生成リスト**。プロンプトは既存の各仕様書を参照（重複記載しない）。
保存先のファイル名は厳守（ゲーム側が名前で参照、置けば自動反映）。

**2系統の画風を混ぜないこと**：
- **幻獣（バトル/図鑑）= 水彩**（`MONSTER_ART_PROMPTS_300.md` / `ART_SPEC_AND_PROMPTS.md §0`）
- **フィールドの人物・装置 = 16bit昔風ドット**（`PIXEL_SPRITE_SPEC.md`、基準=`ui/gym_forest.png`）

---

## ✅ もう揃っているもの（生成不要）
- 幻獣スプライト **001–100 全部**（＋292,294,296,297,298,299,300）
- 支部長フィールド絵 `ui/gym_*`（8体）、四賢 `ui/sage_*`、`ui/magnus`/`sinel`
- 立ち絵 `portraits/`：支部長8・四賢4・magnus・sinel・mentor・mom・inn・morris・tina・sailor・kaito・player
- 建物 `ui/building_*`(4)、小物 `ui/prop_*`(全種)、森 `ui/forest_*`(4)、宝箱、アイテム、ロゴ
- プレイヤー歩行 `ui/player_*`（down/up/right × a/b）
- タイル `tiles/*`(10)、タイトル `bg/title.jpg`、森バトル背景 `bg/battle/forest.jpg`

---

## ★ Tier 1：今ゲームが参照しているのに欠けている（最優先・即効果）

### 1-A. 立ち絵（会話/モーダルで今すぐ表示される）＝水彩 `portraits/`
| ファイル | 被写体（水彩・上半身〜全身・透過/枠なし） |
|---|---|
| `portraits/laru.png` | 道具屋ラル：気のいい商人、革エプロン、ポーション瓶のバンドリア、コインポーチ（※店モーダルで参照中・今は非表示） |
| `portraits/mirka.png` | 錬成師ミルカ：額に真鍮ゴーグル、ルーン縁取りのコート、光るフラスコ（※錬成モーダルで参照中） |
| `portraits/peddler.png` | 行商人ドラン：風雨に晒れた行商人、大きな背負い袋、フード付き外套、杖 |
| `portraits/flowergirl.png` | 花売りノラ：花籠を抱えた快活な少女、エプロンドレス |
| `portraits/scholar.png` | 司書エルマ：丸眼鏡の学者風女性、長コート、分厚い書物 |
| `portraits/oldwoman.png` | 老婆ハーゼル：背を丸めた優しい老婆、頭と肩のショール、杖 |
| `portraits/guard.png` | 門番ゴルド：革と真鍮の鎧、兜、槍を持つがっしりした衛兵 |
| `portraits/bard.png` | 吟遊詩人リコ：羽根帽子、短いマント、フィドル（または竪琴） |

### 1-B. フィールド人物ドット ＝16bit（`PIXEL_SPRITE_SPEC.md`の規格・基準=gym_forest）`ui/`
被写体は `PIXEL_SPRITE_SPEC.md §2` の表に記載済み。欠けているのは↓。
| ファイル | 名前 |
|---|---|
| `ui/npc_laru.png` | 道具屋ラル |
| `ui/npc_mirka.png` | 錬成師ミルカ |
| `ui/npc_peddler.png` | 行商人ドラン |
| `ui/npc_flowergirl.png` | 花売りノラ |
| `ui/npc_scholar.png` | 司書エルマ |
| `ui/npc_oldwoman.png` | 老婆ハーゼル |
| `ui/npc_guard.png` | 門番ゴルド |
| `ui/npc_bard.png` | 吟遊詩人リコ |
| `ui/npc_storage.png` | 預かり所の管理人（カウンター/台帳/木箱モチーフ） |
| `ui/npc_portal.png` | 転送門（人ではなく装置：石アーチ＋渦巻く青紫のワープ光＋ルーン） |

### 1-C. バトル背景（今あるマップの地形）＝水彩・横長 `bg/battle/`
| ファイル | 被写体（`ART STYLE`水彩・横長・キャラ無し・中央やや空ける） |
|---|---|
| `bg/battle/town.jpg` | ラピス村/室内戦用：石畳の広場と錬金工房の街並み、夕暮れの暖色 |
| `bg/battle/sea.jpg` | 潮騒の道/港町用：砂浜と港、波と帆船、潮風の空 |

---

## ★ Tier 2：幻獣スプライト 101–300 の未生成（大量）＝水彩 `public/sprites/<3桁>.png`
**プロンプトは `MONSTER_ART_PROMPTS_300.md` に全部ある**（dexごとに記載）。下の番号だけ生成すれば埋まる。
**未生成（193体）**：
- **101–291**（連番すべて）
- **293**、**295**
- （292・294・296〜300 は生成済み）

> 保存＝図鑑番号3桁ゼロ詰め（例 `public/sprites/137.png`）。白背景で出たら `scripts/remove_bg.py` で透過化（原本は art_src/）。

---

## ☆ Tier 3：任意・将来（今すぐは不要）
- **既存フィールドドットの16bit描き直し**（統一感UP）：`ui/player_*`、`ui/npc_mentor/mom/inn/morris/tina/sailor/kaito`、`ui/gym_port`〜（gym_forest以外の支部長フィールド絵）。ファイル名据え置きで差し替え。仕様＝`PIXEL_SPRITE_SPEC.md`。
- **将来世界のバトル背景**＝水彩 `bg/battle/`：`volcano` `peak`(嵐嶺) `volt`(雷) `works`(錬成) `tomb`(冥) `astra`(聖) など（GAME_STRUCTUREの8地域分）。
- **街/室内アセット**（Codexの街・室内描画刷新に合わせて）：`ART_PROMPTS_TOWN_INTERIOR.md` 参照（地面/壁/家具/街灯/井戸 等）。
- **ボスのバトル大スプライト**：マグヌス/アビス・キメラ（`ui/magnus.png`はフィールド用。バトル表示用が要るか要確認）。
- **OGP大画像** `public/og.png`（X共有見栄え）、**転送門の専用装飾**など。

---

## 進め方メモ
1. まず **Tier 1**（立ち絵8＋ドット10＋背景2＝20枚）→ 既存の見栄えが一気に締まる＆破綻表示が消える。
2. 次に **Tier 2**（幻獣101–300の193枚）を `MONSTER_ART_PROMPTS_300.md` で一括。
3. **Tier 3** は本編・刷新の進行に合わせて。
- 透過必要なものは生成後 `scripts/remove_bg.py`。最適化は完成後にまとめて（過去手順あり）。
