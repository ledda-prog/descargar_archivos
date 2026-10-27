'use strict';

const { json } = require('../_http');
const { issueSignedToken, presignUrl } = require('@vercel/blob');
const { readJob, writeJob } = require('../../backend/vercel-store');

async function publicJob(job) {
  const result = { ...job };
  if (result.status === 'ready' && result.blob_path) {
    const validUntil = Date.now() + 15 * 60 * 1000;
    const token = await issueSignedToken({ pathname: result.blob_path, operations: ['get'], validUntil });
    const signed = await presignUrl(token, {
      operation: 'get',
      pathname: result.blob_path,
      access: 'private',
      validUntil,
    });
    result.download_url = signed.presignedUrl;
  }
  delete result.blob_path;
  return result;
}

module.exports = async (req, res) => {
  try {
    const job = await readJob(req.query.id);
    if (!job) return json(res, 404, { error: 'Descarga no encontrada o vencida' });
    if (req.method === 'GET') return json(res, 200, await publicJob(job));
    if (req.method === 'DELETE') {
      if (['queued', 'processing'].includes(job.status)) {
        return json(res, 202, await publicJob(await writeJob({ ...job, status: 'cancelled', stage: 'Descarga cancelada', error: null })));
      }
      return res.status(204).end();
    }
    res.setHeader('Allow', 'GET, DELETE');
    return json(res, 405, { error: 'Método no permitido' });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.message || 'No se pudo consultar la descarga' });
  }
};
