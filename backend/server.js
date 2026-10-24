'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const {
  contentDisposition,
  isAllowedOrigin,
  readJson,
  startSafeProxy,
  validatePublicUrl,
} = require('./security');
const {
  buildMediaOptions,
  buildVideoFormatSelector,
  isAllowedQuality,
} = require('./formats');
const { validatePublicBaseUrl } = require('./config');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;
const INDEX_PATH = path.join(__dirname, '..', 'index.html');
const YT_DLP_COMMAND = process.env.YT_DLP_PATH || 'yt-dlp';
const MAX_FILE_BYTES = 500 * 1024 * 1024;
const PROCESS_TIMEOUT_MS = 10 * 60 * 1000;
const JOB_TTL_MS = 30 * 60 * 1000;
const MAX_ACTIVE_JOBS = 2;
const PUBLIC_BASE_URL = validatePublicBaseUrl(process.env.PUBLIC_BASE_URL);
const jobs = new Map();

async function removeJobFiles(job) {
  if (job.tempDir) await fsp.rm(job.tempDir, { recursive: true, force: true });
}

function scheduleJobExpiry(job, delay = JOB_TTL_MS) {
  clearTimeout(job.expiryTimer);
  job.expiryTimer = setTimeout(async () => {
    jobs.delete(job.id);
    await removeJobFiles(job);
  }, delay);
  job.expiryTimer.unref?.();
}

function terminateProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return Promise.resolve();
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true,
        shell: false,
        stdio: 'ignore',
      });
      killer.once('error', () => { child.kill('SIGKILL'); resolve(); });
      killer.once('close', resolve);
    });
  }
  try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  return Promise.resolve();
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) return false;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

function restrictedEnvironment(proxyUrl) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(http|https|all|no)_proxy$/i.test(key)) delete env[key];
  }
  env.HTTP_PROXY = proxyUrl;
  env.HTTPS_PROXY = proxyUrl;
  env.ALL_PROXY = proxyUrl;
  env.NO_PROXY = '';
  env.PYTHONUTF8 = '1';
  env.PYTHONIOENCODING = 'utf-8';
  return env;
}

function runYtDlp(args, proxyUrl, { cwd, maxOutput = 2 * 1024 * 1024, watchSize = false, onLine, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('Descarga cancelada'), { name: 'AbortError' }));
    const child = spawn(YT_DLP_COMMAND, ['--ignore-config', '--proxy', proxyUrl, ...args], {
      cwd,
      env: restrictedEnvironment(proxyUrl),
      windowsHide: true,
      detached: process.platform !== 'win32',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    const pendingLines = { stdout: '', stderr: '' };
    let settled = false;
    let sizeTimer = null;

    const stop = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (sizeTimer) clearInterval(sizeTimer);
      signal?.removeEventListener('abort', abort);
      terminateProcessTree(child).finally(() => reject(error));
    };
    const abort = () => stop(Object.assign(new Error('Descarga cancelada'), { name: 'AbortError' }));
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop(Object.assign(new Error('Tiempo de procesamiento agotado'), { statusCode: 504 })), PROCESS_TIMEOUT_MS);
    sizeTimer = watchSize ? setInterval(async () => {
      try {
        const entries = await fsp.readdir(cwd, { withFileTypes: true });
        let total = 0;
        for (const entry of entries) if (entry.isFile()) total += (await fsp.stat(path.join(cwd, entry.name))).size;
        if (total > MAX_FILE_BYTES) stop(Object.assign(new Error('El archivo supera 500 MB'), { statusCode: 413 }));
      } catch { /* El directorio puede desaparecer al cancelar. */ }
    }, 500) : null;

    const append = (current, chunk) => {
      if (current.length + chunk.length > maxOutput) {
        stop(Object.assign(new Error('Respuesta externa demasiado grande'), { statusCode: 502 }));
        return current;
      }
      return Buffer.concat([current, chunk]);
    };
    const emitLines = (channel, chunk) => {
      if (!onLine) return;
      const parts = (pendingLines[channel] + chunk.toString('utf8')).split(/\r\n|\n|\r/);
      pendingLines[channel] = parts.pop() || '';
      for (const line of parts) if (line) onLine(line);
    };
    child.stdout.on('data', (chunk) => { emitLines('stdout', chunk); stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { emitLines('stderr', chunk); stderr = append(stderr, chunk); });
    child.once('error', (error) => {
      if (error.code === 'ENOENT') error.message = 'yt-dlp no está instalado o no está en PATH';
      stop(Object.assign(error, { statusCode: 503 }));
    });
    child.once('close', (code) => {
      signal?.removeEventListener('abort', abort);
      clearTimeout(timer);
      if (sizeTimer) clearInterval(sizeTimer);
      if (settled) return;
      settled = true;
      if (onLine) for (const line of Object.values(pendingLines)) if (line) onLine(line);
      if (code === 0) resolve({ stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') });
      else reject(Object.assign(new Error(stderr.toString('utf8').trim() || 'yt-dlp no pudo procesar el enlace'), { statusCode: 422 }));
    });
  });
}

