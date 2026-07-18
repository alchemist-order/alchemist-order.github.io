# 実装指示書 O17: ローンチ準備3点（アセットダイエット/セーブ保全/FTUE）（Codex向け）

根拠: [STATE_REVIEW_2026-07.md](STATE_REVIEW_2026-07.md)。**本指示の完了をもって機能追加は凍結**し、ユーザー15分ゲート→ソフトローンチへ進む。
共通規約: engine層変更禁止 / 日本語はUTF-8保存（コミット前に git diff で目視。過去に'?'化事故あり）/ `tmp/` 以下は一切触らない。

---

## A. アセットダイエット（最優先・現状dist=105MB→目標30MB以下）

### A-1. 19MBの開幕プリロードを止める
- [Explore.tsx L227-231付近](../src/screens/Explore.tsx) の `.explore-backdrops` div（bg/map全9枚を隠しspanで読む装飾）を**削除**。対応CSSも除去
- ステージ背景は選択中ステージの1枚だけが読まれる状態にする（現行の `explore-node` の backgroundImage はそのままで良い）

### A-2. 画像一括圧縮スクリプト `scripts/optimize_assets.py`（PIL使用・新規）
| 対象 | 処理 | 目標 |
|---|---|---|
| public/sprites/*.png (301枚・31MB) | 256px確認→ `quantize(256, FASTOCTREE)` でPNG8化(アルファ保持) | 1枚≤40KB・計≤12MB |
| public/ui/*.png (14MB) | 長辺>256は256へ縮小→同PNG8化。例外: logo.pngは512px・≤150KB | 計≤4MB |
| public/bg/map/*.png (9枚・19MB) | **WebP化**(quality78・同名.webp生成→元PNG削除) | 1枚≤350KB |
| public/bg/battle/*.jpg + bg/title.jpg | JPEG再圧縮(quality72) | 1枚≤250KB |
- スクリプトは冪等（再実行で劣化を重ねない: 処理済みサイズなら skip）
- **画質の受け入れ**: 代表(スターター3・伝説1・記章1・バトル背景1)をbefore/after並べて目視し、劣化が分かる場合はそのカテゴリだけ品質を1段上げる

### A-3. WebP化に伴う参照更新（bg/mapのみ拡張子が変わる）
- `src/game/stages.ts` の `bg:` 文字列 `.png`→`.webp`（全ステージ）
- 他に bg/map を参照する箇所が無いこと grep で確認（現在 Explore の bgUrl は stage.bg 経由のみ）

### A-4. 遅延ロード
- [ui.tsx](../src/ui.tsx) の `Sprite` / `ItemIcon` / `BadgeIcon` / `MedalIcon` の `<img>` に `loading="lazy" decoding="async"` を付与（図鑑300マスやステージプレビューが視界内のみ読むようになる）

### A-5. 予算の恒久化 `scripts/check_asset_budget.mjs`（新規・buildに組込み）
- 検査: ①dist合計≤35MB ②画像1枚≤400KB(例外リスト: bg/title.jpg≤500KB) ③public/bg/mapに.pngが残っていない
- 違反はファイル名列挙で exit 1。package.json build に check_rng / check_acquisition_coverage と並べて追加

## B. セーブ自動バックアップ（消失への備え）

- `src/game/state.ts` に追加:
  ```ts
  const BACKUP_KEYS = ['ao-save-backup-1','ao-save-backup-2','ao-save-backup-3'] // 1が最新
  export function rotateBackup(): void  // 現セーブを{date: today(), data}で退避。
  // 呼び出し: アプリ起動のloadGame成功時に「backup-1のdateが今日でなければ」ローテーション
  // (=1日1世代。同日中の多重上書きで3世代が同一破損データにならないため)
  export function listBackups(): {key:string; date:string; summary:string}[] // summary=図鑑数/記章数/金
  export function restoreBackup(key: string): boolean // SAVE_KEYへ書き戻し
  ```
- **強制バックアップ**: 「さいしょから」で既存セーブを消す直前 / importSave実行直前 にも rotateBackup を呼ぶ（誤操作の最後の砦）
- 設定モーダル(App.tsxの settingsOpen 内)に「🗂 バックアップ」節:
  - 3世代を「7/17・図鑑42・記章2・1,200ゲル」形式で列挙＋[復元]ボタン
  - 復元は確認ダイアログ（「現在のデータをこのバックアップで置き換えます。元に戻せません」）→ 書き戻し→ `location.reload()`
  - 節の末尾に既存の書き出し/読み込みUIを統合配置
- localStorage容量超過は try/catch で握りつぶし（ゲーム進行を妨げない）

## C. FTUE「黄金の一本道」（開始→初捕獲→小包まで3分・迷いゼロ）

順序: タイトル→(既存Opening)→相棒選択→**導入会話チェーン**→ホーム(CTA発光)→forest_1で初捕獲→帰還リザルト→小包。

1. **導入会話チェーン**: `pickStarter`(App.tsx L471)の既存の師の一言に続けて、dialogueを連結:
   - 師ガレン2行(世界観: エーテル・幻獣・錬金術師の使命)→ 母(傷薬3個・既存mom_giftのロジック流用)→ ミルカ1行(「2体そろったら錬成釜へ」)
   - 台詞は maps.ts / App.tsx onTalk に既存の F4 文言から抜粋流用（新規執筆不要。**勝手に創作しない**）
   - 完了で `withFlag('ftue_intro')`
2. **CTA発光**: `ftue_intro` あり かつ `explore_start` 未経験(フラグ `ftue_explored` なし)の間、ホームの「探索する」ボタンに `.ftue-pulse`（金の脈動する縁。CSSはmedals.css等の分離ファイルへ）。探索画面では forest_1 カードにも同様
3. **初捕獲の保証**: フラグ `ftue_first_catch` が無い間の forest_1 で:
   - 最初のイベント抽選は必ず battle
   - 捕獲チャンスパネルの初回表示に説明1行を追加「※弱らせるほど成功率が上がる」(以後は出さない)
   - 未捕獲種は既存仕様で閾値50%発火のため追加調整不要。捕獲成功で `withFlag('ftue_first_catch')`
4. **小包との順序制御**: 初回セッションではログボ(applyDailyLogin)のダイアログを `ftue_intro` 完了後まで遅延（現在はphase遷移直後に出るため、導入会話と衝突する）
5. 2周目以降(「さいしょから」)も同じ導線で良い（全体で3分・スキップ実装は不要）

## D. 受け入れチェックリスト

- [ ] dist合計≤35MB・check_asset_budget green・スマホ実機相当で初回表示が体感即時
- [ ] 探索画面を開いても bg/map は選択中の1枚しかネットワークに乗らない(DevTools確認)
- [ ] 図鑑を開いた瞬間に300枚全部は読まれない(スクロールで順次)
- [ ] 画質: スターター/記章/バトル背景の目視で劣化が気にならない
- [ ] バックアップが日次ローテーションされ、設定から日付つきで見え、復元が動く
- [ ] 「さいしょから」直前に強制バックアップが積まれる
- [ ] 新規開始→導入会話→CTA発光→初捕獲(説明1行つき)→帰還→小包 が一本道で流れる(3分・迷いなし)
- [ ] 2回目以降のセッションでは発光や説明が出ない
- [ ] 旧セーブ読込・塔・ボス戦・書き出し/読み込みに回帰なし
- [ ] `npm run build` 通過・日本語文字化けゼロ

## E. コミット分割

1. `perf: アセットダイエット(プリロード削除/一括圧縮/webp/遅延ロード/予算検査)`
2. `feat: セーブ自動バックアップ(日次3世代+復元UI+強制退避)`
3. `feat: FTUE黄金の一本道(導入会話/CTA発光/初捕獲保証/小包順序)`

**この3コミットの後、新機能の実装は停止**（バグ修正のみ可）。以降はユーザーの15分ゲート待ち。
