# WELT POS（portfolio-pos）

株式会社WELT（[vvelt.xyz](https://vvelt.xyz)）の公開ショーケース。

**証明一文:** フロア起点の案内→注文→提供→会計まで、税・端数・複数端末同期を含む小規模飲食 Web POS を、Auth 付きで本番相当に実装できる。

本番プロダクト葉は private のまま。本リポは切り出してリビルドしたデモです。

## デモ URL / Operate

- URL: https://vvelt-portfolio-pos.vercel.app  
- GitHub: https://github.com/vvelt-xyz/portfolio-pos （public）
- Auth: ID `demo`（メール `demo@vvelt.xyz`）／パスワード `WeltPosDemo2026!`。ワンクリック可。
- 新規登録はありません（UI なし。claim 無しアカウントはデータに入れない）。
- バナー: ポートフォリオ用デモ。シード／リセットあり。本番店舗ではない。

### Operate（目安 5 ステップ）

1. デモログイン  
2. フロアで空席→人数→起票  
3. 注文を追加  
4. 提供コンソールで提供済  
5. 会計（現金など）→ ホームの本日集計を確認  

詳細: [`public/manual.html`](./public/manual.html)

## スタックとデモモード

| 層 | デモ |
|---|---|
| UI | Next.js App Router + TypeScript + Tailwind |
| Auth / DB | Firebase Auth + Firestore（`vvelt-portfolio-pos`） |
| Hosting | Vercel（デモ用プロジェクト） |
| データ | 共有シード。`npm run demo:reset` で ops/sales を初期化可 |

Operate = メイン動線＋設定編集（シード上）。Inspect 制限は乱用面のみ。

## ローカル起動

```bash
cp .env.example .env.local   # Firebase 値を埋める
npm install
npm run dev
```

## 差分表

| 本番にある | ショーケース |
|---|---|
| フロア〜会計の主要動線 | 含む |
| 税率・端数・メニューマスター | 含む（シード） |
| Firebase Auth + storeId | 含む（固定 demo） |
| 本日集計・日締め・赤伝 | 含む |
| レシート／プリンタ HW | 対象外 |
| LINE テイクアウト | 対象外 |
| スプシ取込・在庫・会員 | 対象外 |
| 本番店舗データ・顧客ブランド | 除外 |

切り出し表: [`docs/carve-out.md`](./docs/carve-out.md)  
短文: [`docs/pitch.md`](./docs/pitch.md)

## ライセンス

© 2026 株式会社WELT. ソースの再配布条件は未指定（著作権表示を残すこと）。
