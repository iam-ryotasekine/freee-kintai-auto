# freee-kintai-auto

freee勤怠管理Plusのタイムカードページで、打刻を自動入力するブラウザスクリプト。

## 機能

- タイムカード月次一覧から **「裁量労働（深夜なし）」かつ未入力** の日を自動検出
- 各日にランダムな出退勤時間を生成して打刻申請
  - 出勤: 9:00〜9:45
  - 退勤: 19:30〜20:00
- fetch APIによるバックグラウンド送信（ページ遷移なし）
- ドライランモードで事前確認可能

## 使い方

1. freee勤怠管理Plusのタイムカードページ（月次一覧）をブラウザで開く
2. Chrome DevTools を開く（`F12` または `Ctrl+Shift+I`）
3. **Console** タブに移動
4. `freee-kintai-auto.js` の内容をコピー＆ペーストして `Enter`
5. ドライラン結果（日付・時間の一覧）を確認
6. 問題なければ `dryRun: true` → `dryRun: false` に変更して再実行
7. 完了後 `F5` でページをリロードして結果を確認

## カスタマイズ

スクリプト冒頭の `CONFIG` で以下を調整可能:

| 設定項目 | 説明 | デフォルト |
|---------|------|-----------|
| `clockInStartMinutes` | 出勤時間の最早（分換算） | 540 (9:00) |
| `clockInEndMinutes` | 出勤時間の最遅（分換算） | 585 (9:45) |
| `clockOutStartMinutes` | 退勤時間の最早（分換算） | 1170 (19:30) |
| `clockOutEndMinutes` | 退勤時間の最遅（分換算） | 1200 (20:00) |
| `targetSchedule` | 対象スケジュール名 | `裁量労働（深夜なし）` |
| `delayBetweenRequests` | リクエスト間の待機（ms） | 1500 |
| `dryRun` | ドライランモード | `true` |
| `skipFutureDates` | 未来日を除外する | `true` |
