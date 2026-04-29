#!/usr/bin/env python3
"""
ITエンジニアニュース収集スクリプト
ソース: Hacker News API, Zenn RSS, Qiita RSS,
       Apple Developer News, Android Developers Blog,
       9to5Mac, 9to5Google
出力: news/news_YYYY-MM-DD.md
"""

import json
import os
import re
import sys
from datetime import datetime
from urllib.request import urlopen, Request
from urllib.error import URLError
import xml.etree.ElementTree as ET


def _load_dotenv() -> None:
    """プロジェクトルートの .env を読み込む"""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
    if not os.path.exists(env_path):
        return
    with open(env_path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, val = line.partition('=')
            os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))

_load_dotenv()

# ── 設定 ──────────────────────────────────────────────────────────────────────

HN_TOP_STORIES_URL = "https://hacker-news.firebaseio.com/v0/topstories.json"
HN_ITEM_URL        = "https://hacker-news.firebaseio.com/v0/item/{}.json"
HN_FETCH_COUNT     = 20   # 取得するHN記事数

ZENN_RSS_URL         = "https://zenn.dev/feed"
QIITA_RSS_URL        = "https://qiita.com/popular-items/feed"
APPLE_DEV_RSS_URL    = "https://developer.apple.com/news/rss/news.rss"
ANDROID_DEV_RSS_URL  = "https://feeds.feedburner.com/blogspot/hsDu"
NINE_TO_5_MAC_RSS    = "https://9to5mac.com/feed/"
NINE_TO_5_GOOGLE_RSS = "https://9to5google.com/feed/"

RSS_FETCH_COUNT = 10  # 各RSSから取得する記事数

OUTPUT_DIR = "news"

# ── ユーティリティ ─────────────────────────────────────────────────────────────

# 一部サイトは UA なしだと弾かれるため共通の UA を設定
_UA = "Mozilla/5.0 (compatible; NewsBot/1.0)"


def fetch_json(url: str):
    try:
        req = Request(url, headers={"User-Agent": _UA})
        with urlopen(req, timeout=10) as res:
            return json.loads(res.read().decode())
    except (URLError, json.JSONDecodeError) as e:
        print(f"  [警告] JSONの取得に失敗しました: {url}\n  理由: {e}", file=sys.stderr)
        return None


def fetch_xml(url: str):
    try:
        req = Request(url, headers={"User-Agent": _UA})
        with urlopen(req, timeout=10) as res:
            return ET.fromstring(res.read())
    except (URLError, ET.ParseError) as e:
        print(f"  [警告] RSSの取得に失敗しました: {url}\n  理由: {e}", file=sys.stderr)
        return None


# ── Hacker News ────────────────────────────────────────────────────────────────

def fetch_hacker_news(count: int = HN_FETCH_COUNT):
    """HN Top Stories から上位 count 件を返す"""
    print("Hacker News を取得中...")
    ids = fetch_json(HN_TOP_STORIES_URL)
    if not ids:
        return []

    articles = []
    for story_id in ids[:count]:
        item = fetch_json(HN_ITEM_URL.format(story_id))
        if item and item.get("type") == "story" and item.get("url"):
            articles.append({
                "title": item.get("title", "(タイトルなし)"),
                "url":   item.get("url", f"https://news.ycombinator.com/item?id={story_id}"),
                "score": item.get("score", 0),
                "by":    item.get("by", ""),
                "hn_url": f"https://news.ycombinator.com/item?id={story_id}",
            })

    # スコア降順に並べ替え
    articles.sort(key=lambda x: x["score"], reverse=True)
    print(f"  → {len(articles)} 件取得")
    return articles


# ── 汎用 RSS / Atom パーサ ─────────────────────────────────────────────────────

def fetch_rss(url: str, source_name: str, count: int = RSS_FETCH_COUNT):
    """RSS 2.0 / Atom フィードから最新 count 件を返す"""
    print(f"{source_name} RSS を取得中...")
    root = fetch_xml(url)
    if root is None:
        return []

    # RSS 2.0 と Atom の両方に対応
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    items = root.findall(".//item") or root.findall(".//atom:entry", ns)

    articles = []
    for item in items[:count]:
        # タイトル（Element の truth value が deprecated なので is not None で判定）
        title_el = item.find("title")
        if title_el is None:
            title_el = item.find("atom:title", ns)
        title = (title_el.text or "").strip() if title_el is not None else "(タイトルなし)"

        # URL（RSS の <link> または Atom の <link href="...">）
        link_el = item.find("link")
        if link_el is None:
            link_el = item.find("atom:link", ns)
        if link_el is None:
            continue
        url_str = (link_el.text or link_el.get("href", "")).strip()
        if not url_str:
            continue

        # 著者（あれば）
        author_el = item.find("dc:creator", {"dc": "http://purl.org/dc/elements/1.1/"})
        if author_el is None:
            author_el = item.find("author")
        if author_el is None:
            author_el = item.find("atom:author/atom:name", ns)
        author = (author_el.text or "").strip() if author_el is not None else ""

        articles.append({"title": title, "url": url_str, "author": author})

    print(f"  → {len(articles)} 件取得")
    return articles


# ── Markdown 生成 ──────────────────────────────────────────────────────────────

def _rss_section(lines, heading, articles):
    """汎用 RSS セクションを lines に追加する"""
    lines += [heading, ""]
    if articles:
        for i, a in enumerate(articles, 1):
            author_str = f" — *{a['author']}*" if a["author"] else ""
            lines.append(f"{i}. [{a['title']}]({a['url']}){author_str}")
        lines.append("")
    else:
        lines += ["取得できませんでした。", ""]