const baseArgs = [
  '--no-playlist',
  '--extractor-args', 'youtube:player_client=web_safari,web_embedded',
  '--socket-timeout', '15',
  '--retries', '2',
  '--extractor-retries', '2',
  '--max-filesize', '500M',
  '--no-warnings',
  '--no-cache-dir',
];

async function getInfo(url, proxyUrl) {
  const fields = '%(.{id,title,uploader,channel,duration,thumbnail,extractor_key,extractor,webpage_url,formats})j';
  const result = await runYtDlp([...baseArgs, '--skip-download', '--print', fields, url], proxyUrl);
  const info = JSON.parse(result.stdout);
  return {
    id: info.id,
    title: info.title,
    uploader: info.uploader || info.channel || null,
    duration: info.duration ?? null,
    thumbnail: info.thumbnail || null,
    platform: info.extractor_key || info.extractor || null,
    webpage_url: info.webpage_url || url,
    ...buildMediaOptions(info.formats, info.duration),
  };
}

async function download(url, format, quality, proxyUrl, onLine, signal) {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'media-download-'));
  const formatArgs = format === 'audio'
    ? ['--format', 'bestaudio/best', '--extract-audio', '--audio-format', 'mp3', '--audio-quality', `${quality}K`]
    : ['--format', buildVideoFormatSelector(quality), '--remux-video', 'mp4'];
  try {
    await runYtDlp([
      ...baseArgs,
      ...formatArgs,
      '--downloader', 'm3u8:native',
      '--concurrent-fragments', '4',
      '--newline',
      '--progress',
      '--progress-template', 'download:MEDIAHUB:%(progress._percent_str)s',
      '--output', '%(title).150B-%(id)s.%(ext)s',
      '--print', 'after_move:filepath',
      url,
    ], proxyUrl, {
      cwd: tempDir,
      watchSize: true,
      onLine,
      signal,
    });
    const entries = await fsp.readdir(tempDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && !entry.name.endsWith('.part'));
    if (files.length !== 1) throw Object.assign(new Error('No se obtuvo un único archivo descargable'), { statusCode: 422 });
    const filePath = path.join(tempDir, files[0].name);
    const stat = await fsp.stat(filePath);
    if (stat.size > MAX_FILE_BYTES) throw Object.assign(new Error('El archivo supera 500 MB'), { statusCode: 413 });
    return { tempDir, filePath, filename: files[0].name, size: stat.size };
  } catch (error) {
    await fsp.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    error: job.error || null,
    filename: job.filename || null,
    size: job.size || null,
  };
}

function updateProgress(job, line) {
  const match = line.match(/MEDIAHUB:\s*(\d+(?:\.\d+)?)%/);
  if (match) {
    job.progress = Math.max(job.progress, Math.min(95, Number(match[1])));
    job.stage = `Descargando · ${Math.round(job.progress)}%`;
  } else if (/ExtractAudio|Merger|Remux|Post-process/i.test(line)) {
    job.progress = Math.max(job.progress, 96);
    job.stage = 'Preparando el archivo final';
  }
}

async function processJob(job, url, format, quality, proxyUrl) {
  job.status = 'processing';
  job.stage = 'Conectando con la plataforma';
  try {
    const result = await download(url, format, quality, proxyUrl, (line) => updateProgress(job, line), job.cancelController.signal);
    if (job.cancellationRequested) {
      await removeJobFiles(result);
      throw Object.assign(new Error('Descarga cancelada'), { name: 'AbortError' });
    }
    Object.assign(job, result, { status: 'ready', progress: 100, stage: 'Listo para guardar' });
    scheduleJobExpiry(job);
  } catch (error) {
    if (job.cancellationRequested || error.name === 'AbortError') {
      job.status = 'cancelled';
      job.stage = 'Descarga cancelada';
      job.error = null;
    } else {
      job.status = 'failed';
      job.stage = 'No se pudo completar';
      job.error = /Sign in to confirm|HTTP Error 429/i.test(error.message)
        ? 'YouTube bloqueó temporalmente la solicitud. Esperá unos minutos y volvé a intentar.'
        : error.message;
    }
    scheduleJobExpiry(job);
  }
}

