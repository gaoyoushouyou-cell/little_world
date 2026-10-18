# little world — 設計書

ドットで表現された夢日記のような乱雑な世界を歩くゲームの設計書。
Claude Code とのチャットで世界観を受け取り、アセットとエリアを作って既存の世界につなげ、
未生成の範囲はユーザーがゲーム内エディタで直感的に作る。

> 状態：**設計段階（未実装）**。ここに書かれた内容はチャットでの議論で合意したもの。
> 「推奨」「仮」と書かれたものは暫定で、遊んでみて調整する。

## 文書一覧

| ファイル | 内容 |
|---|---|
| [00_overview.md](00_overview.md) | コンセプト、体験の柱、技術スタック、決定の記録 |
| [01_world_and_areas.md](01_world_and_areas.md) | エリア、視点と物理、レイヤー、接続、揺らぎ区域 |
| [02_mood.md](02_mood.md) | 5色 × 4要素 = 20 の mood |
| [03_depth.md](03_depth.md) | 眠りの深さ、狂い、沈み、負けたときの損失 |
| [04_progression.md](04_progression.md) | 夢のかけら、エフェクトの木、揺れるかけら、実績と夢日記、到達性 |
| [05_inhabitants_and_threats.md](05_inhabitants_and_threats.md) | 住人、追跡者、捕まる・負ける |
| [06_area_rules.md](06_area_rules.md) | エリア規則（ジャンプキング型・ゼルダ型など）、能力の層、戦闘 |
| [07_economy_and_bases.md](07_economy_and_bases.md) | 通貨と素材、拠点化、保管、上書き層 |
| [08_map.md](08_map.md) | 地図（モザイク表示）、作者用の地図エディタ |
| [09_editor_and_publishing.md](09_editor_and_publishing.md) | 作者エディタ、種、自分の夢、セーブ、GitHub 公開 |
| [10_ui.md](10_ui.md) | UI 方針、拡張できる UI、アクセシビリティ、ユーザビリティテスト |
| [11_architecture.md](11_architecture.md) | ファイル構成、プラグイン、条件の書き方、スキーマ、開発ツール |
| [12_conflicts.md](12_conflicts.md) | 矛盾の一覧と解決 |
| [13_open_questions_and_roadmap.md](13_open_questions_and_roadmap.md) | 未決事項と実装の段階 |
| [14_dev_atlas.md](14_dev_atlas.md) | 開発の地図帳（決定 69〜74、未実装）。MindBloom を改造した、到達性・依存関係・進み具合の検査と可視化 |

Claude Code が守る作業ルールはリポジトリ直下の [CLAUDE.md](../../CLAUDE.md) にある。
