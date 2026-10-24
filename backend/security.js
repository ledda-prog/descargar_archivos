'use strict';

const dns = require('node:dns').promises;
const http = require('node:http');
const net = require('node:net');

const MAX_BODY_BYTES = 16 * 1024;

function isPrivateAddress(address) {
  let value = address.toLowerCase().split('%')[0];
  if (value.startsWith('::ffff:')) value = value.slice(7);

  if (net.isIPv4(value)) {
    const [a, b] = value.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224;
  }

  if (net.isIPv6(value)) {
    return value === '::' || value === '::1' || value === '0:0:0:0:0:0:0:1' ||
      value.startsWith('fc') || value.startsWith('fd') ||
      /^fe[89ab]/.test(value) || value.startsWith('2001:db8:');
  }

  return true;
}

async function resolvePublicHost(hostname, lookup = dns.lookup) {
  const name = hostname.toLowerCase().replace(/\.$/, '');
  if (!name || name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.local')) {
    throw new Error('Host local no permitido');
  }

  const addresses = net.isIP(name)
    ? [{ address: name, family: net.isIP(name) }]
    : await lookup(name, { all: true, verbatim: true });

  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('La URL resuelve a una red privada o no permitida');
  }
  return addresses[0];
}

async function validatePublicUrl(input, { lookup = dns.lookup } = {}) {
  if (typeof input !== 'string' || input.length > 4096) throw new Error('URL inválida');
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error('URL inválida');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Solo se aceptan URLs HTTP/HTTPS sin credenciales');
  }
  if ((url.port && url.port !== '80' && url.port !== '443')) {
    throw new Error('Puerto no permitido');
  }
  await resolvePublicHost(url.hostname, lookup);
  return url.toString();
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Cuerpo demasiado grande'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function safeFilename(name) {
  const cleaned = String(name || 'download')
    .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 180);
  return cleaned || 'download';
}

function contentDisposition(name) {
  const safe = safeFilename(name);
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(safe).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function parseAuthority(authority) {
  const match = authority.match(/^\[([^\]]+)](?::(\d+))?$|^([^:]+)(?::(\d+))?$/);
  if (!match) throw new Error('Destino proxy inválido');
  return { hostname: match[1] || match[3], port: Number(match[2] || match[4] || 443) };
}

async function startSafeProxy() {
  const server = http.createServer(async (req, res) => {
    try {
      const target = new URL(req.url);
      const safeUrl = await validatePublicUrl(target.toString());
      const parsed = new URL(safeUrl);
      const resolved = await resolvePublicHost(parsed.hostname);
      const headers = { ...req.headers, host: parsed.host };
      delete headers['proxy-authorization'];
      delete headers['proxy-connection'];
      const upstream = http.request({
        hostname: resolved.address,
        family: resolved.family,
        port: parsed.port || 80,
        method: req.method,
        path: `${parsed.pathname}${parsed.search}`,
        headers,
        timeout: 30_000,
      }, (upstreamResponse) => {
        res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
        upstreamResponse.pipe(res);
      });
      upstream.on('timeout', () => upstream.destroy(new Error('Timeout')));
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.pipe(upstream);
    } catch {
      res.writeHead(403);
      res.end();
    }
  });

  server.on('connect', async (req, clientSocket, head) => {
    try {
      const { hostname, port } = parseAuthority(req.url);
      if (![80, 443].includes(port)) throw new Error('Puerto no permitido');
      const resolved = await resolvePublicHost(hostname);
      const upstream = net.connect({ host: resolved.address, port, family: resolved.family });
      upstream.setTimeout(30_000, () => upstream.destroy());
      clientSocket.on('error', () => upstream.destroy());
      upstream.once('connect', () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      upstream.on('error', () => clientSocket.destroy());
    } catch {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = {
  contentDisposition,
  isAllowedOrigin,
  isPrivateAddress,
  readJson,
  safeFilename,
  startSafeProxy,
  validatePublicUrl,
};
