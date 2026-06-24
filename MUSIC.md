# 音楽（BGM）プロンプト集 — Suno用

世界観: 近世西洋・錬金術ファンタジー。**シネマティックなJRPGオーケストラ**（FF的）で、**哀愁がありつつかっこいい**。

## 使い方（Suno）
1. **Instrumental（インストゥルメンタル）をON**（歌詞なしBGM）。
2. **Style（曲調）欄**に下のプロンプトを貼る。**Title**も設定。
3. 構成を効かせたい場合は、歌詞欄に `[Intro] [Build] [Main Theme] [Climax] [Outro]` のような**メタタグ**だけ入れる（インストでも構成誘導に効く）。
4. 1プロンプトで**数バージョン生成→いちばん良いものを採用**。ループ用に整えるのは後でこちらでも可。
5. ⚠️ 既存ゲーム名・作曲家名・アーティスト名は入れない（弾かれる/不安定）。音は「楽器・ジャンル・雰囲気・BPM」で表現する。

---

## ① オープニング / タイトル曲（哀愁＋荘厳）

**Title 例**: `Alchemist's Oath`

**Style（貼る）**:
```
Cinematic medieval-fantasy orchestral main theme, melancholic yet noble and hopeful,
sweeping lush strings, expressive solo cello and violin melody, harp and lute arpeggios,
ethereal wordless choir, warm solo flute, distant French horns, gentle timpani,
nostalgic and heroic, slow rubato build into a grand emotional swell, spacious reverb,
JRPG title screen, around 70 BPM, instrumental
```
**構成タグ（任意・歌詞欄）**: `[Soft Intro] [Theme on cello] [Strings build] [Grand swell with choir] [Quiet outro]`

> もし歌声入りの“テーマ曲”が欲しい場合は Instrumental を切り、荘厳なソプラノ＋合唱で。歌詞は意味より響き重視のラテン語風（例: `Lux aeterna, anima ignis...`）を別途出せます。

---

## ② ボス戦曲（めっちゃかっこいい）

**Title 例**: `Ashen King`

**Style（貼る／頭に“決め”のある勇壮な行進曲・「決戦」系）**:
```
Heroic militaristic orchestral boss-battle march. Opens with a sudden powerful orchestral
hit — a dramatic brass-and-timpani stab with a cymbal crash — then drops hard into a
relentless galloping snare-and-timpani march. Bold brass main melody, driving minor-key
string ostinato, soaring French horns and trumpets, urgent and desperate yet triumphant,
grand and propulsive, rising into a triumphant climax,
classic 16-bit JRPG boss energy reimagined for full orchestra, around 150 BPM, instrumental
```
**構成タグ（任意）**: `[Dramatic opening hit] [Drop into march] [Brass main theme] [Build] [Triumphant climax] [Loop]`

**ロック寄りにしたい場合は末尾に追記**: `, with distorted electric guitar doubling the brass melody and a driving rock drum kit`

> 狙い: 切迫感のある行進ビート＋堂々たる金管メロディ＝“決戦”系の高揚。ラスボス（灰王マグヌス）はさらに荘厳に `, with ominous pipe organ and dramatic choir`。通常ボスは `145 BPM` 程度に。

---

## ③ 始まりの村ラピス（穏やか・郷愁）

**Title 例**: `Village of Lapis` → `town.mp3`
```
Warm cozy medieval-fantasy village theme, peaceful and nostalgic, gentle and hopeful,
soft acoustic lute and classical guitar, recorder and flute melody, harp, light pizzicato
strings, mild hand percussion, pastoral and homely, relaxed and loopable, daytime sunshine,
JRPG hometown, around 90 BPM, instrumental
```
構成（任意）: `[Gentle intro] [Lute melody] [Flute counter-melody] [Soft loop]`

## ④ 緑霧の森（神秘・うっすら哀愁）

**Title 例**: `Misty Verdant Wood` → `forest.mp3`
```
Mysterious tense forest-dungeon theme, eerie and suspenseful with lurking danger,
hushed airy flute and oboe over a low pulsing string drone and uneasy harp,
wordless choir pads, occasional sharp pizzicato accents and distant low percussion,
a creeping feeling that monsters could appear at any moment, exploratory but on edge,
dark-fantasy woodland, loopable, around 95 BPM, instrumental
```
構成（任意）: `[Uneasy intro] [Flute theme over drone] [Tension swell] [Loop]`

## ⑤ 通常戦闘（爽快・ボスより軽い）

**Title 例**: `Spark of Battle` → `battle.mp3`
```
Energetic cinematic JRPG random-battle theme, exciting and heroic but light,
brisk staccato strings, bright brass fanfare hits, lively woodwinds, driving snare and
timpani, a little playful tension, fast and catchy, very loopable, NOT as heavy as a boss,
around 145 BPM, instrumental
```
構成（任意）: `[Battle start sting] [Main driving riff] [Brass melody] [Loop]`

> 町・森はマップごとに別BGMを割り当てられるよう実装する（`town.mp3`/`forest.mp3`…）。今後の町・ダンジョンも同じ要領で増設。

## ⑥ 勝利ファンファーレ（短尺・FFの“勝った！”系）

**Title 例**: `Victory!` → `victory.mp3`
```
Triumphant orchestral victory fanfare, short and celebratory jingle, bright major key,
bold brass fanfare with a catchy ascending rhythmic motif, rolling timpani and snare
flourish, soaring trumpets and horns, jubilant and uplifting, joyous battle-won jingle,
classic 16-bit JRPG fanfare reimagined for full orchestra, quick and snappy, instrumental
```
構成（任意）: `[Fanfare hit] [Rhythmic brass motif] [Triumphant flourish] [End]`

> ⚠️ Sunoは長めに生成するので、**最初の華やかな数秒（〜8〜12秒）だけ切り出して**使うのがコツ（戦闘勝利時に一度だけ鳴らす想定）。`victory.mp3` は短尺・非ループでこちらが再生実装します。

## 命名・配置（決めておく）
生成したMP3を `public/audio/<キー>.mp3` に置けば、こちらで画面ごとにループBGM＋ミュート切替を実装します。

| キー | 用途 |
|------|------|
| `title.mp3` | タイトル/オープニング |
| `boss.mp3` | ボス戦（ラスボス/守護者エース） |
| `battle.mp3` | 通常戦闘 |
| `town.mp3` | 始まりの村ラピス（町） |
| `forest.mp3` | 緑霧の森（探索） |
| `field.mp3` | その他フィールド（今後） |
| `victory.mp3` | 勝利ファンファーレ（短尺・今後） |

## 今後ほしい曲（優先順メモ）
1. タイトル ② ボス（←今ここ） 3. 通常戦闘 4. フィールド 5. 町 6. 勝利ジングル 7. エンディング（哀愁の大曲）

→ タイトルとボスができたら `public/audio/` に入れて教えてください。BGM再生（ループ・画面遷移で切替・音量/ミュートUI）を実装します。
