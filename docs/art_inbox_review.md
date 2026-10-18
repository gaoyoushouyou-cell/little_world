# art/inbox/ のレビューと仕分け（2026-10-17・2回目）

対象：`art/inbox/` の画像 47 枚（README を除く）。原画は移動・変更していない。
加工はすべて `content/assets/import-manifest.json` に書き、`npm run art -- build` で出力した（`source` に元の原画を記録）。
足りない素材と、出し直してもらうためのプロンプトは [art_requests.md](art_requests.md)。

## 1. 全体の状況

| 状況 | 枚数 | ファイル |
|---|---|---|
| 取り込み済み（ほぼ全部使った） | 26 | `73iub…` ×4、`d0sib…` ×3、`f4n46…` ×4、`c8av…`（無印・(1)・(2)）、`furniture_sheet1/2`、`natural_weeds_preview`、`nature_decorations_preview`、`Designer.jpeg`、`large_trees_preview.png`、`Designer (13)`、`Designer (15)`、`dcirh1` ×4 |
| ほぼ取り込み済み | 7 | `2hzm…` ×4（ずれたマスだけ残した）、`Designer (12)`（顔絵・風景は使わない）、`Designer (14)`（01・12 を除く 10 体）、`6.png`（下のカードのベンチ・街灯） |
| 取り込まない（出し直しを頼む） | 5 | `2.png`〜`5.png`（説明図）、`c8av (3)`（灯りの頭だけで柱が切れている） |
| 保留（使うか決めてから） | 4 | `q9yd` ×4（SF 一式） |
| 使えない・重複 | 5 | `1.png`（真っ白）、`Designer (5)`（`Designer (12)` と同じ）、`furniture_collection_preview`（sheet1/2 の並べ直し）、`large_trees_preview (1)`（取り込み済みの木の別案）、`materials_preview`（文字化け・既存作品の名前が見出しにある・アイコンに線が付いている） |

## 2. 今回取り込んだもの

ゲームが読む形（パレット + 文字グリッドの JSON、`npm test` で検証済み）。**どのエリアにもまだ置いていない**。

### 人物（`content/assets/sprites/`）
| ID | 中身 | 元 |
|---|---|---|
| `npc_hooded` `npc_umbrella` `npc_lantern` `npc_silent_girl` | 住人：フードの人・傘の人・ランタンの人・無口な少女 | `Designer (14)` |
| `chaser_eyeless` `chaser_fourlegs` `chaser_inverted` `chaser_floating` `chaser_birdlike` `chaser_chained` | 追跡者：目のない者・四つ足の影・逆さの人・浮く人・鳥のような者・繋がれた者 | `Designer (14)` |
| `traveler_dash` | 旅人のダッシュ（下・右・上 × 4コマ） | `Designer (12)` |
| `traveler_sit` `traveler_sleep` | 座って休む（3コマ）・横になって眠る | `Designer (12)` |
| `traveler_emote` | 話す・驚く・アイテムを使う・勝利 | `Designer (12)` |

- 住人・追跡者は、どれも `idle_down`（3コマ）・`idle_right`・`idle_up`・`walk_down`・`walk_right`・`walk_up` を持つ（プレイヤーと同じ名前。左は右の反転）。大きさは 11〜17 × 19〜24
- 旅人の追加の姿は `traveler` と同じ縮尺で別のスプライトにした（同じスプライトに足すと、既存の歩きの色と大きさが変わるため）

