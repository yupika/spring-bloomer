# Spring Bloomer Multiplayer Server

Bun + WebSocket サーバ。`play.dilettantegames.net/spring-bloomer/ws` でロビー＋対戦を提供する想定。

## 構成

- **Bun**: 1プロセスが port 3000 で listen、path prefix `/spring-bloomer` を担当
- **Nginx**: `play.dilettantegames.net` のリバースプロキシ。WebSocket upgrade 対応。SSL は certbot
- **systemd**: Bun プロセスの常駐管理

## 初回デプロイ手順（dragoon VPS）

リポジトリは既に `~/apps/spring-bloomer` にクローン済み前提。

### 1. 最新コード取得

```bash
cd ~/apps/spring-bloomer
git pull
```

### 2. 依存（無し、念のため）

```bash
cd server
bun install   # 現状外部依存ゼロ。空の bun.lockb が作られるだけ。
```

### 3. systemd サービス登録

```bash
sudo cp server/spring-bloomer.service /etc/systemd/system/spring-bloomer.service
sudo systemctl daemon-reload
sudo systemctl enable --now spring-bloomer
sudo systemctl status spring-bloomer
```

ログ確認:

```bash
sudo journalctl -u spring-bloomer -f
```

ローカルの health 疎通:

```bash
curl http://127.0.0.1:3000/spring-bloomer/health
# {"ok":true,"version":"0.1.0","prefix":"/spring-bloomer"}
```

### 4. Nginx vhost

```bash
sudo cp server/nginx-play.conf /etc/nginx/sites-available/play.dilettantegames.net
sudo ln -s /etc/nginx/sites-available/play.dilettantegames.net /etc/nginx/sites-enabled/play.dilettantegames.net
sudo nginx -t       # syntax check
sudo systemctl reload nginx
```

`map $http_upgrade $connection_upgrade { ... }` ブロックは既存の他サイト用に
別ファイル（例: `/etc/nginx/conf.d/websocket_upgrade.conf`）で定義済みかも。
重複するとエラーになるので、その場合は nginx-play.conf 側の map ブロックを
削除してください。

### 5. SSL 取得（Let's Encrypt）

certbot が未導入なら:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

証明書取得＋Nginx設定自動更新:

```bash
sudo certbot --nginx -d play.dilettantegames.net
```

これで `https://play.dilettantegames.net/spring-bloomer/health` が叩けるように。

### 6. 動作確認

```bash
curl https://play.dilettantegames.net/spring-bloomer/health
```

## 更新時の手順

```bash
cd ~/apps/spring-bloomer
git pull
sudo systemctl restart spring-bloomer
```

`server/spring-bloomer.service` を変えた場合は更に:

```bash
sudo cp server/spring-bloomer.service /etc/systemd/system/spring-bloomer.service
sudo systemctl daemon-reload
sudo systemctl restart spring-bloomer
```

`server/nginx-play.conf` を変えた場合:

```bash
sudo cp server/nginx-play.conf /etc/nginx/sites-available/play.dilettantegames.net
sudo nginx -t && sudo systemctl reload nginx
```

## ローカル開発

```bash
cd server
bun run dev   # ホットリロード
# 別ターミナルで:
curl http://localhost:3000/spring-bloomer/health
```

WebSocket疎通テスト（websocat や wscat 使用）:

```bash
wscat -c ws://localhost:3000/spring-bloomer/ws
> {"type":"create_room","name":"Alice"}
< {"type":"joined","yourId":"p..._1","code":"ABCD",...}
```
