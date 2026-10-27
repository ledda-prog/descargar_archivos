'use strict';

const { get, put } = require('@vercel/blob');

const JOB_PREFIX = 'mediahub/jobs/';

function jobPath(id) {
  if (!/^[a-f0-9-]{36}$/i.test(String(id))) throw Object.assign(new Error('Identificador de descarga inválido'), { statusCode: 400 });
  return `${JOB_PREFIX}${id}.json`;
}

async function writeJob(job) {
  const stored = {
    id: job.id,
    status: job.status,
    progress: Number(job.progress) || 0,
    stage: job.stage || null,
    error: job.error || null,
    filename: job.filename || null,
    size: job.size || null,
    blob_path: job.blob_path || null,
    updated_at: new Date().toISOString(),
  };
  await put(jobPath(job.id), JSON.stringify(stored), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json; charset=utf-8',
    cacheControlMaxAge: 60,
  });
  return stored;
}

async function readJob(id) {
  const result = await get(jobPath(id), { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream).json();
}

module.exports = { jobPath, readJob, writeJob };
