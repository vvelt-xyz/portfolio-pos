# Stage 02 — Config & docs

検査日: YYYY-MM-DD

Hosting / プレビュー認証 / noindex の**方針**は再定義しない。  
正本: `preview-hosting` rule + `00_vvelt-development/docs/preview-launch.md`（静的）または葉の deploy 文書（App）。

## 設定

| ID | 項目 | 確認内容 | 結果 |
|---|---|---|---|
| K1 | 環境変数 | `.env.example` と実装必須キーが一致（値は見ない） | ☐ |
| K2 | 宿主 / デプロイ | 手順ドキュメントと実際の宿主が一致 | ☐ |
| K3 | 認証 / ルール | デプロイ順・必須 claim/role が文書化されている | ☐ |
| K4 | 破壊操作 | wipe/seed が運用手順に混入していない（実装ゲートは `dev-tools`） | ☐ |

## ドキュメント

| ID | 項目 | 結果 |
|---|---|---|
| D1 | README のセットアップが現行と矛盾しない | ☐ |
| D2 | スコープ文書（MVP 等）と実装の差がリスト化されている | ☐ |
| D3 | 秘密を docs に書いていない | ☐ |

## 完了条件

全行 PASS/FAIL。乖離は P2 でも `bug-list.md` に残す。
