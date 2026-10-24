'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let security;
try {
  security = require('./security.js');
} catch (error) {
  throw new Error(`No se pudo cargar backend/security.js: ${error.message}`);
}

const { contentDisposition, validatePublicUrl, isPrivateAddress } = security;
const { cancelJob, isSupportedJsonPostPath, jobs, scheduleJobExpiry } = require('./server.js');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  buildMediaOptions,
  buildVideoFormatSelector,
  estimateAudioBytes,
  estimateFormatBytes,
  isAllowedQuality,
} = require('./formats.js');
const { validatePublicBaseUrl } = require('./config.js');

assert.equal(typeof validatePublicUrl, 'function', 'security.js debe exportar validatePublicUrl');
assert.equal(typeof isPrivateAddress, 'function', 'security.js debe exportar isPrivateAddress');

async function rejectsUrl(url, options) {
  await assert.rejects(
    Promise.resolve().then(() => validatePublicUrl(url, options)),
    undefined,
    `Se esperaba rechazar: ${url}`,
  );
}

test('rechaza esquemas no HTTP(S) e URLs inválidas', async () => {
  for (const url of [
    'file:///etc/passwd',
    'ftp://example.com/video',
    'javascript:alert(1)',
    'data:text/plain,contenido',
    'no-es-una-url',
  ]) {
    await rejectsUrl(url);
  }
});

test('rechaza localhost', async () => {
  for (const url of [
    'http://localhost/video',
    'http://localhost.localdomain/video',
    'http://127.0.0.1/video',
    'http://[::1]/video',
  ]) {
    await rejectsUrl(url);
  }
});

test('detecta loopback IPv4 e IPv6', async () => {
  for (const address of ['127.0.0.1', '127.255.255.255', '::1', '0:0:0:0:0:0:0:1']) {
    assert.equal(await isPrivateAddress(address), true, address);
  }
});

test('detecta rangos IPv4 privados, link-local y CGNAT', async () => {
  for (const address of [
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.1',
    '169.254.1.1',
    '100.64.0.1',
    '0.0.0.0',
  ]) {
    assert.equal(await isPrivateAddress(address), true, address);
  }
});

test('detecta rangos IPv6 privados y link-local', async () => {
  for (const address of ['fc00::1', 'fd12:3456::1', 'fe80::1']) {
    assert.equal(await isPrivateAddress(address), true, address);
  }
});

test('no marca direcciones públicas como privadas', async () => {
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
    assert.equal(await isPrivateAddress(address), false, address);
  }
});

test('acepta hostname público con resolución simulada', async () => {
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  const result = await validatePublicUrl('https://example.com/video', { lookup });
  assert.notEqual(result, false);
});

test('rechaza hostname que resuelve a una IP privada', async () => {
  const lookup = async () => [{ address: '192.168.1.20', family: 4 }];
  await rejectsUrl('https://example.com/video', { lookup });
});

test('retira la ruta directa y conserva solo los POST soportados', () => {
  assert.equal(isSupportedJsonPostPath('/api/info'), true);
  assert.equal(isSupportedJsonPostPath('/api/jobs'), true);
  assert.equal(isSupportedJsonPostPath('/api/download'), false);
});

test('cancela un trabajo activo mediante AbortController', () => {
  const cancelController = new AbortController();
  const job = { id: 'cancel-test', status: 'processing', progress: 42, cancelController };
  jobs.set(job.id, job);
  assert.equal(cancelJob(job), true);
  assert.equal(cancelController.signal.aborted, true);
  assert.equal(job.status, 'cancelled');
  clearTimeout(job.expiryTimer);
  jobs.delete(job.id);
});

test('expira un trabajo fallido y elimina sus temporales sin red', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mediahub-test-'));
  await fs.writeFile(path.join(tempDir, 'partial.tmp'), 'test');
  const job = { id: 'failed-test', status: 'failed', tempDir };
  jobs.set(job.id, job);
  scheduleJobExpiry(job, 10);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(jobs.has(job.id), false);
  await assert.rejects(fs.stat(tempDir), { code: 'ENOENT' });
});

test('construye resoluciones reales, únicas y ordenadas con tamaños estimados', () => {
  const options = buildMediaOptions([
    { height: 720, width: 1280, vcodec: 'avc1', acodec: 'none', filesize: 20_000_000 },
    { height: 720, width: 1280, vcodec: 'vp9', acodec: 'none', filesize_approx: 25_000_000 },
    { height: 360, width: 640, vcodec: 'avc1', acodec: 'mp4a', filesize: 8_000_000 },
    { height: 90, width: 160, vcodec: 'mhtml', acodec: 'none', filesize: 1000 },
    { height: 1080, width: 1920, vcodec: 'images', acodec: 'none', ext: 'mhtml', filesize: 1000 },
    { height: 2160, width: 3840, vcodec: 'av01', acodec: 'none', has_drm: true, filesize: 50_000_000 },
    { vcodec: 'none', acodec: 'mp4a', abr: 128, filesize: 2_000_000 },
  ], 120);
  assert.deepEqual(options.video_options.map((item) => item.quality), ['360', '720']);
  assert.equal(options.video_options[1].label, '1280×720');
  assert.equal(options.video_options[1].estimated_size, 27_000_000);
  assert.equal(options.best_video_estimated_size, 27_000_000);
  assert.deepEqual(options.audio_options.map((item) => item.quality), ['128', '192', '320']);
});

