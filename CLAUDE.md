# CLAUDE.md — little world の作業ルール

夢日記のような乱雑なドットの世界を歩くゲーム。仕様は [docs/design/](docs/design/README.md) にある。
**状態：段階1（基盤）まで実装済み。** 次の段階に進むのはユーザーの合意を得てから。

## コマンド

```
npm run dev        # 開発サーバー（http://localhost:5173）
npm test           # テスト（物理・世界の接続・content の実データを通しで検証）
npm run typecheck  # 型検査
npm run build      # 型検査 + 公開用ビルド（dist/）
npm run art -- scan <画像> [背景] [まとめる間隔]   # 原画の中の物の範囲と、1ドットの大きさの見当
npm run art -- build                              # import-manifest.json のとおりに原画を加工する
npm run art -- preview <出力.png> [id...]         # 加工した結果を並べた確認用画像（出力は scratchpad に）
npm run art -- crop <画像> x y 幅 高さ <出力.png> [倍率]  # 原画の一部を書き出して切り抜き範囲を決める
npm run atlas                 # 開発の地図帳の解析 → planning/out/atlas.json。赤があれば終了コード 1（-- --watch で監視）
npm run reachability          # 到達性チェック（atlas を 1 回走らせて赤があれば失敗）
```

- 開発中の URL 引数：`?area=<id>&spawn=<名前>` で好きなエリアから始める、`?debug` でデバッグ表示（ゲーム中は ` キーで切り替え）
- 開発中はファイルを保存して再読み込みされると、直前の位置に戻る
- ブラウザのコンソールで `await __lw.checkRender()` を実行すると、描画の検証（`src/engine/rendercheck.ts`）が走る。`expect` を持つレイヤー（今は `image`）ごとに、期待する画面と実際の画面を1ドットずつ比べ、食い違いの数を返す。レイヤーの見た目や置き方を変えたら実行して 0 を確かめる
- ブラウザのコンソールの `__lw.run({ x: 1 }, 120)` / `__lw.state()` で、決まったステップ数だけ動かして確かめられる（画面が裏にあってフレームが間引かれていても使える）
- 組み込みブラウザの画面が隠れているとゲームが止まる（フェードが終わらず暗く写る）。見た目の確認は画面が表示されているときに行う

## 進め方

- ユーザーとは日本語でやり取りする
- ユーザーは **実装の前に議論して決めること**を重視する。新しい要素は、まず設計を提案して合意を取ってから作る
- 決定したことは `docs/design/` の該当ファイルと [00_overview.md](docs/design/00_overview.md) の決定の記録に反映する。矛盾が見つかったら [12_conflicts.md](docs/design/12_conflicts.md) に追記する
- 作業前に、関係する設計書のファイルを読む

## 技術

- TypeScript 7 + Vite 8 + Phaser 4、自作の軽量物理、データ検証は zod 4、テストは Vitest
- UI は段階1では素の DOM（`src/ui/overlay.ts`）。段階8で Preact + ドット調 CSS の拡張可能な UI 部品にする
- 依存パッケージは公開から2週間以上たった版を、版を固定して入れる
- 16px タイル、内部解像度 480×270（仮）を整数倍に拡大
- 公開は GitHub Pages（GitHub Actions）。作者エディタとローカル保存の口は公開版に含めない
- 開発の地図帳（[14_dev_atlas.md](docs/design/14_dev_atlas.md)、決定 69〜77、P0 まで実装済み）：解析は `tools/atlas/`、表示と計画の編集は MindBloom（`python作品/1_mindmapapp`、`--atlas` で起動）を改造して行う。計画は `planning/`（公開版に含めない。生成物の `planning/out/` は git に入れない）。条件プラグインは段階4で作るとき、ゲーム中の判定と並べて地図帳用の正規化（`normalize()`）を持たせる
  - 解析は `Content` をそのまま使うため、`tools/atlas/index.ts` が Vite のモジュールランナーで `run.ts` を読む（`import.meta.glob` を動かすため）。`index.ts` はほかの .ts を直接 import しない
  - 検査は `tools/atlas/checks/<id>.ts` に 1 種類 1 ファイル（自動登録）。テストの架空の世界は `tests/atlas.test.ts` の `fakeWorld`
  - `src/` から `planning/`・`tools/` を読み込まない（テストで確かめている）
  - MindBloom の確かめ方：`processing-java --sketch=<MindBloom> --output=<scratchpad> --force --run --atlas --selftest=<出力>`（`--atlas-live` で解析の起動・停止も、`--atlas-repo=<フォルダ>` で別の atlas.json も）。Processing は `C:\3年春学期\マルチメディアデザイン\processing-4.2\processing-java.exe`

## 構成のルール

- **データは `content/`、コードは `src/`**。データだけで表せるものはコードを書かない
- **拡張は1種類1ファイルのプラグイン**として `src/plugins/<種類>/` に置く（自動登録。中央の一覧は書き換えない）
- UI 部品も `src/ui/` に1部品1ファイル。置き場所・表示条件・入力の優先度を申告する
- 条件はすべて共通の書き方（[11_architecture.md](docs/design/11_architecture.md)）を使う
- すべての JSON はスキーマ（`src/schema/`）で検証する
- **ID は変えない・消さない**（最初の公開より前のサンプルエリアは例外で、作り直してよい）。セーブ形式を変えるときは版番号を上げて移行処理を書く
- `area.json` などの小さいファイルは起動時にすべて読み、重い `tiles.json` だけを遅延読み込みする（今いるエリアと隣のエリアの分）

## ユーザーの原画（art/）

- `art/` はユーザーが描いたドット絵（PNG）の置き場所。種類ごとのフォルダと決まりは [art/README.md](art/README.md)
- ドット絵の体裁の規則は [art/PIXEL_STYLE.md](art/PIXEL_STYLE.md)（ほかの AI にも渡す文書なので、単独で読めるように保つ）。Claude が仮のドット絵を描くときもこれに従う。大きさ・パレットなどゲーム側の前提を変えたら、この文書も直す
- 加工するときは #FF00FF を透明として扱い、`@4x` などの倍率は原寸に戻す。規則から外れた原画（半透明、色数超過、格子のずれ）は、直して取り込み、何を直したかをユーザーに伝える
- **アセットを本格的に作るときは、まず `art/` の該当フォルダに原画がないかを見て、あればそこから取り出して加工する**。手続き生成や Claude が文字で描くドット絵は、原画がないときの仮のもの
- 加工の行き先：タイル・スプライト（小さい絵）→ `content/assets/tiles/`・`sprites/` のパレット + 文字グリッド。背景・UI・日記の挿絵（大きい絵）→ 色数を整えた PNG を `content/assets/images/` に
- 加工したデータには `source`（例：`"art/tiles/night_stone.png"`）を必ず記録する
- **`art/` の中のファイルは書き換えない・移動しない・消さない**（ユーザーのもの）。`inbox/` の仕分けも、加工したデータを作るだけにする
- 同じ名前の `.md` メモがあれば、意図（固さ・動き・使う場所）として読み、その通りに作る。日本語のファイル名なら ID を決めて記録する
- 原画の加工は `content/assets/import-manifest.json` に書き（元画像・切り抜き範囲・背景・出来上がりの大きさ・色数）、`npm run art -- build` で出力する。出力したタイル・スプライトの JSON は手で直さず、manifest を直して作り直す。加工したら `preview` で見て確かめる
- inbox の仕分けの記録（何をどの ID にしたか・直したこと・取り込まなかった理由）は [docs/art_inbox_review.md](docs/art_inbox_review.md)、足りない素材とほかの AI に頼むプロンプトは [docs/art_requests.md](docs/art_requests.md)
- 画像生成 AI の絵は1ドットの格子がずれていて大きさの自動判定があてにならないので、ゲーム内での大きさ（プレイヤー 17×24、タイル 16）から `height` や `size` を決める。原寸の絵は `scale: 1`
- 物の当たり判定はメモの指定どおりにデータへ入れる。メモに当たり判定がない物は、推測で決めずにユーザーに確認する。等角投影の物（夢のずれとして許可）は、画像の下端中央を床の基準点にする
- 人物の向きは `_down` / `_up` / `_right`（左は反転）。横視点は `_side`、なければ `_right` で代用。エフェクトの姿で足りない向きは元の姿で表示する（選び方は `src/engine/facing.ts`。実装済み）
- プレイヤーの見た目は `content/world/map.json` の `player.sprite`（今は `traveler`。元の仮の姿は `dreamer`）
- 1つのスプライトに複数のアニメーションを入れるときは、manifest の `animations`（名前 → コマの切り抜きの配列）を使う。全コマで1つのパレット・同じ大きさになり、足元と左右の中央がそろう
  - コマごとに描かれた大きさが違う原画は `normalize: true`（`height`・アニメーションごとの `heights` に高さをそろえる。`scale` と書けば縮尺はそのままでコマごとに切り詰める）。コマの間が狭くて隣が混ざるときも `normalize` + `scale` を使う
  - 縁にマゼンタの混ざった色が残るときは `defringe`（紫・ピンクの物には使わない）
  - 背景・日記の挿絵など大きい絵は manifest の `images`（id = `content/assets/images/` からのパス）。原寸の PNG に書き出す。背景はエリアの `layers` に `{ "type": "image", "image": "backgrounds/…", "scale": 2, "scroll": …, "baseline": … }` と書いて描く（[01_world_and_areas.md](docs/design/01_world_and_areas.md) の「画像レイヤー」）
- 見た目の使い分け（決定 42〜44）：夢のかけら 10 種はレア度、通貨の硬貨は価値、SF 一式（`sf_`）はエリアごと

## content の決まりごと（段階1で実装済み）

- エリアの大きさは `area.json` の `size` だけに書く（`map.json` には位置 `pos` だけ）。フォルダ名 = エリアの `id`
- `tiles.json` は凡例（1文字 → タイル ID）とレイヤーごとの行。行数 = 高さ、各行の文字数 = 幅
- 当たり判定は `collide: true` の tiles レイヤーにある、`solid: true` のタイル
- プレイヤーは最後の tiles レイヤーのすぐ手前に描かれる（それより後のレイヤーは前景）
- `spawns` と出入口の `at` は **足元のタイル**。横視点の出入口は、そこから重力と逆向きに `size[1]`（既定 2）タイル伸びる
- エリアの外は「ループする端なら反対側 → 隣のエリアがあればそのタイル → どちらでもなければ壁」
- 視点や重力の向きが違う境界を越えたときは、近くの足場のある位置へ自動で出す。境界の両側で通路の高さをそろえること
- エリアに置く物は `content/objects/<id>.json`（スプライト・当たり判定・`provisional`）で定義し、`content/areas/<id>/entities.json` に `{ "object": id, "at": 足元のタイル }` で置く。当たり判定は見下ろしが `top: [横, 奥行き]`、横視点が `side: [横, 高さ]`（マス）。足元のマスから重力と逆向きに伸びる
- 物の当たり判定はエリアの当たり判定に足される（壁と同じ）。見下ろしでは足元の位置で前後が決まり、横視点ではプレイヤーの奥（`front: true` で手前）。上向きの重力のエリアでは物も天井から逆さに立つ
- `provisional: true` の物は当たり判定がユーザー未確認。確認が取れたら値を直して false にする
- 物の `interact: { type, ... }` で「調べる」ときの動きを決める。種類は `src/plugins/interactions/<type>.ts`（今は `bed`・`storage`・`base_core`）。範囲は当たり判定のまわり1マス

## 拠点・持ち物・地図（実装済み）

- 素材は `content/items/<id>.json`（名前・アイコンのスプライト・重さ）。全体の設定は `content/world/economy.json`（手持ちのマス数・段階ごとの倉庫のマス数・拠点の費用の成長率）
- 拠点は `content/bases/<area>.json`（`initial`・目覚める `spawn`・段階ごとの費用）。エリアは `basable: true` にし、揺らぎ区域は不可。拠点にする場所には `base_core` の物を置く
- 拠点にする費用は手持ちから、段階を上げる費用は手持ち＋その拠点の倉庫から払う。n 個目の拠点は量 × 成長率^(n-1)、質 ≥ n
- 段階2以上の拠点は倉庫が「夢の回廊」（セーブの `__corridor`）にまとまり、拠点どうしで移動できる。段階3・4の機能はまだない
- 揺らぎ区域（`resetOnEnter: true`）は `gather` の素材が入るたびに散らばる（入った回数が種。質はエリアの深さ）
- セーブは `src/systems/save.ts`（localStorage、版番号つき）。訪れたエリア・通ったワープ・拠点・手持ち・倉庫・眠った場所を持つ。眠った場所から始まる
- 地図（M）は訪れたエリアだけを 4×4 タイルのモザイクで描く（`src/systems/mapview.ts`・`src/ui/mapscreen.ts`）
- 操作：I 持ち物、M 地図、E 調べる、B 建築モード（拠点の中だけ）、C 手作り。画面を開いている間はゲームが止まり、Esc / Backspace / X で閉じる
- 建築モード（決定 51〜58。段階 A まで実装済み）：家具は `content/items` の `kind: "furniture"`（`places` に置く物、重さ 0・`maxStack` 1）。原本の物は `content/objects` の `movable: true` だけしまえる。置いた物・しまった原本はセーブの `placed` / `hidden`（版 2）に記録し、`content/` は書き換えない。置けるかの判定は `src/systems/building.ts`、操作は `src/scenes/buildmode.ts`、帯は `src/ui/buildbar.ts`
- 作業台とレシピ（段階 C、決定 64〜68）：レシピは `content/recipes/<id>.json`（`output`・`inputs`・`station`: hand / workbench）。手作りは C（持ち物の画面からも）、作業台は調べる種類 `workbench`。材料は手持ち → 倉庫 → このエリアの箱、質は使った材料の一番低い質（家具は 1）。処理は `src/systems/crafting.ts`、一覧は `src/plugins/interactions/_crafting.ts`。開発中は `__lw.craft('hand' | 'workbench')` で一覧を直接開ける（画面が隠れていても使える）
- 置ける箱（段階 B）：調べる種類 `chest`（`slots` でマス数）。中身は `placed[].contents`、中身があるとしまえない。最初の持ち物は `economy.json` の `starter`（セーブの `granted` で 1 回だけ。版 3）
- 入力は短い押し方（フレームの間に押して離す）も拾う（`JustDown`）。ブラウザの自動操作でキーが届かないときは、コンソールから `window.dispatchEvent(new KeyboardEvent('keydown', { key, code, keyCode }))` と keyup を送る（画面のモーダルは `document` に送る）
- 開発中の確認：`__lw.state()` に手持ち・散らばった素材の位置・案内の文字が出る。`__lw.map()` で地図を開く。セーブを消すときは `localStorage.removeItem('little-world:save')`
- 新しいエリアを足したら `npm test` を実行する（`tests/content.test.ts` が全 content を検証する。段階2で `tools/validate.ts` に分ける）
- エリアをまたぐ状態は `src/systems/` が持つ。エリアの中身に持たせない
- プレイヤーによる世界の変更（建築・破壊）は上書き層に保存し、`content/` の原本は書き換えない

## 守る不変のルール

- **拠点を1つも作らなくても、全部の夢のかけらを取れる**
- **深さによる狂いでは色（パレット）を変えない**。世界の色を変えるのは mood だけ
- HUD の大事な情報（mood の印、HP、所持数など）は狂いの影響を受けない
- 拠点は完全な安全地帯（追跡者・戦闘・損失なし）
- 追跡者はエリアの境界を越えない
- 建築は拠点だけ、タイルの破壊は揺らぎ区域だけ
- 未訪問エリアの情報はプレイヤー向けの地図に一切出さない
- 閲覧者用の「自分の夢」は本編と別の空間

## エリアを足すときの手順

1. ユーザーが伝えた世界観を `content/areas/<id>/notes.md` に **原文のまま** 保存する
2. `tools/new-area.ts` で雛形を作り、`area.json`・タイル・住人・イベント・かけらを書く
3. 必要なアセットを、`art/` の原画があればそれを加工して、なければ仮のものとして `content/assets/` に作り、`tools/preview.ts` で PNG にして確認する
4. `content/world/map.json` に配置し、既存エリアと端またはワープでつなぐ（視点・重力が違う境界は安全な出現位置を確認）
5. そのエリアの日記ページ（実績）を 1〜3 枚作る
6. かけらを足したら `effect_tree.json` との釣り合いを確認する
7. **`npm test` と `npm run reachability` を実行し、通ってから報告する**（`tools/validate.ts` は段階2でできるまで `npm test` の content の検証が代わり）。地図帳の情報・黄の結果も見て、意図どおりか確かめる
8. 組み込みブラウザで実際に歩いて確認する

種（`content/seeds/`）を育てるときも同じ手順。種のメモと配置を尊重する。

## 公開に関する注意

- 秘密情報（API キーなど）をリポジトリに含めない
- 「バックルーム」は元ネタとして参照するだけ。既存作品のキャラクターや画像は使わず、オリジナルの存在を作る
- フォント・音・画像は再配布できるライセンスのものだけ。ライセンス表記を同梱する
- 公開版では閲覧者の操作を記録しない
