# 足りない素材と、画像生成 AI に頼むプロンプト（2026-10-17・3 回目の仕分けで更新）

`art/inbox/` を仕分けた結果（[art_inbox_review.md](art_inbox_review.md)）、設計書にあるのに原画がない素材と、そのまま出し直してもらうためのプロンプト。
上の節ほど本編に近い（先に頼むとよい）。

## いまの状況

A〜G はほぼそろった（取り込み先は [art_inbox_review.md](art_inbox_review.md) の「3 回目の仕分け」）。**まだ足りないのは次の H 節のもの**と、出来の気になる 2 つ（A2・E2）。

| 状況 | 節 |
|---|---|
| 取り込み済み | A1・A3〜A7・B1〜B5・C（キーの絵を除く）・D1・D2・E1・F（1 枚）・G の 1 枚目・街灯 |
| 頼み直す | **E2**（レインコートの子どもが既存作品に似ていたので、プロンプトを直した）、A2（任意：絵柄を旅人に合わせたいとき） |
| まだ頼んでいない | **H 節**（G の 2 枚目、住人 12 の作り直し、キーの絵、日記の枠、ほかのエリアの背景と挿絵） |

## 使い方

1. 下の「共通の前置き」をコピーし、その後ろに各プロンプトを続けて画像生成 AI に渡す
2. 出来上がった画像は `art/inbox/` に入れる。物は同じ名前の `.md` に当たり判定を書く（各プロンプトの「当たり判定の案」をそのまま使ってよい）
3. チャットで「inbox に足した」と伝えれば、取り込んで `content/assets/` に加工する

- 1枚に何個か並べてもらう形にしている（画像生成 AI は1枚1個だと格子や大きさがぶれやすいので）。**並べた物どうしの間にマゼンタの隙間を広めに取る**ことが切り抜きのいちばんの条件
- 文字・見出し・寸法の札・台座は入れないよう、毎回はっきり書いてある。それでも入っていたら出し直してもらう
- 人物の大きさは、プレイヤー `traveler` と同じ **17×24**（決定 41）

### 共通の前置き（毎回これを先頭に付ける）

```
Pixel art for a quiet, surreal, slightly eerie dream-diary game (2D, small dream areas, side view and 3/4 top-down view).
Strict pixel art: every pixel is a perfect square on one uniform grid; draw each art pixel as an exact 8x8 block.
No anti-aliasing, no gradients, no blur, no glow, no bloom, no noise, no semi-transparent pixels.
Flat shading, at most 3 tones per material, light from the top-left.
Muted dark palette with one small bright accent; outlines in the darkest shade of each material, never pure black.
Background: one flat solid #FF00FF magenta everywhere outside the subjects. Do not use magenta or pink inside the art.
No ground shadow on the background, no scenery, no pedestals, no floor tiles under objects.
No text, no letters, no numbers, no labels, no captions, no size tags, no signature, no watermark.
Original design, not based on any existing game or character.
Leave at least 4 art pixels of empty magenta between separate items. Keep every item fully inside the image (nothing cut off at the edges).
```

---

## A. 進行の中心（夢のかけら・エフェクト・mood）

### A1. エフェクトのアイコン 8種（`art/effects/`）
設計：[04_progression.md](design/04_progression.md)。風船・逆さ・傘・小人・魚・ランタン・眼鏡・止まった時計。

```
A sheet of 8 item icons in a 4x2 grid, each icon 16x16 art pixels with a 1-pixel empty margin, centered.
Each icon must be recognizable by silhouette alone, max 8 colors each:
1 a single balloon on a string, 2 a small person standing upside down, 3 a closed black umbrella,
4 a tiny person next to a large shoe (being small), 5 a small fish, 6 a hand lantern with a warm flame,
7 round glasses, 8 a pocket clock whose hands have stopped, with a small crack on the glass.
```

### A2. エフェクトを使ったときの姿（8種、1枚に1種）
`<effect>` を A1 の各種に差し替えて8回頼む。向きは下・右の2方向でよい（足りない向きは元の姿で表示される）。

```
A character sprite sheet of one traveler, 17x24 art pixels per frame, feet on the bottom edge of every frame.
The traveler: about 2.5 heads tall, silver hair, blue bandana and blue scarf, dark blue clothes, small brown backpack, 1-pixel eyes.
Effect: <the traveler holding a balloon and floating slightly / standing upside down with hair hanging down / holding an open umbrella above the head / shrunk to half size (same canvas, feet still at the bottom) / turned into a small fish with the bandana / holding a lit lantern / wearing round glasses / holding a stopped pocket clock>.
Two rows: row 1 facing down (front), row 2 facing right. Each row: 2 idle frames then 4 walk frames, all frames the same size, in one horizontal line with even spacing.
```

