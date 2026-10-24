# セキオダイブ（seki-dive）

高校化学「第4章 溶液」のシリアスゲーム。いまの版は **home v0.1.0** です。

## この版でできること

- 白い3Dの広場「セキオロック中央広場」を、指でなぞって見回す
- 東西南北の4つの門（ハイドレーション・ビート、クリスタル・ラボ、フリーズ・ガード、コロイド・ミスト）。タップすると「まだ開いていません（準備中）」と出る
- 上の帯：ゲスト表示、QRボタン、「日本語｜EN」の切り替え
- QRボタン：参加用のQRコードを画面いっぱいに表示

## 公開のしかた（GitHub Pages）

1. GitHub で `seki-dive` という名前のリポジトリを作る
2. このフォルダの中身をすべてアップロードする（`index.html` がいちばん上に来るように）
3. Settings → Pages → Branch を `main`、フォルダを `/ (root)` にして Save
4. 数分後に `https://ユーザー名.github.io/seki-dive/` で開ける

パソコンで `index.html` をダブルクリックして開くと、文字のファイルが読めずに動きません。必ず GitHub Pages の URL で開いて確かめてください。

## 数値を変えたいとき

- ホームの数値：`home/src/config.js`
- QRコードで配るURL：`home/src/config.js` の `PUBLIC_URL`（空なら開いているページのURLを自動で使う）
- 画面の文字：`shared/i18n/ja.json` と `shared/i18n/en.json`（必ず両方に書く）
