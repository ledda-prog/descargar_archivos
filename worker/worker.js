'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { put } = require('@vercel/blob');
const { PollingQueueClient } = require('@vercel/queue');
const { download, publicExtractorError, updateProgress } = require('../backend/server');
const { startSafeProxy, validatePublicUrl } = require('../backend/security');
const { readJob, writeJob } = require('../backend/vercel-store');

const region = process.env.QUEUE_REGION || process.env.VERCEL_REGION || 'iad1';
const queue = new PollingQueueClient({ region });
const shutdown = new AbortController();
let currentController = null;

process.once('SIGTERM', () => {
  shutdown.abort();
  currentController?.abort();
});
process.once('SIGINT', () => {
  shutdown.abort();
  currentController?.abort();
});

async function processDownload(message) {
  const existing = await readJob(message.id);
  if (!existing || existing.status === 'cancelled') return;

  const job = { ...existing, status: 'processing', progress: 1, stage: 'Conectando con la plataforma' };
  await writeJob(job);
  const proxy = await startSafeProxy();
  const controller = new AbortController();
  currentController = controller;
  let tempDir = null;
  let lastSavedAt = 0;
  let lastCancellationCheck = 0;
  let pendingWrite = Promise.resolve();

  const saveProgress = (line) => {
    updateProgress(job, line);
    const now = Date.now();
    if (now - lastSavedAt < 1200) return;
    lastSavedAt = now;
    pendingWrite = pendingWrite.then(() => writeJob(job)).catch(() => {});
    if (now - lastCancellationCheck >= 5000) {
      lastCancellationCheck = now;
      readJob(job.id).then((latest) => {
        if (latest?.status === 'cancelled') controller.abort();
      }).catch(() => {});
    }
  };

  try {
    const url = await validatePublicUrl(message.url);
    const result = await download(url, message.format, String(message.quality), proxy.url, saveProgress, controller.signal);
    tempDir = result.tempDir;
    await pendingWrite;
    const latest = await readJob(message.id);
    if (latest?.status === 'cancelled') throw Object.assign(new Error('Descarga cancelada'), { name: 'AbortError' });

    job.progress = 98;
    job.stage = 'Guardando archivo';
    await writeJob(job);
    const blob = await put(`mediahub/files/${job.id}/${result.filename}`, fs.createReadStream(result.filePath), {
      access: 'private',
      addRandomSuffix: true,
      multipart: result.size > 100 * 1024 * 1024,
      contentType: message.format === 'audio' ? 'audio/mpeg' : 'video/mp4',
    });
    await writeJob({
      ...job,
      status: 'ready',
      progress: 100,
      stage: 'Listo para guardar',
      filename: result.filename,
      size: result.size,
      blob_path: blob.pathname,
    });
  } catch (error) {
    const cancelled = error.name === 'AbortError' || (await readJob(message.id))?.status === 'cancelled';
    await writeJob({
      ...job,
      status: cancelled ? 'cancelled' : 'failed',
      stage: cancelled ? 'Descarga cancelada' : 'No se pudo completar',
      error: cancelled ? null : publicExtractorError(error.message),
    });
  } finally {
    currentController = null;
    await proxy.close();
    if (tempDir) await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  while (!shutdown.signal.aborted) {
    const result = await queue.receive('mediahub-downloads', 'mediahub-worker-v1', processDownload, {
      limit: 1,
      visibilityTimeoutSeconds: 900,
    });
    if (!result.ok && result.reason === 'empty') {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