### A3. エフェクトの木（ベッドの部屋に置く物）
```
One top-down 3/4 view object: a small strange tree that holds glowing round fruits shaped like tiny icons, 48x64 art pixels, base touching the bottom edge.
Draw 3 versions side by side (growth stages): bare branches with no fruit / three fruits lit / many fruits lit.
Only the top face and front face visible, no side faces.
```
当たり判定の案：見下ろし 横 1 マス × 奥行き 1 マス（幹だけ）。

### A4. 揺れるかけら・落ちているかけら
今ある10種の「夢のかけら」（`shard_*`）とは別に、状態の見た目がない。

```
A sheet with two rows of 16x16 icons of a small dream crystal shard.
Row 1 "unstable shard": 4 frames, the shard flickers and its outline breaks into 1-pixel gaps in different places each frame.
Row 2 "shard lying on the floor": 1 frame seen from 3/4 top-down, lying flat with a small dark contact shadow under it.
```

### A5. mood の印（`art/ui/`）
色5つ（黒・白・赤・青・緑）と要素4つ（花・鳥・風・月）。**色だけでなく形と模様でも見分けられる**こと（色覚への配慮・必須）。

```
A sheet of HUD symbols, each 12x12 art pixels, two rows.
Row 1, five color marks, each a different shape AND a different inner pattern:
black = square with diagonal hatching, white = circle with a dot in the center, red = triangle with horizontal stripes,
blue = water drop with a wave line, green = leaf shape with a center vein. Use dark gray, off-white, muted red, muted blue, muted green.
Row 2, four element marks in one neutral light gray: flower (5 petals), bird (side silhouette), wind (two curled lines), moon (crescent).
Every symbol has a 1-pixel dark outline so it reads on any background. Lines at least 2 pixels thick.
```

### A6. mood の漂うもの（粒）
```
A sheet of tiny particle sprites, each in its own 8x8 cell, 4 rows of 3 animation frames:
row 1 a falling flower petal turning, row 2 a small drifting feather, row 3 a wind mote (a short streak),
row 4 a moonlight mote (a soft square sparkle, pale). Max 4 colors per particle, no glow.
```

### A7. mood を変える仕掛け（物）
設計：[02_mood.md](design/02_mood.md)。時計（`melting_clocks`）と鏡（`mirror_*`）はある。

```
A sheet of 5 top-down 3/4 view objects, each standing on the bottom of its own area, spaced apart:
1 a cluster of pale flowers on the ground, 32x16, two versions: upright / trampled flat;
2 a flock of five small dark birds standing on the ground, 32x16, plus 3 frames of them flying away;
3 a small round puddle reflecting a crescent moon, 32x16, 2 frames of a slight shimmer;
4 a narrow pillar of colored light falling from above onto the floor, 16x48, in five color versions: dark gray, white, red, blue, green (solid flat colors, no transparency);
5 a weathered stone statue of an empty chair with a stone figure sitting beside it, 32x48.
```
当たり判定の案：花・鳥・水たまり・光はなし（踏む・触れる・覗く・浴びる）。像は 横 2 × 奥行き 1。

---

## B. エリアを作るための基本

### B1. 横視点の地面（夜の石）
今あるのは手続きで描いた `night_stone` と、草の上端（`side_grass_top_*`）だけ。

```
A side-view (straight front view) terrain tile sheet, each tile exactly 16x16 art pixels, tiles touching each other in a clean grid with a 2-pixel magenta gap between tiles.
Material: dark violet night stone (#26243f, #3a2f55, #5a4a80), with a lighter 2-pixel walkable top edge.
Tiles: top edge (3 variations), inner fill (3 variations), left end of top, right end of top, left wall, right wall,
bottom-left corner, bottom-right corner, inner corner left, inner corner right, ceiling underside (flat bottom edge, 2 variations).
Plus a thin one-way platform 16x6 (left end, middle, right end), a ladder 16x16 that repeats vertically, and stairs going up to the right (16x16, 2 tiles).
Fill tiles must be fully opaque and tile seamlessly.
```

### B2. 逆さの水族館のタイル
```
Same rules as a side-view tile sheet, 16x16 tiles with a 2-pixel magenta gap between tiles.
Material: dark coral glass, teal and deep blue (#152a3d, #1f3d55, #13606a, #6fd1d9), slightly translucent look made only with flat colors.
This area is upside down: the walkable surface is on the BOTTOM side of each surface tile.
Tiles: surface (3 variations), fill (3 variations), left end, right end, corners, and small hanging corals 16x16 (3 kinds) that grow downward.
```

### B3. 見下ろしの室内（ベッドの部屋）
今は手続きで描いた `wall_violet`・`floor_wood`・`rug`。

