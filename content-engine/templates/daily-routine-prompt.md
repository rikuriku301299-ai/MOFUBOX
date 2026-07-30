# 毎日のRoutine用プロンプト（雛形）

Claude Code Remote の Routine（`create_trigger`、`create_new_session_on_fire: true` 推奨）にこの内容を登録すると、毎朝フレッシュなセッションが起動し、独立して40ネタを生成してコミット・プッシュする。実行時刻は未設定 — ユーザーから希望時刻の指示があり次第、この本文で `create_trigger` する。

---

## Routine本文（そのまま `prompt` に渡す）

```
リポジトリ rikuriku301299-ai/mofubox のブランチ claude/social-media-automation-zz6lyk で作業してください。

content-engine/README.md と content-engine/templates/brief.schema.json を読み、
その仕様に従って本日分のコンテンツアイデアを40件生成してください。

手順:
1. content-engine/briefs/ 配下の直近14日分のディレクトリを確認し、hook や concept が
   重複・酷似しているアイデアを避ける。
2. 5つのpillar（cute_moment / breed_profile / breeder_spotlight / before_you_adopt /
   qna_engagement）にできるだけ均等に配分して40件作る。
3. breeder_spotlight は特定ブリーダーの実写素材が前提のため、
   needs_breeder_consent を必ず true にする。
4. 各アイデアは brief.schema.json の必須フィールドを全て埋める。
   voiceover_script はPhase1では null のままでよい（字幕運用のため）。
5. content-engine/briefs/<今日の日付 YYYY-MM-DD>/ideas.json に
   { "date": "YYYY-MM-DD", "ideas": [...40件...] } の形式で保存する。
6. 上位5件（拡散力・制作しやすさ・在庫素材の有無で判断)を選び、
   人間が読みやすい日本語のダイジェストを
   content-engine/briefs/<日付>/summary.md に書く
   （各案: フック・狙い・必要な素材・すぐ作れるか一言）。
7. git add / commit / push（このRoutine専用のブランチに）。
8. 最後に、今日のsummary.mdの内容を要約して短く報告する
   （プッシュしたことと、レビューを待っている旨を伝える）。

コード変更ではなくコンテンツ生成タスクなので、他のファイルには触れないこと。
```

---

## 補足

- `create_new_session_on_fire: true` にすることで、毎回まっさらな状態から
  「直近14日分を読んで重複回避」というロジックが安定して働く（同一セッションを
  引き継ぐと文脈が肥大化しやすいため）。
- 実際に投稿するかどうかの判断は、Phase 3（自動投稿API）が整うまでは常に人間。
  Routineは「ネタと台本を毎朝そろえておく」ところまでが役割。
