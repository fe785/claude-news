# ITエンジニアニュース収集 — セットアップガイド

## ファイル構成

```
your-project/
├── scripts/
│   └── fetch_news.py              ← ニュース取得スクリプト（Python標準ライブラリのみ）
├── .claude/
│   ├── commands/
│   │   └── news.md                ← /news スラッシュコマンド（レガシー形式）
│   └── skills/
│       └── news/
│           └── SKILL.md           ← /news スキル（推奨形式・自然言語でも呼び出し可）
└── news/                          ← 収集結果の保存先（自動生成）
    └── news_YYYY-MM-DD.md
```

## セットアップ手順

### 1. ファイルを配置する

上記の構成通りにファイルをコピーしてください。
`scripts/` と `.claude/` はプロジェクトルートに置きます。

### 2. 動作確認（任意）

```bash
python3 scripts/fetch_news.py
```

`news/news_YYYY-MM-DD.md` が生成されれば成功です。  
外部ライブラリは不要です（Python 3.6+ の標準ライブラリのみ使用）。

## 使い方

### スラッシュコマンドで呼び出す

Claude Code のチャットで入力:

```
/news
```

キーワードフィルタ付き:

```
/news AI
/news Rust
/news セキュリティ
```

### 自然言語でも呼び出せる（Skills 形式を使う場合）

```
今日のITニュースを教えて
最新の技術トレンドは？
AIに関するニュースをまとめて
```

## カスタマイズ

`scripts/fetch_news.py` の先頭にある設定値を変更できます:

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `HN_FETCH_COUNT` | 20 | Hacker News から取得する記事数 |
| `RSS_FETCH_COUNT` | 10 | Zenn / Qiita から取得する記事数 |
| `OUTPUT_DIR` | `"news"` | Markdown の保存先ディレクトリ |

## ソース一覧

| ソース | URL | 形式 |
|--------|-----|------|
| Hacker News | `https://hacker-news.firebaseio.com/v0/` | JSON API |
| Zenn | `https://zenn.dev/feed` | RSS 2.0 |
| Qiita | `https://qiita.com/popular-items/feed` | RSS 2.0 |

すべて無料・APIキー不要で利用できます。