function cancelJob(job) {
  if (!['queued', 'processing'].includes(job.status)) return false;
  job.cancellationRequested = true;
  job.status = 'cancelled';
  job.stage = 'Cancelando y limpiando archivos';
  job.error = null;
  job.cancelController.abort();
  scheduleJobExpiry(job);
  return true;
}

function isSupportedJsonPostPath(pathname) {
  return ['/api/info', '/api/jobs'].includes(pathname);
}

async function sendJobFile(job, res) {
  if (job.status !== 'ready' || !job.filePath) return sendJson(res, 409, { error: 'El archivo todavía no está listo' });
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': job.size,
    'Content-Disposition': contentDisposition(job.filename),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
  const stream = fs.createReadStream(job.filePath);
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    clearTimeout(job.expiryTimer);
    jobs.delete(job.id);
    await fsp.rm(job.tempDir, { recursive: true, force: true });
  };
  stream.on('error', (error) => res.destroy(error));
  res.on('close', cleanup);
  stream.pipe(res);
}

async function main() {
  const proxy = await startSafeProxy();
  const server = http.createServer(async (req, res) => {
    if (!setCors(req, res)) return sendJson(res, 403, { error: 'Origen no permitido' });
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
      if (req.method === 'GET' && requestUrl.pathname === '/') {
        const html = await fsp.readFile(INDEX_PATH);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': html.length,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        });
        return res.end(html);
      }
      if (req.method === 'GET' && requestUrl.pathname === '/api/health') {
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'GET' && requestUrl.pathname === '/api/config') {
        return sendJson(res, 200, { public_base_url: PUBLIC_BASE_URL });
      }
      const fileMatch = requestUrl.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)\/file$/i);
      if (req.method === 'GET' && fileMatch) {
        const job = jobs.get(fileMatch[1]);
        return job ? sendJobFile(job, res) : sendJson(res, 404, { error: 'Descarga no encontrada o vencida' });
      }
      const jobMatch = requestUrl.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)$/i);
      if (req.method === 'DELETE' && jobMatch) {
        const job = jobs.get(jobMatch[1]);
        if (!job) return sendJson(res, 404, { error: 'Descarga no encontrada o vencida' });
        if (cancelJob(job)) return sendJson(res, 202, publicJob(job));
        clearTimeout(job.expiryTimer);
        jobs.delete(job.id);
        await removeJobFiles(job);
        res.writeHead(204);
        return res.end();
      }
      if (req.method === 'GET' && jobMatch) {
        const job = jobs.get(jobMatch[1]);
        return sendJson(res, job ? 200 : 404, job ? publicJob(job) : { error: 'Descarga no encontrada o vencida' });
      }
      if (req.method !== 'POST' || !isSupportedJsonPostPath(requestUrl.pathname)) {
        return sendJson(res, 404, { error: 'Ruta no encontrada' });
      }
      if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        return sendJson(res, 415, { error: 'Se requiere application/json' });
      }

      const body = await readJson(req);
      const url = await validatePublicUrl(body.url);
      if (requestUrl.pathname === '/api/info') {
        return sendJson(res, 200, await getInfo(url, proxy.url));
      }

      if (!['video', 'audio'].includes(body.format)) {
        return sendJson(res, 400, { error: 'format debe ser video o audio' });
      }
      const quality = String(body.quality || (body.format === 'audio' ? '192' : '720'));
      if (!isAllowedQuality(body.format, quality)) {
        return sendJson(res, 400, { error: 'Calidad no permitida para el formato elegido' });
      }
      if (requestUrl.pathname === '/api/jobs') {
        const active = [...jobs.values()].filter((job) => ['queued', 'processing'].includes(job.status)).length;
        if (active >= MAX_ACTIVE_JOBS) return sendJson(res, 429, { error: 'Ya hay demasiadas descargas activas' });
        const job = {
          id: crypto.randomUUID(),
          status: 'queued',
          progress: 0,
          stage: 'En cola',
          error: null,
          quality,
          cancelController: new AbortController(),
          cancellationRequested: false,
        };
        jobs.set(job.id, job);
        processJob(job, url, body.format, quality, proxy.url);
        return sendJson(res, 202, publicJob(job));
      }
    } catch (error) {
      if (!res.headersSent) sendJson(res, error.statusCode || 500, { error: error.message || 'Error interno' });
      else res.destroy();
    }
  });

  server.listen(PORT, HOST, () => console.log(`Backend activo en http://${HOST}:${PORT}`));
  const shutdown = () => server.close(() => proxy.close().finally(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  cancelJob,
  isSupportedJsonPostPath,
  jobs,
  removeJobFiles,
  scheduleJobExpiry,
};
