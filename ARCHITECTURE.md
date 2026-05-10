# Spring Bloomer 構成・デプロイ仕様

3つの独立コンポーネントに分かれている。**どこを編集したらどこにデプロイするか**を間違えないこと。

---

## 全体図

```
ブラウザ
  │
  │  ① 静的アセット (HTML/JS/CSS)
  ▼
https://bloom.dilettantegames.net          ← Cloudflare Pages
  │
  ├─ ② ログPOST (HTTPS)
  │  https://spring-bloomer-api.yupika-iris.workers.dev/log
  │                                         ← Cloudflare Worker + D1
  │
  └─ ③ マルチプレイ (WebSocket)
     wss://play.dilettantegames.net/spring-bloomer/ws
                                            ← VPS (Bun + Nginx + systemd)
```

---

## ① フロントエンド（静的サイト）

| 項目 | 値 |
|---|---|
| 公開URL | https://bloom.dilettantegames.net |
| ホスティング | Cloudflare Pages |
| ソース | リポジトリ直下（`index.html`, `js/`, `css/`） |
| 設定ファイル | `wrangler.jsonc`（`assets.directory: "."`） |

**デプロイ方法:**
```bash
cd /home/ubuntu/apps/spring-bloomer
wrangler pages deploy .   # または Git 連携で自動
```

**注意:** ローカルで `index.html` を編集しただけでは本番に反映されない。必ずデプロイすること。

---

## ② ログAPI（Cloudflare Worker）

| 項目 | 値 |
|---|---|
| 公開URL | https://spring-bloomer-api.yupika-iris.workers.dev |
| ホスティング | Cloudflare Workers + D1 |
| ソース | `backend/src/` |
| 設定ファイル | `backend/wrangler.toml` |
| DB | D1 `spring-bloomer`（id: `558fc99c-3efa-4883-bde9-7b7342da6f56`） |
| 許可Origin | `bloom.dilettantegames.net`, `localhost:8000`, `127.0.0.1:8000` |

**デプロイ方法:**
```bash
cd backend
wrangler deploy                                      # コード変更時
wrangler d1 execute spring-bloomer --remote --file=schema.sql  # スキーマ変更時
```

詳細: [`backend/README.md`](./backend/README.md)

---

## ③ マルチプレイサーバー（VPS Bun）

| 項目 | 値 |
|---|---|
| 公開URL | wss://play.dilettantegames.net/spring-bloomer/ws |
| ヘルスチェック | https://play.dilettantegames.net/spring-bloomer/health |
| ホスティング | このVPS（Oracle Cloud） |
| ソース | `server/src/` |
| 起動 | systemd unit `spring-bloomer.service` |
| プロセス | Bun が `127.0.0.1:3000` で listen、PATH_PREFIX=`/spring-bloomer` |
| リバプロ | Nginx `/etc/nginx/sites-available/play.dilettantegames.net` |

**重要: Bunサーバは `/health` と `/ws` しか返さない。** 静的ファイル配信はしない（フロントは Pages で別配信）。

**デプロイ方法:**
```bash
cd /home/ubuntu/apps/spring-bloomer
git pull
sudo systemctl restart spring-bloomer
sudo systemctl status spring-bloomer
```

詳細: [`server/README.md`](./server/README.md)

---

## ドメイン整理

| ドメイン | 用途 | 提供 |
|---|---|---|
| `bloom.dilettantegames.net` | フロント静的サイト | Cloudflare Pages |
| `play.dilettantegames.net` | マルチプレイWebSocket | VPS Nginx → Bun |
| `*.workers.dev` | ログAPI | Cloudflare Workers |

`play.dilettantegames.net/spring-bloomer/`（末尾スラッシュでindex.htmlを期待）にアクセスすると 404 になる。**それは仕様**。フロントは `bloom.dilettantegames.net` 側にある。

---

## リポジトリ構成

```
/home/ubuntu/apps/spring-bloomer/
├── index.html              ① フロント（Pages）
├── js/, css/               ① フロント
├── wrangler.jsonc          ① Pagesデプロイ設定
│
├── backend/                ② ログAPI（Worker）
│   ├── src/index.js
│   ├── wrangler.toml
│   └── schema.sql
│
├── server/                 ③ マルチプレイ（Bun）
│   ├── src/index.js
│   ├── nginx-play.conf
│   └── spring-bloomer.service
│
├── origin-rule.md          ルール元ネタ
├── バランス調整ログ.md     AI調整経緯
└── ARCHITECTURE.md         このファイル
```

---

## トラブルシュート

| 症状 | 確認先 |
|---|---|
| フロントが古い内容 | Pages のデプロイ履歴。`wrangler pages deployment list` |
| ログがDBに来ない | Worker ログ `wrangler tail spring-bloomer-api` |
| マルチプレイ繋がらない | VPS で `systemctl status spring-bloomer`、`journalctl -u spring-bloomer -n 50` |
| WSが切れる | Nginx の `proxy_read_timeout`（現状 3600s） |