### アイコン（16×16）
| ID | 中身 | 元 |
|---|---|---|
| `shard_<名前>` ×10 | 夢のかけら：beginning（はじまり）・calm（やすらぎ）・warmth（ぬくもり）・silence（しずけさ）・hope（きぼう）・sorrow（かなしみ）・bond（つながり）・wisdom（ちえ）・life（いのち）・awakening（めざめ） | `Designer (15)` |
| `shard_<名前>_spin` ×10 | それぞれの回転（7コマ） | `Designer (15)` |
| `coin_bronze` `coin_silver` `coin_gold` `coin_rune_a/b/c` | 通貨の候補（硬貨・ルーン硬貨） | `dcirh1` |
| `coins_stack_1`〜`6` `pouch_small` `pouch_large` | 硬貨の山（所持量の段階）・袋 | `dcirh1` |
| `gem_red_cut` `gem_blue_cut` `gem_green_cut` | 四角く切った宝石 | `dcirh1` |
| `gem_mood_black/white/red/blue/green` | mood の5色に対応する宝石 | `dcirh1 (3)` |
| `shard_bit_a`〜`i` `shards_scattered` | 小さな欠片 9 種・砕けて散った欠片 | `dcirh1 (1)` |
| `core_glowing` `ore_spiked_black` `crystal_burning_a/b` `crystal_ice` `crystal_vine` | 深い場所の素材の候補 | `dcirh1 (1)` |
| `bottle_send` `bottle_send_full` | 送り瓶（空・光を入れた状態） | `dcirh1 (2)` |
| `bottle_send_fx`（24×24・`fill` 7コマ・`use` 3コマ） `bottle_send_fade`（3コマ） | 送り瓶を使ったときの動き | `dcirh1 (2)` |
| `bottle_dream_a/b` `bottle_glow_a/b` | 夢の入った瓶・光る瓶 | `dcirh1 (3)` |

### 物（`content/assets/sprites/` と `content/objects/`）
| ID | 中身 | 元 |
|---|---|---|
| `tree_oak` `tree_pine` `tree_sakura` `tree_autumn` `tree_apple` `tree_willow_b` `tree_dead` `tree_birch` `tree_glow_blue` `tree_moss_giant` | 木 10 種（高さ 64） | `Designer (13)` |
| `bench_wood` `bench_iron` `bench_stone` `bench_oneleg` | ベンチ（等角） | `6.png` |
| `streetlamp_single` `streetlamp_double` `streetlamp_hanging` `streetlamp_curved` | 街灯 | `6.png` |
| `chest_front_open` | 開いた箱（真正面）。スプライトだけ（`chest` の `openSprite` に使える） | `f4n46 (3)` |

- 木・ベンチ・街灯の 18 個は `content/objects/` に物として定義した。**当たり判定は仮**（`provisional: true`、木は 横 2 × 奥行き 1、細い物は 1 × 1）。下の「5. 決めてほしいこと」で確かめたい

### タイル（`content/assets/tiles/`、16×16）
| タイルセット | 中身 | 元 |
|---|---|---|
| `inbox_grass_edge`（29） | 草の別案 5、暗い土 2、草と土の縁（西 `grass_dirt_w_*`・東 `grass_dirt_e_*`）、角（`grass_dirt_nw/ne/sw/se`）、土の道の角（`path_dirt_*`）、まばらな草、**横視点の地面の上端・角・浮いた足場の両端**（`side_grass_*` `side_platform_l/r`） | `2hzm (1)` |
| `inbox_shore`（18） | 水の別案 3、岸の辺と角（`shore_n/s/e/w/nw/ne/sw/se`）、流れる水 2、砂 | `2hzm (3)` |
| `inbox_stone_edge`（19） | 縁取りした石の床の 4×2 枠（`stone_frame_*`）、ひび・欠け・穴の別案 | `2hzm (2)` |
| `inbox_gold_path`（10） | 金の縁取りの道（横 `gold_path_h_*`・縦 `gold_path_v`）、縁の辺と角、ひび・裂けた地面 | `2hzm` |

- 草と土は、土の北と南の縁（上下だけが草）が原画にない。角と東西の縁だけで組む
- 横視点の草のタイルは上に草の先が透明に出る（固いタイルだが、上の数ドットは空が見える）

## 3. 取り込むときに直したこと