def build_markdown(date_str, hn_articles, zenn_articles, qiita_articles,
                   apple_articles, android_articles,
                   mac_articles, google_articles):
    lines = [
        f"# ITエンジニアニュース — {date_str}",
        "",
        "> 自動収集: Hacker News / Zenn / Qiita / Apple Developer / Android Developers Blog / 9to5Mac / 9to5Google",
        "",
    ]

    # ── Hacker News ──
    lines += ["## 🔥 Hacker News — Top Stories", ""]
    if hn_articles:
        for i, a in enumerate(hn_articles, 1):
            lines.append(f"### {i}. [{a['title']}]({a['url']})")
            lines.append(f"- スコア: **{a['score']}** | 投稿者: {a['by']}")
            lines.append(f"- HNコメント: {a['hn_url']}")
            lines.append("")
    else:
        lines += ["取得できませんでした。", ""]

    # ── 日本語サイト ──
    _rss_section(lines, "## 📘 Zenn — トレンド",      zenn_articles)
    _rss_section(lines, "## 📗 Qiita — 人気記事",    qiita_articles)

    # ── Apple / Android ──
    _rss_section(lines, "## 🍎 Apple Developer News",         apple_articles)
    _rss_section(lines, "## 🤖 Android Developers Blog",      android_articles)

    # ── モバイル系メディア ──
    _rss_section(lines, "## 🖥️ 9to5Mac",    mac_articles)
    _rss_section(lines, "## 🌐 9to5Google", google_articles)

    # フッター
    lines += [
        "---",
        f"*生成日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*",
    ]

    return "\n".join(lines)


# ── インデックス更新 ───────────────────────────────────────────────────────────

def update_index(output_dir: str) -> None:
    """news/ ディレクトリ内の Markdown ファイル一覧を index.json に保存する"""
    files = sorted(
        [f for f in os.listdir(output_dir) if f.startswith("news_") and f.endswith(".md")],
        reverse=True,
    )
    index_path = os.path.join(output_dir, "index.json")
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(files, f, ensure_ascii=False)
    print(f"  → インデックス更新: {index_path} ({len(files)} ファイル)")


# ── HNタイトル翻訳 ────────────────────────────────────────────────────────────

def translate_hn_titles(articles: list, date: str) -> None:
    """HN記事タイトルを日本語に翻訳して translations_YYYY-MM-DD.json に保存する"""
    output_path = os.path.join(OUTPUT_DIR, f"translations_{date}.json")
    if os.path.exists(output_path):
        print(f"  [スキップ] 翻訳済みファイルが存在します: {output_path}")
        return

    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print("  [スキップ] ANTHROPIC_API_KEY が未設定のため翻訳をスキップします")
        return

    try:
        import anthropic
    except ImportError:
        print("  [スキップ] anthropic パッケージが未インストールです (pip install anthropic)")
        return

    print("HNタイトルを翻訳中 (Anthropic API)...")
    titles_text = "\n".join(f"{i + 1}. {a['title']}" for i, a in enumerate(articles))

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        system=(
            "ITエンジニア向けニュースの英語タイトルを日本語に翻訳します。"
            "番号付きリストで与えられた各タイトルを、同じ番号付きで自然な日本語に翻訳してください。"
            "固有名詞・製品名・ブランド名はそのまま残してください。翻訳のみを返してください。"
        ),
        messages=[{"role": "user", "content": titles_text}],
    )

    text = message.content[0].text
    ja_titles = [""] * len(articles)
    for line in text.split("\n"):
        m = re.match(r"^(\d+)\.\s+(.+)", line.strip())
        if m:
            idx = int(m.group(1)) - 1
            if 0 <= idx < len(articles):
                ja_titles[idx] = m.group(2).strip()

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({"date": date, "hn": ja_titles}, f, ensure_ascii=False, indent=2)

    print(f"  → 翻訳保存完了: {output_path} ({len([t for t in ja_titles if t])} 件)")


# ── エントリポイント ───────────────────────────────────────────────────────────

def main() -> None:
    today = datetime.now().strftime("%Y-%m-%d")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output_path = os.path.join(OUTPUT_DIR, f"news_{today}.md")

    print(f"=== ITニュース収集開始: {today} ===\n")

    hn_articles      = fetch_hacker_news()
    zenn_articles    = fetch_rss(ZENN_RSS_URL,         "Zenn")
    qiita_articles   = fetch_rss(QIITA_RSS_URL,        "Qiita")
    apple_articles   = fetch_rss(APPLE_DEV_RSS_URL,    "Apple Developer")
    android_articles = fetch_rss(ANDROID_DEV_RSS_URL,  "Android Developers Blog")
    mac_articles     = fetch_rss(NINE_TO_5_MAC_RSS,    "9to5Mac")
    google_articles  = fetch_rss(NINE_TO_5_GOOGLE_RSS, "9to5Google")

    md = build_markdown(
        today,
        hn_articles, zenn_articles, qiita_articles,
        apple_articles, android_articles,
        mac_articles, google_articles,
    )

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(md)

    translate_hn_titles(hn_articles, today)
    update_index(OUTPUT_DIR)

    print(f"\n✅ 保存完了: {output_path}")
    print(
        f"   HN: {len(hn_articles)} 件 / Zenn: {len(zenn_articles)} 件 / Qiita: {len(qiita_articles)} 件 / "
        f"Apple: {len(apple_articles)} 件 / Android: {len(android_articles)} 件 / "
        f"9to5Mac: {len(mac_articles)} 件 / 9to5Google: {len(google_articles)} 件"
    )


if __name__ == "__main__":
    main()
