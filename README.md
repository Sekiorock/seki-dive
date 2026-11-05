# セキオエナジーロック v0.7 — Web公開手順（GitHub Pages）

前作セキオダイブと同じ GitHub Pages に同居させる前提の手順です。

## 1. GitHub Pages への配置

1. `sekiorock/seki-dive` リポジトリに `energy/` フォルダを作る
2. この `index.html` を `energy/index.html` として置く
3. コミット＆プッシュすると、数分で
   **https://sekiorock.github.io/seki-dive/energy/**
   で遊べるようになります

※ 別リポジトリ（例 `seki-energy`）で公開してもOK。
   その場合は Settings → Pages → Branch: main / root を有効にするだけです。

ゲームは URL を自動判定します：
- claude.ai 上 … オフライン動作（対戦・同時プレイはゴースト／非表示）
- GitHub Pages 上 … 起動時に自動で Firebase へ接続し、
  対戦ルームと「他プレイヤーのアバター表示」が有効になります
- QRボタンも公開URLをそのまま表示します（配布がラク）

## 2. Firebase の設定（1か所だけ追加）

前作と同じ Firebase プロジェクトをそのまま使います。
**新しいプロジェクトは不要、匿名認証も設定済み**です。

対戦ルーム（rooms/XXXX）は前作のルールのままで動きます。
追加が必要なのは「同時接続プレゼンス」用の 1 ブロックだけです。

`database.rules.json` の `"presence"` の中に `"energy"` を追加：

```json
"presence": {
  "home": {
    ".read": "auth != null",
    "$uid": { ".write": "auth != null && auth.uid === $uid" }
  },
  "energy": {
    ".read": "auth != null",
    "$uid": { ".write": "auth != null && auth.uid === $uid" }
  }
}
```

反映方法はどちらかで：
- `firebase deploy --only database`（CLIを使っている場合）
- または Firebase コンソール → Realtime Database →「ルール」タブに貼り付けて「公開」

## 3. 動作確認

1. 公開URLを2台（PC＋スマホ等）で開く
2. それぞれ名前をつけてフィールドに出る
3. 画面左上に「🌐オンライン ○人」、相手のアバターが
   🌐タグ付きの半透明キャラとしてフィールドを歩けば成功
4. 対戦道場（闘の扉）で「ルームを作る」→ 4桁コードで合流できれば対戦もOK

### うまくいかない時
- アバターが見えない → 手順2のルール追加がまだ（権限エラー時は自動でプレゼンスだけ無効になります。ゲーム自体は動きます）
- 接続できない → Firebase コンソール → Authentication → 匿名 が有効か確認
- 古い表示が残る → ブラウザのキャッシュを消すか、シークレットウィンドウで確認
