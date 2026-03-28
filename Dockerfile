FROM python:3.12-slim

# Nginx をインストール
RUN apt-get update && apt-get install -y --no-install-recommends nginx \
    && rm -rf /var/lib/apt/lists/*

# アプリファイルを配置
WORKDIR /app
COPY scripts/ ./scripts/
COPY index.html ./
COPY style.css ./
COPY app.js ./

# news/ ディレクトリを作成（マウント先がなければここを使う）
RUN mkdir -p ./news

# Nginx の設定を上書き
COPY nginx.conf /etc/nginx/nginx.conf

# 起動スクリプト
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
