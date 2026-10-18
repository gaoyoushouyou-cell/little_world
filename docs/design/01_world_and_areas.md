# 01 世界とエリア

## エリアとは

世界は **エリアの集まり**。エリア1つが1フォルダ（`content/areas/<area_id>/`）。
読み込むのは **今いるエリアと隣のエリアだけ**にして軽く保つ。

エリアが持つもの：

- 視点（`side` 横 / `top` 見下ろし）
- 物理条件
- レイヤー構成
- 深さ（1〜7、固定）→ [03_depth.md](03_depth.md)
- エリア規則 → [06_area_rules.md](06_area_rules.md)
- 出入口・住人・イベント・夢のかけら
- 原文の世界観メモ（`notes.md`）

## area.json の例

```jsonc
{
  "id": "inverted_aquarium",
  "name": "逆さの水族館",
  "view": "side",                    // "side" | "top"
  "size": [120, 40],                 // タイル数（16px タイル）
  "depth": 3,
  "physics": {
    "gravity": [0, -0.4],            // 上向き重力 = 天井を歩く。見下ろしでは [0, 0]
    "friction": 0.92,
    "maxSpeed": 2.5,
    "jump": 5,
    "timeScale": 0.6,                // 世界全体がスローモーション
    "wrap": "horizontal"             // none | horizontal | vertical | both（端がループ）
  },
  "layers": [ /* 下記 */ ],
  "moodTint": 0.8,                   // mood の色にどれだけ染まるか（0〜1）
  "rules": [],                       // エリア規則
  "effectPolicy": { "disable": [] }, // 封じるエフェクト
  "madnessPolicy": {},               // 受け付けない狂い / 抑制
  "exits": [
    { "id": "east_door", "at": [119, 20], "to": "endless_corridor", "spawn": "entrance_a" }
  ],
  "spawns": { "entrance_a": [2, 20] },
  "resetOnEnter": false,             // true なら揺らぎ区域
  "basable": false                   // 拠点化できるか
}
```

## 物理条件

| 項目 | 内容 |
|---|---|
| `gravity` | 重力のベクトル。向きも自由（逆さ、横向き） |
| `friction` | 摩擦。氷のように滑る、泥のように重い |
| `maxSpeed` / `jump` | 移動の速さ、ジャンプ力 |
| `timeScale` | 時間の速さ。世界全体がゆっくり / 速くなる |
| `wrap` | 端がループするか |

エフェクトやエリア規則はこの値を書き換えることで効果を出す（[06_area_rules.md](06_area_rules.md) の能力の層）。

## レイヤー

壮観な眺めのための構成（奥から手前へ）：

1. **遠景**：グラデーションの空、星、巨大な影（`scroll` 0〜0.2）
2. **中景**：数層（`scroll` 0.3〜0.7）
3. **タイル層**：当たり判定のある地面（`collide: true`）
4. **装飾タイル層**
5. **粒子**：泡、花びら、羽根
6. **前景**：カメラより速く流れて奥行きを出す（`scroll` > 1）
7. **霧・光**

```jsonc
"layers": [
  { "type": "gradient",  "colors": ["#0b0a1f", "#3a1d4f"], "scroll": 0 },
  { "type": "image",     "image": "backgrounds/far_jellyfish_city", "scroll": 0.1, "scale": 2, "autoScroll": [3, 0] },
  { "type": "image",     "image": "backgrounds/mid_coral_towers", "scroll": 0.4, "scale": 2 },
  { "type": "tiles",     "id": "ground", "collide": true },
  { "type": "tiles",     "id": "deco" },
  { "type": "particles", "preset": "rising_bubbles" },
  { "type": "image",     "image": "backgrounds/near_kelp", "scroll": 1.3, "alpha": 0.7 },
  { "type": "fog",       "color": "#000", "density": 0.3 }
]
```

- レイヤーの種類はプラグイン（`src/plugins/layers/`）で増やせる
- 巨大な遠景はなるべく手続き生成（グラデーション、ノイズ、繰り返し模様）にして画像を小さく保つ

### 画像レイヤー `image`（決定 45〜49）

ユーザーの原画から作った PNG（`content/assets/images/`）を描く。

| パラメータ | 意味 | 既定 |
|---|---|---|
| `image` | `content/assets/images/` からのパス（拡張子なし。manifest の `images` の id） | 必須 |
| `scroll` | パララックスの係数（0 = 画面に固定、1 = 地面と同じ速さ） | 0.3 |
| `baseline`・`offsetY` | 縦の位置。影絵（`silhouette`）と同じ決まりで、カメラが一番下のとき絵の下端がエリアの高さ × `baseline` に来る | 1・0 |
| `repeatX` | 横に繰り返す（左右がつながる絵だけ） | true |
| `x` | 繰り返さないときの左端（画面の px、カメラが左端のとき） | 0 |
| `scale` | 整数倍で拡大する | 1 |
| `autoScroll`・`alpha` | ひとりでに流れる速さ（px/秒、横だけ）・不透明度 | [0, 0]・1 |

