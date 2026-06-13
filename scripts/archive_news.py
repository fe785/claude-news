"""
archive_news.py — 1ヶ月以上前のニュースファイルをアーカイブする

アーカイブ先: news/archive/YYYY-MM/
状態ファイル: news/.archive_state.json  （last_archived: "YYYY-MM"）
"""

import json
import os
import shutil
from datetime import date, timedelta
from pathlib import Path
from typing import Optional


def run_archive(dry_run: bool = False) -> int:
    """
    1ヶ月より古いニュースファイルを news/archive/YYYY-MM/ へ移動する。
    Returns: アーカイブしたファイル数（md換算）
    """
    news_dir = Path("news")
    archive_dir = news_dir / "archive"

    today = date.today()
    # 「今月 + 先月」を保持 → 先月初日より前をアーカイブ
    if today.month == 1:
        cutoff = date(today.year - 1, 12, 1)
    else:
        cutoff = date(today.year, today.month - 1, 1)

    print(f"アーカイブ対象: {cutoff} より前のファイル")

    # archive/index.json を読み込む
    archive_index_path = archive_dir / "index.json"
    if archive_index_path.exists():
        with open(archive_index_path, encoding="utf-8") as f:
            archive_index = json.load(f)
    else:
        archive_index = {}

    archived_count = 0

    for md_file in sorted(news_dir.glob("news_*.md")):
        date_str = md_file.stem.replace("news_", "")
        try:
            file_date = date.fromisoformat(date_str)
        except ValueError:
            continue

        if file_date >= cutoff:
            continue  # 保持対象

        month_str = date_str[:7]  # "YYYY-MM"
        month_dir = archive_dir / month_str

        # 関連する3ファイルをまとめて移動
        related = [
            news_dir / f"news_{date_str}.md",
            news_dir / f"tags_{date_str}.json",
            news_dir / f"translations_{date_str}.json",
        ]

        if dry_run:
            print(f"  [DRY-RUN] {date_str} → archive/{month_str}/")
        else:
            month_dir.mkdir(parents=True, exist_ok=True)
            for src in related:
                if src.exists():
                    shutil.move(str(src), str(month_dir / src.name))

            if month_str not in archive_index:
                archive_index[month_str] = []
            fname = f"news_{date_str}.md"
            if fname not in archive_index[month_str]:
                archive_index[month_str].append(fname)

        archived_count += 1

    if archived_count == 0:
        print("アーカイブ対象のファイルはありません")
        _update_state(news_dir, today)
        return 0

    if not dry_run:
        # archive/index.json を保存（月ごとにソート済みリスト）
        for m in archive_index:
            archive_index[m] = sorted(archive_index[m])
        archive_dir.mkdir(parents=True, exist_ok=True)
        with open(archive_index_path, "w", encoding="utf-8") as f:
            json.dump(archive_index, f, ensure_ascii=False, indent=2)

        # news/index.json を残存ファイルで更新
        remaining = sorted(
            [fp.name for fp in news_dir.glob("news_*.md")],
            reverse=True,
        )
        with open(news_dir / "index.json", "w", encoding="utf-8") as f:
            json.dump(remaining, f, ensure_ascii=False)

        _update_state(news_dir, today)
        print(f"✅ {archived_count} 日分をアーカイブしました → news/archive/")

    return archived_count


def _update_state(news_dir: Path, today: date) -> None:
    state_path = news_dir / ".archive_state.json"
    with open(state_path, "w", encoding="utf-8") as f:
        json.dump({"last_archived": today.strftime("%Y-%m")}, f)


def should_archive(news_dir: Optional[Path] = None) -> bool:
    """今月まだアーカイブを実行していない場合に True を返す"""
    if news_dir is None:
        news_dir = Path("news")
    state_path = news_dir / ".archive_state.json"
    if not state_path.exists():
        return True
    with open(state_path, encoding="utf-8") as f:
        state = json.load(f)
    this_month = date.today().strftime("%Y-%m")
    return state.get("last_archived") != this_month


if __name__ == "__main__":
    import sys
    dry = "--dry-run" in sys.argv
    run_archive(dry_run=dry)