| 原画 | 規則から外れていた点 | 直し方 |
|---|---|---|
| `Designer (15)` | 光彩・ぼかし・周りの星の粒 | 暗い背景に近い光彩を背景として落とし、宝石の本体だけを切り抜いて 8 色にした。「回転 8 フレーム」とあるが実際は 7 コマなので 7 コマで作った |
| `Designer (14)` `(15)` `(12)` | 見出し・ラベルの文字 | 文字の行を避けて切り抜いた（旅人のポーズは見出しの下から） |
| `Designer (12)` | 休憩の絵に焚き火が混ざる | 人物だけを切り抜いた |
| `dcirh1 (2)` | 背景が2種類のマゼンタ、瓶のまわりの光の輪 | 両方を背景として扱った。**ガラスの中はマゼンタに近い紫なので透明になる**（ガラス越しに床が見える） |
| `dcirh1 (2)` | コマの大きさがばらばら（広がる粒のコマ） | 大きさが合わない粒のコマ2つを除き、消えていく3コマは `bottle_send_fade` に分けた |
| `dcirh1` `dcirh1 (1)` `(3)` | ルーン・光る核・光る瓶の光彩 | 不透明な色の段に置き換えた（外側の光は落ちる） |
| JPEG の画像すべて | 圧縮のにじみ | ドットの中央付近の色だけで決めて、色数を落とした |
| `2hzm (3)` | 2・3段目のマスが縦に短い（正方形でない） | 16×16 に引き伸ばした。岸の曲線が少し縦長になる |
| `6.png` | 明るい灰色の背景・白いカード | 近い明るい色をまとめて背景として扱った。床に落ちる影は残した（当たり判定の目安になる） |

## 4. 取り込まなかったもの

| 原画 | 理由 | どうするか |
|---|---|---|
| `Designer (14)` の 01・12 | 茶色の髪・赤い服の少女で、既存作品（ゆめにっき）の主人公に似て見えるおそれ（CLAUDE.md の「既存作品のキャラクターは使わない」） | 形を変えた別案のプロンプトを用意した（art_requests.md の E2） |
| `2.png`〜`5.png` | 物が白い台座・格子・見出しとつながっていて切り離せない | 良いもの（不自然な扉 3、蔦の門、赤い扉、ゴシックのアーチ、眠る天使の像、注ぎ口の長いやかん、石像 4、階段・斜面の台）をマゼンタ背景で出し直してもらう（G） |
| `c8av (3)` | 街灯の頭だけで柱が切れている。パネルごとに背景色が違う | 点灯・消灯の対として出し直してもらう（G） |
| `dcirh1 (3)` のメダル | 上端が切れている | 硬貨は `dcirh1` で足りる |
| `dcirh1 (3)` の空の瓶（ピンク） | ガラスの色がマゼンタとほぼ同じで、背景と区別できない | 送り瓶 `bottle_send` で足りる |
| `Designer (12)` の顔絵・崖の風景 | 顔絵は使う場所がない。風景は城と青空の普通のファンタジーで夢の雰囲気と離れる | 使わない |
| `q9yd` ×4（SF 一式） | ネオンの SF は「静かで少し不気味な夢」と雰囲気が大きく違う。化けた文字・見出しもある | 「電子の夢」のエリアを作ると決めたら、まとめて取り込む |
| `materials_preview` | 既存のゲームの名前が見出しにある。アイコンに流線が付いていて、文字も化けている | 使わない。エリア固有の素材は D1 で頼む |

## 5. 決めてもらったこと（2026-10-17）

1. 木・ベンチ・街灯 18 個の当たり判定 → 仮の値のまま確定（`provisional: false`）
2. プレイヤーの大きさ → 規則を **17×24** に直した（PIXEL_STYLE・art/player/README・CLAUDE.md）
3. 夢のかけら 10 種 → **レア度**で使い分ける（[04_progression.md](design/04_progression.md)）
4. 通貨 → 硬貨を**価値**で使い分ける（[07_economy_and_bases.md](design/07_economy_and_bases.md)）
5. SF 一式 → **エリアによって**使い分ける。3 回目で取り込んだ（`sf_`）
6. 住人・追跡者の割り当て → まだ（追跡者の仕組みができてから）

---

# 3 回目の仕分け（2026-10-17、足りない素材として足された 22 枚）

[art_requests.md](art_requests.md) のプロンプトで作ってもらった絵。メモ（`.md`）はどれにもない。
**どのエリアにもまだ置いていない**。物の当たり判定は、プロンプトの「当たり判定の案」を入れた仮（`provisional: true`）。