```
A 3/4 top-down tile sheet, each tile 16x16 art pixels, with a 2-pixel magenta gap between tiles.
1 dark wooden floor boards (3 variations, seamless), 2 a dusty rose rug as a 3x3 nine-slice (corners, edges, center),
3 a violet wallpaper wall seen from the front: wall top cap, wall face (2 variations), wall base with a skirting board,
4 a closed wooden door set in that wall, 16x32, 5 a dark doorway opening in that wall, 16x32.
```

### B4. 出入口とワープの印（SF でない見た目）
```
A sheet of 3/4 top-down objects, spaced apart:
1 a round dark hole in the floor, 32x32; 2 narrow stone stairs going down into darkness, 16x32;
3 a warp mark: a circle of small white chalk marks with a keyhole shape in the center, 32x16, 3 frames of the marks slowly blinking;
4 a one-way warp mark: the same circle but cracked and drawn in red, 32x16;
5 a side-view doorway frame with nothing behind it (just darkness), 16x32.
```
当たり判定の案：すべてなし（調べる・触れると移動）。

### B5. 背景（パララックス、`art/backgrounds/`）
サンプルエリアの雰囲気に合わせた例。**遠景・中景・前景を別々の画像**で頼む（3回）。

```
A side-scrolling parallax background layer, 480x270 art pixels, the left and right edges must connect seamlessly for horizontal looping.
<far layer: a deep violet night sky with sparse stars and the faint flat silhouettes of tall thin towers, very low contrast.>
<middle layer: rolling dark hills with a few lone lamp posts, the sky part is flat magenta (transparent).>
<near layer: dark plant silhouettes and a broken railing only along the bottom 60 pixels, everything above is flat magenta.>
Far layers have less contrast and less detail; near layers are darker and larger.
```
逆さの水族館なら：遠景「水の中の暗い青、上下逆さの泡の列」、中景「天井から逆さに垂れる珊瑚と魚の影」。

---

## C. UI（`art/ui/`）

```
A UI parts sheet in a dark, quiet pixel style, spaced apart:
1 a window frame as a 9-slice: 24x24 total, 8x8 corners, thin violet border with a darker inner line;
2 an inventory slot 20x20 in two states: normal / selected (brighter border);
3 a small pointing hand cursor 8x8;
4 a heart for HP in three states 9x8: full / half / empty;
5 map markers 8x8 each: home base (small house), warp (circle with dot), uncollected fragment (hollow diamond), collected fragment (filled diamond), current position (small arrow);
6 a vertical depth meter 8x48 with 5 notches.
```
キーの絵（E・I・M・Esc・矢印・Space・Z・X）はこの節で唯一文字を入れてよいもの。必要になったら別に頼む。日本語の文字は絵にせず、再配布できるドットフォント（PixelMplus・美咲フォントなど）を使う。

---

## D. 素材・拠点

### D1. エリア固有の素材アイコン
設計：[07_economy_and_bases.md](design/07_economy_and_bases.md)。今の素材は木・鉱石・延べ棒など一般的なもの。

```
A sheet of 5 item icons in one row, each 16x16 art pixels with a 1-pixel margin, max 8 colors, recognizable by silhouette:
1 a few flakes of rust, 2 three iridescent fish scales, 3 a single gray feather, 4 a small heap of glittering glass sand, 5 a drop of night dew (dark blue with one white highlight).
```

### D2. 拠点の設備（段階2・3）
```
A sheet of 3 top-down 3/4 view objects, base on the bottom edge, spaced apart:
1 a mood switching device: a small pedestal with five colored glass knobs and a dial, 32x32;
2 a workbench with a vise and scattered tools, 32x32;
3 a glass display shelf for diary pages, with a few small framed pages inside, 32x48.
```
当たり判定の案：1 は 横 2 × 奥行き 1、2 は 横 2 × 奥行き 1、3 は 横 2 × 奥行き 1。

---

## E. 人物

### E1. プレイヤーの横視点の動き
`traveler_sit`・`traveler_sleep`（座る・眠る）は取り込み済み。

```
A side-view sprite sheet of the same traveler (silver hair, blue bandana and scarf, dark blue clothes, small brown backpack), 17x24 art pixels per frame, facing right, feet on the bottom edge.
One row each: jump rising (2 frames), falling (2 frames), landing (1 frame), caught and blown away spinning (4 frames).
```

### E2. 住人 01・12 の作り直し（2 回目）
1 回目の案（黄色いレインコートでフードが目を隠す子ども）は、別のゲームの主人公によく似てしまった。**レインコート・フード・黄色を避け**、形の違和感で不気味さを出す。

```
A character sprite sheet of one dream inhabitant, about 14x22 art pixels per frame, feet on the bottom edge.
Avoid raincoats, hoods, yellow clothing, red dresses and long black hair; the design must not resemble any existing game character.
<01: a small child wearing a gray knitted sweater that is far too long (it reaches the ankles), sleeves hanging past the hands, carrying a closed paper lantern. Short pale hair, no visible mouth. /
 12: a tall thin adult in a faded green coat, whose head is a smooth porcelain egg with a single painted smile line, arms slightly too long.>
Rows: walking right (4 frames), walking up/back (4 frames), walking down/front (4 frames), idle front (2 frames: the second frame is exactly the same except one pixel, so it feels wrong).
```