- **読み込み**：レイヤーの種類が使う画像を申告し（`images(params)`）、`tiles.json` と同じく、エリアに入るとき（今いるエリアと隣のエリアの分）に Content がまとめて読む（決定 45）
- **mood**：PNG の中の色（16 色以内）をそのままパレットとして集めておき、スプライトと同じように mood で差し替える（決定 46。差し替え自体は mood の実装と一緒に作る）
- **縦の位置**は影絵と同じ `baseline` の決まり（決定 47）
- **原寸で書き出し、`scale` で拡大**する（決定 48）。原画の 1 ドットが 2px になるような書き出しはしない
- 最後の `tiles` レイヤーより後ろに書いた画像は前景（プレイヤーより手前）
- 検証：画像があること、色が 16 色以内で半透明のドットがないこと、`repeatX` の絵の幅が 16 の倍数であること
- **描画の検証**（`src/engine/rendercheck.ts`）：レイヤーの種類が「画面のどのドットがどの色になるはずか」を描画とは別に計算し（`expect`）、実際に描かれた画面と1ドットずつ比べる。開発中にブラウザのコンソールで `__lw.checkRender()` を実行する

## エリアのつながり

| 種類 | 表し方 | 設定 |
|---|---|---|
| **端で隣り合う** | 地図上で四角を隣接させて並べる | 不要。接している辺が自動的に通路になる。通れない部分は壁タイルで表す |
| **ワープ** | 2点を線で結ぶ（一方通行は矢印、双方向は両矢印） | `map.json` に記述 |
| **ループする端** | 辺に記号 | `physics.wrap` |
| **出入口（扉・穴など）** | エリア内の物 | `exits` |

- 地図上でエリアが **重なってもよい**（同じ場所に別の世界がある）。重なった部分は接続を作らない
- **視点や重力が違うエリアどうしの境界**：越えたら一番近い安全な足場に出現させる（空中や天井に出ない）。地図エディタは危険な接続を警告する

## 揺らぎ区域（入るたびにリセットされるエリア）

- `resetOnEnter: true` のエリア。入るたびに作り直される
  - 手続き生成（`src/plugins/generators/`）か、原本の状態に戻すかをエリアごとに選ぶ
- **タイルの破壊と採取ができるのはここだけ**（作り込んだ通常エリアの景色を守る）
- 深いほど質の良い素材が出るが、負ける危険も高い
- 夢のかけらは ID で取得済みを記録し、一度取ったら出なくなる
- 手続き生成でも、かけらへの道が必ずできるよう生成側に制約を持たせる
- **拠点にはできない**
- 戦闘で負けて入口に戻ったときは **作り直さない**（残り香を取りに戻れるように）。エリアを出て入り直すと作り直す
- 周回で素材が取り放題になる問題：質の上限は深さで決まるので天井は保たれる。足りなければ、連続で採るほど出にくくする（任意）

## アセットの形式

ドット絵はパレットと文字グリッドで定義する。

```json
{ "palette": { ".": null, "a": "#2b1d3a", "b": "#e86fa0" },
  "pixels": ["..aa..", ".abba.", "abbbba"] }
```

- 起動時にまとめてテクスチャに変換し、キャッシュする
- パレット番号で定義するので、**mood によるパレットの差し替え**がそのまま効く
- `tools/preview.ts` で JSON を PNG に書き出して確認できる

### ユーザーの原画（art/）

ユーザーが描いたドット絵は、リポジトリ直下の `art/` に種類ごとに置く（決まりは [art/README.md](../../art/README.md)）。
絵の体裁の規則は [art/PIXEL_STYLE.md](../../art/PIXEL_STYLE.md)。ほかの AI に描いてもらうときに渡せるよう、単独で読める文書にしてある。

| フォルダ | 中身 | 加工の行き先 |
|---|---|---|
| `art/tiles/` | 16×16 のタイル | `content/assets/tiles/`（パレット + 文字グリッド） |
| `art/player/` | プレイヤーのアニメーション | `content/assets/sprites/dreamer.json` |
| `art/inhabitants/<id>/` | 住人・追跡者 | `content/assets/sprites/<id>.json` |
| `art/objects/` | 家具・扉・灯りなど | `content/assets/sprites/` |
| `art/items/` | 素材・通貨・かけらのアイコン（16×16） | `content/assets/sprites/` |
| `art/backgrounds/<セット>/` | パララックスの遠景・中景・前景 | 色数を整えた PNG を `content/assets/images/` |
| `art/effects/<id>/` | エフェクトのアイコンと姿 | `content/assets/sprites/` |
| `art/ui/` | mood の印・枠・アイコン | `content/assets/images/ui/` |
| `art/diary/` | 日記の挿絵 | `content/assets/images/diary/` |
| `art/inbox/` | 分類に迷ったもの | 相談して仕分ける |

```
art/（原画・ユーザーのもの）  ──加工──▶  content/assets/（ゲームが読むデータ）
```

- アセットを本格的に作るときは、`art/` に原画があればそこから取り出して加工する。手続き生成や Claude が文字で描いたものは、原画がないときの仮のもの
- 加工したデータには `source`（元の原画のパス）を記録する
- `art/` の中のファイルは書き換えない・移動しない・消さない
- 原画はアニメーションを横一列に並べた PNG。拡大して描いた絵（`@4x`）は原寸に戻す
- 加工の道具（`tools/import-art.ts`）は段階2で作る

## チャットからエリアを作る流れ

1. ユーザーが世界観を伝える（例：「溶けた時計が実る森、空は逆さの海」）
2. Claude が `content/areas/<id>/` を作り、原文を `notes.md` に保存する
3. タイル・スプライト・背景を `content/assets/` に作る（`art/` に原画があればそれを加工する）
4. `map.json` に配置し、既存エリアと端またはワープでつなぐ
5. 日記ページ（実績）を 1〜3 枚作る
6. `validate` と `reachability` を実行してから報告する