## 1. どの絵をどこに使ったか

| 原画 | 頼んだもの | 取り込んだもの |
|---|---|---|
| `Designer (6)` | A1 エフェクトのアイコン | `effect_balloon` `effect_upside_down` `effect_umbrella` `effect_tiny` `effect_fish` `effect_lantern` `effect_glasses` `effect_stopped_clock`（16×16） |
| `Designer (19)` | A2 エフェクトを使った姿 | `traveler_<エフェクト>` ×8（`idle_down` `walk_down` `idle_right` `walk_right`）。小人は 15、魚は 11 ドットの高さ |
| `Designer (18)` | A3 エフェクトの木 | `effect_tree`（37×64、アニメーション `stage0` `stage1` `stage2`）と物 |
| `Designer (17)` | A4 揺れる・落ちているかけら | `shard_unstable`（4 コマ）・`shard_floor` |
| `Designer (16)` | A5 mood の印 | `mood_black/white/red/blue/green`（形と模様が違う）・`mood_flower/bird/wind/moon`（12×12） |
| `ujuhb…` / `Code_Generated_Image` | A6 漂う粒 | `particle_petal/feather/wind/moon`（8×8・3 コマ）と、その別案 `particle_*_b`（原寸どおりの格子の絵） |
| `xv1u…` | A7 mood を変える仕掛け | `flowers_pale`（`idle`・`trampled`）・`birds_flock`・`birds_fly`・`puddle_moon`（`idle`・`shimmer`）・`statue_chair`・`light_pillar_<色>` ×5 |
| `eyc7…` | B1 横視点の夜の石 | タイルセット `night_side`：4×4 の岩の塊 `night_block_*`、4×2 の薄い塊 `night_slab_*`、はしご `night_ladder_a/b`。上だけ乗れる足場は `night_platform_oneway`（スプライト） |
| `qke0…` | B1 の追加 | タイルセット `night_stone_more`（77）：塗り 14・壁と角 28・天井の下面 7・はしご 7 種 × 上下・階段 7 種 × 上下 |
| `ak68…` | B2 逆さの水族館 | タイルセット `coral_glass`（38）：縁 6、塗りと角は 2×2 で1組、垂れる珊瑚は 2×2（下の段は固くない） |
| `yow35…` / `3v5z…` | B3 室内・B4 出入口 | タイルセット `indoor`：木の床 3・絨毯の 9 分割（12 枚）・壁紙 3・赤いワープの床。物：`door_wall`・`doorway_wall`・`floor_hole`・`stairs_down`・`doorway_dark`・`warp_mark`（3 コマ） |
| `ajc4…` | B5 背景 | `content/assets/images/backgrounds/promenade_far/mid/near.png`（480 × 95 / 91 / 73、左右がつながる） |
| `7z29…` | C UI | `ui_window`（24×24）・`ui_slot`・`ui_slot_selected`（20×20）・`ui_cursor`・`ui_heart_full/half/empty`・`ui_map_base/warp/fragment_open/fragment_got/here`・`ui_depth_meter` |
| `ofnav…` | D1 エリア固有の素材 | アイコン `item_rust` `item_scales` `item_feather` `item_glass_sand` `item_night_dew` と、持ち物 `content/items/` の 5 種（重さは仮：錆・砂 2、ほか 1） |
| `i2bk…` | D2 拠点の設備 | `mood_switcher`・`workbench`・`diary_shelf` と物 |
| `wh8eg…` | E1 横視点の空中の姿 | `traveler_air`（`jump_side` 2・`fall_side` 2・`land_side` 1・`blown` 4） |
| `60357j…` | F 日記の挿絵 | `content/assets/images/diary/promenade_lamps.png`（64×48）と大きい版 `promenade_lamps_large.png`（160×120） |
| `vwtoa…` | G 説明図の出し直し（1 枚目） | `door_red_open`・`arch_gothic`・`statue_angel_sleep`・`kettle_longspout`・`door_iron_plain`・`door_ring_handle`・`door_double_uneven`・`arch_wisteria` と物 |
| `cqzd…` | G 街灯の点灯・消灯 | `lamp_post`（`idle` = 消灯、`lit` = 点灯 2 コマ）と物 |
| `q9yd` ×4（前回保留） | SF 一式（決定 44） | タイルセット `sf_dream`（65：見下ろしの床 35、横視点の壁・角・斜め 30）、物・アイコン 93（`sf_server_racks_*` `sf_console_*` `sf_gate_*` `sf_warp_ring(_open)` `sf_door_*` `sf_tube_*` `sf_cell_*` `sf_glitch_*` `sf_battery_*` `sf_bot_*` ほか）。置ける物 28 個は物として定義 |
| `uorg8…` | E2 住人 01 の作り直し | **取り込まない**（下の 3） |

