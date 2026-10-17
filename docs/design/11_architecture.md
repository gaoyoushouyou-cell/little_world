# 11 アーキテクチャとファイル構成

## 方針

1. **データ（`content/`）とコード（`src/`）を完全に分ける**。大半の追加はデータだけで済むようにする
2. **新しい仕組みはプラグインとして足す**。1種類1ファイル。フォルダに置くだけで自動で読み込まれる（Vite の `import.meta.glob`）ので、中央の一覧を書き換える必要がない
3. **JSON は必ずスキーマで検証する**（zod）。起動時と検証ツールの両方で誤りを捕まえる。型もスキーマから作る
4. **ID は変えない・消さない。セーブデータには版番号を付ける**（移行処理を用意する）
5. **エリアをまたぐ状態はすべてセーブデータ側の仕組み（`src/systems/`）が持つ**。エリアの中身には持たせない（今のエリアと隣だけを読み込むため）

## ファイル構成

```
2_little_world_app/
├─ CLAUDE.md                     # Claude 向けの作業ルール
├─ docs/
│  ├─ design/                    # 仕様（この設計書）
│  └─ guides/                    # 「エリアの足し方」「住人の足し方」などの手順書
│
├─ art/                          # ★ ユーザーが描いた原画（PNG）。種類ごとのフォルダ。Claude は書き換えない
│  ├─ tiles/  player/  inhabitants/  objects/  items/
│  ├─ backgrounds/  effects/  ui/  diary/
│  └─ inbox/                     #   分類に迷ったもの
│
├─ content/                      # ★ ゲームデータはすべてここ（JSON）
│  ├─ world/
│  │  ├─ map.json                # エリアの配置・ワープ・種
│  │  ├─ moods.json              # 5色・4要素の定義、パレット、記号、環境演出
│  │  ├─ depth.json              # 深さごとの狂い・必要な重さ・損失の表
│  │  └─ effect_tree.json        # エフェクトの解放条件と前提関係
│  ├─ areas/<area_id>/           # 1エリア = 1フォルダ
│  │  ├─ area.json               # 視点・物理・レイヤー・深さ・規則・出入口
│  │  ├─ tiles.json              # タイル配置
│  │  ├─ entities.json           # 住人・物の配置
│  │  ├─ events.json             # きっかけ → 動作
│  │  ├─ fragments.json          # 夢のかけら
│  │  └─ notes.md                # ユーザーが伝えた世界観を原文のまま保存
│  ├─ objects/<id>.json          # エリアに置く物（スプライト・当たり判定）。置き場所は areas/<id>/entities.json
│  ├─ effects/<id>.json          # エフェクトのデータ
│  ├─ inhabitants/<id>.json      # 住人（部品の組み合わせ）
│  ├─ achievements/<id>.json     # 実績と日記ページ・報酬
│  ├─ items/                     # 通貨・素材（質・重さ）
│  ├─ recipes/                   # 加工のレシピ
│  ├─ bases/<area_id>.json       # 拠点化の費用・条件・段階ごとの機能
│  ├─ furniture/                 # 建築モードで置ける家具・部品
│  ├─ containers/                # 容器の種類（手持ち・倉庫・箱・特殊な容器）
│  ├─ seeds/<id>.json            # エディタで植えた未生成エリアの種
│  ├─ i18n/ja.json               # UI の文字
│  └─ assets/
│     ├─ import-manifest.json    # 原画（art/）の加工の指示（切り抜き・大きさ・色数）
│     ├─ palettes/               # パレット（mood での差し替えの土台）
│     ├─ tiles/<set>/            # タイル（文字グリッド形式）
│     ├─ sprites/                # キャラ・物（アニメーション付き）
│     ├─ backgrounds/            # 遠景（手続き生成の設定、または画像）
│     ├─ images/                 # ユーザーが描いた PNG の取り込み先
│     ├─ fonts/                  # 再配布できるドットフォント＋ライセンス
│     └─ audio/                  # 合成音の定義
│
├─ src/
│  ├─ engine/                    # ゲームループ・カメラ・入力・物理・描画・音・セーブ
│  ├─ systems/                   # 状態を持つ仕組み
│  │  ├─ mood.ts
│  │  ├─ depth.ts                # 狂いの適用・沈み
│  │  ├─ progression.ts          # かけら・揺れるかけら・エフェクトの木
│  │  ├─ achievements.ts
│  │  ├─ flags.ts
│  │  ├─ events.ts               # きっかけ → 動作の実行
│  │  ├─ abilities.ts            # 能力の層の計算
│  │  ├─ inventory.ts            # 容器・所持品・夢の回廊
│  │  ├─ bases.ts                # 拠点化と段階
│  │  ├─ overlay.ts              # 上書き層（建築・破壊の差分）
│  │  └─ map.ts                  # 地図・モザイクの生成
│  ├─ schema/                    # 全データのスキーマ（zod）
│  ├─ registry/                  # プラグインの自動登録
│  ├─ plugins/                   # ★ 拡張コードはすべてここ（1種類 = 1ファイル）
│  │  ├─ conditions/             #   条件の種類（effect, mood, depth, flag, weight …）
│  │  ├─ actions/                #   動作の種類（warp, setMood, spawn, giveItem …）
│  │  ├─ triggers/               #   きっかけの種類（enter, touch, gaze, sit …）
│  │  ├─ rules/                  #   エリア規則（charge_jump, combat, vertical_camera …）
│  │  ├─ abilities/              #   能力（sword, charge_jump, float …）
│  │  ├─ effects/                #   データだけで表せない特殊なエフェクトの処理
│  │  ├─ movements/              #   住人の動き方
│  │  ├─ presentations/          #   住人の不自然な見せ方
│  │  ├─ combat/                 #   攻撃の種類・当たり判定の形
│  │  ├─ layers/                 #   レイヤーの種類（gradient, image, fog …）
│  │  ├─ distortions/            #   狂いのシェーダー（色は変えない）
│  │  └─ generators/             #   手続き生成（揺らぎ区域、終わらない廊下など）
│  ├─ editor/                    # 作者エディタ（地図・エリア）、自分の夢、ローカル保存の口
│  └─ ui/                        # UI 部品（HUD・メニューのタブ・日記・地図画面・エフェクトの木…）
│
├─ tools/                        # 開発用ツール（Claude が毎回実行するもの）
│  ├─ validate.ts                # 全 JSON のスキーマ検証、ID の重複・参照切れ、規則の枠の衝突
│  ├─ reachability.ts            # 到達性チェック（詰み防止）
│  ├─ import-art.ts              # art/ の原画を content/assets/ のデータに加工する（scan / build / preview。実装済み）
│  ├─ preview.ts                 # ドット絵の JSON を PNG に書き出す
│  └─ new-area.ts                # 新しいエリアの雛形を作る
│
├─ public/
└─ .github/workflows/deploy.yml  # GitHub Pages への自動公開
```

