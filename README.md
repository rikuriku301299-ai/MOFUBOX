# MOFUBOX

リール動画で出会う、猫ブリーダーマッチングサービスのプロトタイプ一式（LP・顧客用リール画面・ブリーダー管理画面・管理者パネル・新規登録）と、それらを動かす本番想定のバックエンドです。

## 技術構成

バックエンドは **Node.js の標準ライブラリのみ**（`node:sqlite` / `node:crypto` / `node:http` / 標準 `fetch`）で書かれており、`npm install` が不要です。`node_modules` も外部パッケージもありません。Node 22.5 以上が入っていれば、どの環境でもそのまま起動できます。

- DB: SQLite（`node:sqlite` の `DatabaseSync`、ファイルベース）
- 認証: scrypt によるパスワードハッシュ + セッションクッキー（自前実装）
- 動画: 自前ホスティング（アップロードしたファイルをサーバーのディスクに保存し、Range リクエスト対応で配信）
- 決済: Stripe REST API を `fetch` で直接呼び出す薄いラッパー（SDK 不使用、未設定時は安全に無効化）
- AI: Anthropic Messages API（Claude）を `fetch` で直接呼び出す（SDK 不使用、未設定時は安全に無効化）

## ローカルで動かす

```bash
node server/index.js
# または
npm start
```

`http://localhost:8910` で起動します（`PORT` 環境変数で変更可）。初回起動時に `data/` ディレクトリと SQLite データベースが自動作成され、管理者アカウント・ブリーダー5件・リール5件が自動的にシードされます（既にユーザーが存在する場合はシードされません）。

初期管理者アカウント（`.env.example` 参照、環境変数で変更可能）:
- メール: `admin@mofubox.jp`
- パスワード: `rikuto1289`

開発中にファイル変更を自動反映したい場合:

```bash
npm run dev
```

## デプロイ

Node 22.5 以上が動く環境であれば、ビルドステップなしでそのままデプロイできます。

1. リポジトリを配置する
2. 必要な環境変数を設定する（`.env.example` 参照）
3. `node server/index.js` を起動する
4. `data/` ディレクトリ（SQLite DB とアップロード動画）を永続化する

`data/` はリポジトリにコミットしません（`.gitignore` 参照）。デプロイ先のディスクが永続化されない環境（コンテナの再起動でディスクが消えるなど）の場合は、`MOFUBOX_DB_PATH` / `MOFUBOX_UPLOADS_DIR` で永続ボリューム上のパスを指定してください。

### 環境変数

`.env.example` を `.env` にコピーして使うか、ホスティング先の環境変数設定で直接指定してください（このサーバーは `.env` ファイルを自動読み込みしません）。

| 変数 | 必須 | 説明 |
|---|---|---|
| `PORT` | – | サーバーのリッスンポート（デフォルト `8910`） |
| `MOFUBOX_DB_PATH` | – | SQLite データベースファイルのパス |
| `MOFUBOX_UPLOADS_DIR` | – | アップロード動画の保存先ディレクトリ |
| `MOFUBOX_ADMIN_EMAIL` / `MOFUBOX_ADMIN_PASSWORD` | – | 初回シード時の管理者アカウント |
| `COOKIE_SECURE` | – | `1` を指定すると HTTPS 用に Secure クッキーを発行（HTTPS 配信時のみ設定） |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | – | 設定すると決済機能が有効化。未設定の場合は決済 API が `501 stripe_not_configured` を返す |
| `ANTHROPIC_API_KEY` | – | 設定すると FX チャート AI 分析ツール（`/fx.html`）が有効化。未設定の場合は分析 API が `501 anthropic_not_configured` を返す |

## 主要ページ

| パス | 内容 |
|---|---|
| `/index.html` | LP |
| `/about.html` | 創業者の想い・事業計画 |
| `/reel.html` | 顧客用リール画面（いいね・フォロー） |
| `/profile.html` | ブリーダープロフィール |
| `/breeder.html` | ブリーダー管理画面（要ログイン・要承認） |
| `/admin.html` | 管理者パネル（要管理者ログイン） |
| `/register.html` | 新規登録（お客様 / ブリーダー） |
| `/fx.html` | FX チャート AI 分析ツール（要管理者ログイン・`ANTHROPIC_API_KEY` 必須） |

## FX チャート AI 分析ツール（管理者専用）

`/fx.html` からチャートのスクリーンショット（撮影・スクショ・貼り付け対応）をアップロードすると、Claude（Opus 4.8）が画像を読み取り、Frankfurter API（ECB 日次参照レート）から取得した直近約6ヶ月の市場データと突き合わせて、トレンド・サポレジ・売買プラン（エントリー / 損切り / 利確の目安）を日本語レポートで返します。

- 通貨ペアは画像から自動判定（手動選択も可）
- 分析結果は SQLite に保存され、ページ下部の履歴から見返せます
- サーバーから `api.anthropic.com` と `api.frankfurter.dev` への外向き HTTPS 通信が必要です（市場データ取得に失敗した場合は画像のみで分析を続行）
- 分析は教育目的の参考情報であり、投資助言ではありません

## 既知の制約

- 動画はサーバーローカルディスクに保存される自前ホスティングです（CDN 未連携）。配信規模が大きくなる場合は外部の動画 CDN への切り替えを推奨します。
- Stripe は実キー未設定の状態で安全に無効化されますが、実際の決済を有効化するには `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` の設定が必要です。
- 検索は SQL の `LIKE` による部分一致です(全文検索エンジンは未導入)。通知はいいね・フォロー・ブリーダー審査・新規登録のタイミングでアプリ内に表示されます(メール・プッシュ通知は未実装)。
- `robots.txt` / `sitemap.xml` はプレースホルダードメイン(`https://example.com`)を使用しています。本番公開前に実際のドメインへ置き換えてください。
- クロスブラウザ検証は開発環境(Chromium)でのみ実施しています。Safari / Firefox 等での動作確認は別途必要です。
