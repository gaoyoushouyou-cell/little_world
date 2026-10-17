# little world

ドットで描かれた、夢日記のような乱雑な世界を歩くゲーム。
エリアごとに視点（横 / 見下ろし）や物理（重力の向き、時間の速さ、ループする端）が変わる。

> 開発中（段階1：基盤）。設計は [docs/design/](docs/design/README.md) を参照。

## 遊び方（開発版）

```
npm install
npm run dev
```

ブラウザで http://localhost:5173 を開く。

| 操作 | キー |
|---|---|
| 移動 | 矢印キー / WASD |
| ジャンプ（横視点） | Space / Z |
| 扉・ワープに入る | E / X / Enter |
| デバッグ表示 | `（バッククォート） |

## 開発

```
npm test           # テスト
npm run typecheck  # 型検査
npm run build      # 公開用ビルド
```

ゲームのデータはすべて `content/`（JSON）、コードは `src/`。
新しいレイヤーの種類などは `src/plugins/<種類>/` に1ファイル置くだけで登録される。