## 条件の書き方（共通）

エフェクトの解放、通れる場所の制限、mood で決まるやり取り、実績の判定、UI 部品の表示条件、拠点化の条件は、すべて同じ形式で書く。

```jsonc
{ "all": [
    { "effect": "balloon" },                          // そのエフェクトを持っている
    { "mood": { "color": "red", "element": "moon" } },
    { "depth": { ">=": 3 } },
    { "flag": "sat_in_red_room" },
    { "weight": { ">=": 20 } }                        // 沈みの重さ
] }
// ほかに any / not / count / inArea / rule / item なども使える
```

新しい種類の条件は `src/plugins/conditions/` に1ファイル足すだけで、全部の仕組みから使えるようになる。

## きっかけ → 動作

```jsonc
// content/areas/<id>/events.json
[
  { "trigger": { "type": "sit", "target": "red_chair" },
    "if": { "mood": { "element": "moon" } },
    "do": [
      { "action": "setMood", "color": "red" },
      { "action": "setFlag", "flag": "sat_in_red_room" },
      { "action": "playSound", "sound": "low_hum" }
    ] }
]
```

この部分はコードを書かずに、チャットだけで増やせる。

## 新しい要素を足すときの手順

| 足したいもの | 触る場所 |
|---|---|
| 新しいエリア | `content/areas/<id>/` を作り、`map.json` に配置（`tools/new-area.ts` で雛形） |
| 新しい住人（既存の部品の組み合わせ） | `content/inhabitants/<id>.json` だけ |
| 新しい動き方・見せ方 | `src/plugins/movements/` などに1ファイル |
| 新しいエフェクト（既存の仕組みで表せるもの） | `content/effects/<id>.json` と `effect_tree.json` |
| 新しいエリア規則 | `src/plugins/rules/` に1ファイル |
| 新しい種類の仕掛け | `src/plugins/conditions/`・`actions/`・`triggers/` のどれかに1ファイル |
| 新しい素材・家具・容器 | `content/items/`・`furniture/`・`containers/` |
| 新しい UI 部品 | `src/ui/` に1ファイル（置き場所・表示条件・優先度を申告） |
| 全く新しい仕組み（天候など） | `src/systems/` と、それを使うための条件・動作のプラグイン |

## 開発中の動作確認

- Claude は組み込みブラウザで開発サーバーを開き、スクショとアクセシビリティツリーで確認する
- ローカル保存の口は開発サーバーにだけ存在し、公開版には含めない
