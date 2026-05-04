# Spring Bloomer Log API

Cloudflare Worker that accepts finished-game payloads and stores them in D1.

## デプロイ手順（初回のみ）

```bash
cd backend
npm i -g wrangler   # まだ入れてなければ
wrangler login      # ブラウザで Cloudflare にログイン

# D1 データベース作成。返ってきた database_id を wrangler.toml に貼る。
wrangler d1 create spring-bloomer

# スキーマ適用（リモート本番DBに対して）
wrangler d1 execute spring-bloomer --remote --file=schema.sql

# Worker をデプロイ
wrangler deploy
```

デプロイ後、`https://spring-bloomer-api.<your-subdomain>.workers.dev/health` で `{"ok":true}` が返れば成功。

## 動作確認

```bash
curl -X POST https://spring-bloomer-api.<your-subdomain>.workers.dev/log \
  -H "Origin: https://bloom.dilettantegames.net" \
  -H "Content-Type: application/json" \
  -d '{"uid":"test-uid-12345678","num_players":4,"events":[]}'
```

`{"ok":true}` が返ればOK。

## ログ確認

```bash
# 最新10件のヘッドライン
wrangler d1 execute spring-bloomer --remote --command "SELECT id, uid, num_players, num_battles, win_reason, winner_score, datetime(received_at/1000,'unixepoch') AS received FROM games ORDER BY id DESC LIMIT 10;"

# 全件CSVエクスポート
wrangler d1 execute spring-bloomer --remote --command "SELECT * FROM games" --json > games.json
```

## 設定変更

CORS の許可オリジンは `wrangler.toml` の `[vars] ALLOWED_ORIGINS` で管理（カンマ区切り）。
変更後は `wrangler deploy` で再反映。

## カスタムサブドメイン化（任意）

`api-bloom.dilettantegames.net` 等にしたい場合:

1. Cloudflare ダッシュボード → Workers → このWorker → Settings → Triggers → Custom Domains
2. `api-bloom.dilettantegames.net` を入力
3. 自動で DNS と SSL が設定される

その後、フロントの `js/logger.js` の `API_ORIGIN` を新URLに変更してデプロイ。
