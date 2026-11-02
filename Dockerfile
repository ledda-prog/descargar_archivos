FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PYTHONUNBUFFERED=1 \
    YT_DLP_PATH=/opt/yt-dlp-venv/bin/yt-dlp \
    FFMPEG_PATH=/usr/bin/ffmpeg

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 python3-pip python3-venv \
    && python3 -m venv /opt/yt-dlp-venv \
    && /opt/yt-dlp-venv/bin/pip install --no-cache-dir yt-dlp \
    && apt-get purge -y --auto-remove python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY worker/package.json worker/package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node backend ./backend
COPY --chown=node:node worker/worker.js ./worker/worker.js

USER node
CMD ["node", "worker/worker.js"]
