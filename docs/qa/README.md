# Product QA pack

製品タイプ: （Tier1 静的 / Tier2 App / 内部ツール）

横断手順: `C:\Users\ryuta\.cursor\plugins\local\00_GHOST-IN-THE-SHELL\skills\product-check\SKILL.md`  
母艦ポインタ: `C:\Users\ryuta\Dev\00_vvelt-development\docs\product-check.md`

## 走行 STATUS

| Stage | 状態 | 完了日 |
|---|---|---|
| 01 | done | 2026-10-27 |
| 02 | pending | |
| 03 | pending | |

## いつ走らせるか

| フェーズ | 段 |
|---|---|
| 機能マージ直後 | 01 差分 + 影響 03 |
| クライアント前 | 01–03 フル |
| ロンチ直前 | 01–03 + 下記ロンチ切替 |

## ロンチ切替（製品が要るものだけ残す）

方針詳細は製品タイプの正本へ（静的 → preview-launch / App → 葉の deploy 文書）。

- [ ] 公開インデックス方針（noindex 解除の要否）
- [ ] デモ/破壊 UI の本番ガード（実装は `dev-tools`）
- [ ] 本番ユーザー・権限
- [ ] 本番データとデモデータの分離
- [ ] 運用手順（障害・日次）の一文

## 進め方

バグはすべて `bug-list.md` に集約（ID: `B-001`…）。1ターン1ステージ。  
設計上の未実装は `open-work.md`（ID: `W-001`…）。Stage を done にできるのは、対応する `v1を止める=yes` が残っていないとき。