---

## F. 夢日記（`art/diary/`）

```
A single pixel art illustration, 64x48 art pixels, framed edge to edge (no border, no magenta needed),
showing the strangest moment of one dream: <a long dark promenade under the sea where lamp posts stand upside down on the ceiling>.
Quiet, muted, one small bright accent.
```
エリアごとに 1〜3 枚。ほかに、日記帳のページの枠（9分割）と、隠し実績用の黒く塗りつぶされたページが要る。

---

## G. 説明図（2〜6.png）からの出し直し

`2〜6.png` は白い台座・格子・見出しと物がつながっていて、きれいに切り抜けない（6.png のベンチ・街灯だけ取り込んだ）。良いものだけをマゼンタ背景で出し直してもらう。

```
A sheet of isometric dream furniture objects, each standing alone on flat magenta (no floor tiles, no pedestal, no labels), spaced far apart.
Isometric view is allowed. The lowest point of each floor footprint is at the bottom center of the object; add a flat dark contact shadow exactly covering the footprint.
Objects: an open red door standing alone with no wall, a violet gothic arch with nothing inside, a sleeping stone angel statue,
a white kettle with an absurdly long spout, an iron door with no keyhole, a wooden door with an oversized ring handle,
a double door whose two halves have different heights, an arch covered with purple wisteria vines.
Each object fits in about 32x32 to 32x48 art pixels.
```

```
Same rules. Objects: a standing human stone statue on a plinth, a stone bird statue, a large stone face statue, a broken statue with only the lower half,
a square stone pedestal, a round stone pedestal, a stone block with three steps, a stone block with a slope.
```
当たり判定の案：扉・アーチは 横 1〜2 × 奥行き 1（通り抜けるなら なし）。像・台座は 横 1〜2 × 奥行き 1。横視点で使う階段・斜めの台は「固い・高さ 1〜2 マス（上に乗れる）」。

### 街灯の点灯・消灯の対
`c8av (3)` は灯りの頭だけで柱が切れている。

```
One side-view street lamp, 16x48 art pixels, base on the bottom edge, two frames side by side: unlit (dark glass) / lit (warm bulb, light shown only by lighter flat colors inside the glass, no glow outside).
```

---

## H. まだ足りないもの

### H1. 説明図の出し直し（2 枚目：像と台座）
```
A sheet of isometric dream objects, each standing alone on flat magenta (no floor tiles, no pedestal under them, no labels), spaced far apart.
Isometric view is allowed. The lowest point of each floor footprint is at the bottom center of the object; add a flat dark contact shadow exactly covering the footprint.
Objects: a standing human stone statue on a plinth, a stone bird statue, a large stone face statue, a broken statue with only the lower half,
a square stone pedestal, a round stone pedestal, a stone block with three steps, a stone block with a slope.
Each object fits in about 32x32 to 32x48 art pixels.
```
当たり判定の案：像・台座は 横 1〜2 × 奥行き 1。横視点で使う階段・斜めの台は「固い・高さ 1〜2 マス（上に乗れる）」。

### H2. キーの絵（UI）
この節だけは文字を入れてよい。

```
A sheet of keyboard key caps for on-screen button hints, each key 13x13 art pixels (Space is 33x13), dark violet key with a lighter top face and a 1-pixel darker outline,
one bold light glyph centered on each key: E, I, M, X, Z, Esc, Space, and four arrow keys (up, down, left, right). Letters drawn with 2-pixel-thick strokes.
```

### H3. 日記帳の枠と、隠し実績のページ
```
1 a dream diary page frame as a 9-slice: 48x48 total, 12x12 corners, old pale paper with a thin dark violet border and small ink blots in the corners;
2 a diary page completely blacked out with heavy ink, only a few torn edges showing the paper, 64x48;
3 a small closed diary book icon, 16x16.
```

### H4. ほかのエリアの背景・日記の挿絵
B5（背景）と F（挿絵）のプロンプトを、エリアの雰囲気に合わせて書き換えて頼む。今あるのは「沈んだ遊歩道」の背景 1 組と挿絵 1 枚だけ。
- 逆さの水族館の背景：遠景「水の中の暗い青、上下逆さの泡の列」、中景「天井から逆さに垂れる珊瑚と魚の影」
- 電子の夢（SF）の背景：遠景「暗い紺の空間に、遠く並ぶ光の格子」、中景「沈んだサーバーラックの影」
- 終わらない野原・ベッドの部屋の日記の挿絵（各 1〜3 枚）
