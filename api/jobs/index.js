'use strict';

const crypto = require('node:crypto');
const { QueueClient } = require('@vercel/queue');
const { json, requirePost } = require('../_http');
const { isAllowedQuality } = require('../../backend/formats');
const { validatePublicUrl } = require('../../backend/security');
const { writeJob } = require('../../backend/vercel-store');

const queue = new QueueClient({ region: process.env.QUEUE_REGION || 'iad1' });

module.exports = async (req, res) => {
  if (!requirePost(req, res)) return;
  try {
    const url = await validatePublicUrl(req.body?.url);
    const format = req.body?.format;
    if (!['video', 'audio'].includes(format)) return json(res, 400, { error: 'format debe ser video o audio' });
    const quality = String(req.body?.quality || (format === 'audio' ? '192' : '720'));
    if (!isAllowedQuality(format, quality)) return json(res, 400, { error: 'Calidad no permitida' });

    const job = await writeJob({
      id: crypto.randomUUID(),
      status: 'queued',
      progress: 0,
      stage: 'En cola',
    });
    await queue.send('mediahub-downloads', { id: job.id, url, format, quality }, {
      idempotencyKey: job.id,
      retentionSeconds: 24 * 60 * 60,
    });
    return json(res, 202, job);
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.message || 'No se pudo crear la descarga' });
  }
};
