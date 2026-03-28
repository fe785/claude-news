#!/bin/sh
set -e

echo "=== ニュース収集を開始します ==="
python3 /app/scripts/fetch_news.py

echo "=== Nginx を起動します ==="
exec nginx -g "daemon off;"