## 2. 取り込むときに直したこと

| 原画 | 問題 | 直し方 |
|---|---|---|
| `Designer (19)` | 同じ動きの中でコマの描かれた大きさが 15% ほど違う（1・2 段目が大きい） | 加工ツールに `normalize` を足し、コマごとに切り詰めて高さをそろえた |
| `Designer (19)` | 右向きの段で、片方の列に効果がない（風船・傘）、ランタンの列に眼鏡が混ざる | 効果を持っているコマだけを使った。**ランタンの右向きは眼鏡をかけたまま** |
| `Designer (19)` `ajc4` | 縁にマゼンタが混ざった色が残る | 加工ツールに `defringe` を足して落とした |
| `xv1u` `7z29` | 見出し・寸法の英語の文字が絵の中にある | 文字を避けて切り抜いた |
| `3v5z` | 「access denied」の札（`q9yd (2)` の扉）・不要な紫の帯（`yow35`） | 札を切り取り、帯は使わなかった |
| `qke0` | 1 段目の上端のタイルが薄い板で、上が空。そのまま 16×16 にすると歩ける面が 7 ドット下がって浮いて見える | 1 段目は使わず、上端は `eyc7` の `night_block_*` を使う |
| `eyc7` | 足場の左端のマスにはしごの先が重なる | 足場を 4 枚のタイルにせず、1 つのスプライトにした |
| `ak68` `yow35` | マスが 16 の格子でなく、大きさもばらばら | 縦横比が近くなるように 1 枚・2 枚・2×2 に分けた |
| `ajc4` | 3 つの層が 1 枚の上下に並んでいる | 帯ごとに切って 3 枚にした。幅 480 にそろえたので、原画の 1 ドットが 2px ほどになる |
| `7z29` | 頼んだ大きさ（カーソル 8×8・ハート 9×8 など）より細かく描かれている | 枠とマスは頼んだ大きさに、ほかは原画の格子どおり（カーソル 13×11、ハート 13×12、地図の印 11×11、メーター 11×54） |

## 3. 気になる点

- **`uorg8`（黄色いレインコートの子ども）は取り込まなかった**。フードで目が隠れた黄色いレインコートの子どもは、別のゲーム（Little Nightmares）の主人公によく似ている。頼んだプロンプト（art_requests.md の E2）の書き方が原因なので、形を変えたプロンプトに直した
- **エフェクトの姿（`Designer (19)`）は、旅人より丸く簡単な絵柄**で、同じ人物に見えにくい。使えるが、並べると違和感がある。旅人に合わせて描き直すなら art_requests.md の A2 を使う
- 横視点の階段・斜めの角は、形どおりの当たり判定がない（マス全体が固い）。上だけ乗れる足場も物理が未対応
- 背景と日記の挿絵は PNG にしたが、**画面に出す画像のレイヤーがまだない**（今の背景は手続きで描いている）

## 4. 加工ツールに足したこと（`tools/import-art.ts`）

- `normalize`：コマごとに切り詰めて、高さ `height`（アニメーションごとに `heights`）にそろえる。`scale` と一緒に書くと、縮尺はそのままでコマごとに切り詰めるだけにする
- `defringe`：背景との境目の、マゼンタが混ざった色のドットを落とす（紫・ピンクの物には使わない）
- `images`：大きい絵を、色数を整えた原寸の PNG にして `content/assets/images/<id>.png` に書き出す