test('estima tamaños por bytes directos o bitrate y duración', () => {
  assert.equal(estimateFormatBytes({ filesize: 1234, tbr: 999 }, 10), 1234);
  assert.equal(estimateFormatBytes({ tbr: 800 }, 10), 1_000_000);
  assert.equal(estimateAudioBytes(60, 128), 960_000);
  assert.equal(estimateAudioBytes(null, 128), null);
});

test('el selector de video exige la altura elegida y best sigue disponible', () => {
  const selector = buildVideoFormatSelector('720');
  assert.match(selector, /height=720/);
  assert.doesNotMatch(selector, /height<=|\/best$/);
  assert.equal(buildVideoFormatSelector('best'), 'bestvideo+bestaudio/best');
  assert.equal(buildVideoFormatSelector('99999'), null);
  assert.equal(isAllowedQuality('video', '1080'), true);
  assert.equal(isAllowedQuality('audio', '192'), true);
  assert.equal(isAllowedQuality('audio', '256'), false);
});

test('el fallback del navegador descarga directo sin crear un Blob', async () => {
  const frontend = await fs.readFile(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(frontend, /function startNativeJobDownload\(job\)/);
  assert.match(frontend, /link\.href=jobFileUrl\(job\)/);
  assert.doesNotMatch(frontend, /response\.blob\s*\(/);
  assert.doesNotMatch(frontend, /URL\.createObjectURL\s*\(/);
  assert.match(contentDisposition('vídeo propio.mp4'), /^attachment; filename=/);
  assert.match(contentDisposition('vídeo propio.mp4'), /filename\*=UTF-8''/);
});

test('el historial es local, limitado y reintentar no da consentimiento ni inicia acciones', async () => {
  const frontend = await fs.readFile(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(frontend, /HISTORY_LIMIT=20/);
  assert.match(frontend, /localStorage\.setItem\(HISTORY_KEY/);
  assert.match(frontend, /entries\.slice\(0,HISTORY_LIMIT\)/);
  assert.match(frontend, /permission\.checked=false/);
  const retryHandler = frontend.match(/historyList\.addEventListener\('click',[\s\S]*?clearHistoryButton\.addEventListener/);
  assert.ok(retryHandler, 'Debe existir el controlador del historial');
  assert.doesNotMatch(retryHandler[0], /requestSubmit|downloadButton\.click|form\.submit/);
  assert.match(frontend, /sourceUrl:currentMedia\.sourceUrl,platform:currentMedia\.platform,format,quality,date:/);
});

test('el historial normaliza y reintenta video con el valor real del radio', async () => {
  const frontend = await fs.readFile(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(frontend, /entry\.format==='video'\?'video':entry\.format==='audio'\?'audio':null/);
  assert.doesNotMatch(frontend, /entry\.format==='mp4'\?'mp4'/);
  assert.match(frontend, /entry\.format==='audio'\?'Audio MP3':'Video MP4'/);
  assert.match(frontend, /input\[name="format"\]\[value="'\+entry\.format\+'"\]/);
  assert.match(frontend, /addHistoryEntry\(\{title:currentMedia\.title,[^}]*format,quality,/);
  assert.match(frontend, /name="format" value="video"/);
});

test('PUBLIC_BASE_URL permite HTTPS y HTTP solo para desarrollo local', () => {
  assert.equal(validatePublicBaseUrl(undefined), null);
  assert.equal(validatePublicBaseUrl('https://example.test/mediahub/'), 'https://example.test/mediahub');
  assert.equal(validatePublicBaseUrl('http://localhost:3000/'), 'http://localhost:3000');
  assert.equal(validatePublicBaseUrl('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  assert.equal(validatePublicBaseUrl('http://[::1]:3000'), 'http://[::1]:3000');
  assert.throws(() => validatePublicBaseUrl('http://example.test'), /HTTPS/);
  assert.throws(() => validatePublicBaseUrl('ftp://example.test'), /HTTPS/);
  assert.throws(() => validatePublicBaseUrl('https://user:secret@example.test'), /credenciales/);
  assert.throws(() => validatePublicBaseUrl('https://example.test/?token=secret'), /consulta/);
});

test('config pública y compartir conservan servidor local y fallbacks visibles', async () => {
  const frontend = await fs.readFile(path.join(__dirname, '..', 'index.html'), 'utf8');
  const server = await fs.readFile(path.join(__dirname, 'server.js'), 'utf8');
  assert.match(server, /const HOST = '127\.0\.0\.1'/);
  assert.match(server, /pathname === '\/api\/config'/);
  assert.match(frontend, /publicBaseUrl\|\|location\.href/);
  assert.match(frontend, /id="copyLinkButton"/);
  assert.match(frontend, /id="whatsAppButton"/);
  assert.match(frontend, /solo funciona en este mismo equipo/);
});
