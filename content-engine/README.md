# content-engine

MOFUBOX の SNS（Instagram / TikTok / X / YouTube）を育てて、認知 → サイト流入 → ブリーダー登録・マッチング成約につなげるための、Claude 主導のコンテンツパイプラインです。動画生成AIやAPIキーがゼロの状態からでも今日から回せるように、3フェーズに分けています。

## コンテンツの方針

MOFUBOX は猫ブリーダーの実写動画・写真資産を既に持っています。ゼロからAI動画を量産するより、**実写素材を編集して届ける**ほうが低コストかつ「本物らしさ」が出るため、Phase 1〜2 はこちらを軸にします。

5つのコンテンツの柱（pillar）:

| pillar | 内容 | 狙い |
|---|---|---|
| `cute_moment` | 子猫・猫の可愛い瞬間集 | 拡散・フォロワー獲得 |
| `breed_profile` | 品種紹介・性格あるある | 検索流入・保存 |
| `breeder_spotlight` | ブリーダー密着・在籍中の子猫紹介 | 直接コンバージョン（要ブリーダー本人の同意） |
| `before_you_adopt` | 迎える前に知っておくべきこと | 信頼構築・権威性（悪質ブリーダー・ペットショップとの差別化） |
| `qna_engagement` | よくある質問・コメント誘発ネタ | エンゲージメント・アルゴリズム評価 |

> **注意（重要）**: `breeder_spotlight` は特定ブリーダーの映像・写真を使うため、必ず本人の掲載同意を取ってから制作すること。同意が未確認のアイデアは `needs_breeder_consent: true` としてマークし、素材確保フェーズで止める。

## 3フェーズ

### Phase 1: ネタ出し・台本・プロンプト生成（今日から稼働・追加費用ゼロ）

Claude（このセッション、または毎日の Routine）が直接、以下を生成する:

- 40件/日のコンテンツアイデア（`briefs/<date>/ideas.json`、スキーマは `templates/brief.schema.json`）
- 人間がレビューしやすい上位案のダイジェスト（`briefs/<date>/summary.md`）

外部APIキー不要。生成ロジックは `templates/daily-routine-prompt.md` に定義されており、Claude Code Remote の Routine（毎日実行のスケジュールトリガー）に登録することで自動化できる。

### Phase 2: 動画組み立て（実写素材＋字幕＋BGM、ナレーション音声はまだ無し）

`scripts/assemble.sh`（ffmpeg テンプレート）を使い、選んだブリーフ + 実写クリップ/写真 + BGM から縦動画（1080x1920）を書き出す。ナレーションTTSは未接続（字幕のみ）。TTSを足す場合は OpenAI TTS などのAPIキーが必要（フェーズ1では見送り、と決定済み）。

必要になるもの:
- ffmpeg（動画編集）
- ロイヤリティフリーBGM（`assets/bgm/` に配置。YouTube Audio Library 等の無料素材、または契約中の音源サービス）
- 使用許諾済みの実写素材（ブリーダーの同意が前提）

### Phase 3: 各SNSへの自動投稿（要:開発者アカウント審査・アクセストークン）

まだ未着手。各プラットフォームの投稿APIは事前審査が必要で即日は使えない:

- Instagram: Meta Graph API（Content Publishing）— developers.facebook.com でアプリ作成・審査
- TikTok: TikTok Content Posting API — developers.tiktok.com でアプリ登録・審査
- X: X API v2（投稿には有料プラン契約が必要）— developer.x.com
- YouTube: YouTube Data API v3（Shorts含む動画アップロード）— Google Cloud Console でOAuth設定

審査が通るまでは、Phase 2 で書き出した動画・キャプションを人が確認して手動投稿する運用を推奨（スパム判定・アカウント停止リスクを避けるため、立ち上げ初期は特に人間レビューを挟むべき）。

## ディレクトリ構成

```
content-engine/
  README.md                       このファイル
  briefs/<YYYY-MM-DD>/ideas.json  その日の40ネタ（構造化データ）
  briefs/<YYYY-MM-DD>/summary.md  上位案の人間向けダイジェスト
  templates/brief.schema.json     1ネタあたりのデータ構造定義
  templates/daily-routine-prompt.md  毎日のRoutineに登録するプロンプト本文
  scripts/assemble.sh             ffmpeg での動画組み立てテンプレート
  assets/bgm/                     ロイヤリティフリーBGMの置き場
  review.html                     その日のブリーフを一覧表示する簡易レビュー画面
```

## 毎日のRoutineを設定する

準備ができたら、`templates/daily-routine-prompt.md` の内容を Routine（`create_trigger`）に登録すれば、毎朝自動で40ネタが生成されブランチにコミットされる。実行時刻はまだ未設定 — 決まったら「毎朝○時にRoutineを作って」と伝えれば設定する。

## レビュー画面の使い方

`review.html` は `fetch` でその日の `ideas.json` を読み込むため、`file://` で直接開くと動かない。MOFUBOX のサーバー（`node server/index.js`）を起動した状態で `http://localhost:8910/content-engine/review.html?date=YYYY-MM-DD` にアクセスするか、`python3 -m http.server` などで `content-engine/` を簡易配信して確認する。
