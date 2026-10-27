# Stage 01 — Code review

検査日: 2026-10-27  
範囲: フル（公開ゲート前）

## 領域（製品が埋める — パスを列挙）

| ID | 領域 | パス | 観点 | 結果 |
|---|---|---|---|---|
| C1 | 権限境界 | `src/store/auth-store.tsx` `src/lib/firebase/auth.ts` `src/components/auth/*` `firestore.rules` | 未認証・claim 無し・クロステナント | PASS |
| C2 | 金銭・確定処理 | `src/domain/tax-policy.ts` `src/lib/firebase/ops-tx.ts` `src/store/pos-store.tsx` | 税・端数・sale append-only・赤伝ガード | PASS |
| C3 | 破壊・デモツール | `scripts/wipe-ops-and-sales.mjs` `package.json` `demo:reset` | UI 無ガード露出なし（CLI のみ） | PASS |
| C4 | 永続化境界 | `src/lib/firebase/*` `firestore.rules` | storeId パス分離・opsEvents/sales 更新削除禁止 | PASS |

## 共通観点（全製品）

- [x] P0 級（データ消失・権限回避）が領域内にない
- [x] 秘密・鍵のハードコードがない（デモ PW は README 公開前提・env）
- [x] 本番ビルドで開発専用 UI/API が無ガードでない（wipe は npm script）
- [x] 本番で必須設定欠落時に認証なし / local バイパスへ落ちない（`misconfigured`）
- [x] 永続化失敗を成功扱いにしてローカル状態を破棄していない（概観）
- [x] 楽観作成の未確定は、リモートスナップショットに ID が見えてから外す（概観・ops-tx）
- [x] 画面の操作可否と書き込みゲートが同じソース。別コピーによる無言の early-return が無い（概観）
- [x] `await` 後に `setState` 更新関数の副作用へ戻り値を依存させていない（概観）

## 完了条件

全行に PASS/FAIL。FAIL は `bug-list.md` に ID 付きで記載。

メモ: デモパスワード文字列が seed スクリプト既定値にもある（公開デモ前提）。秘密鍵・本番 Firebase ID の混入なし。
