FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 python3-pip python3-venv \
  && python3 -m venv /opt/yt-dlp-venv \
  && /opt/yt-dlp-venv/bin/pip install --no-cache-dir yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY backend ./backend
COPY worker ./worker

ENV NODE_ENV=production
ENV YT_DLP_PATH=/opt/yt-dlp-venv/bin/yt-dlp
ENV FFMPEG_PATH=/usr/bin/ffmpeg

CMD ["node", "worker/worker.js"]
