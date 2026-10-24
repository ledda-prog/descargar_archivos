'use strict';

function validatePublicBaseUrl(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  let parsed;
  try { parsed = new URL(String(value).trim()); } catch { throw new Error('PUBLIC_BASE_URL debe ser una URL válida'); }
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  const isSecure = parsed.protocol === 'https:';
  const isLocalDevelopment = parsed.protocol === 'http:' && localHosts.has(parsed.hostname.toLowerCase());
  if (!isSecure && !isLocalDevelopment) {
    throw new Error('PUBLIC_BASE_URL requiere HTTPS; HTTP solo se permite para localhost');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('PUBLIC_BASE_URL no puede incluir credenciales, consulta ni fragmento');
  }
  return parsed.href.replace(/\/$/, '');
}

function parseAllowedOrigins(value) {
  const origins = new Set();
  if (value === undefined || value === null || String(value).trim() === '') return origins;
  for (const entry of String(value).split(',')) {
    const candidate = entry.trim();
    if (!candidate) continue;
    if (candidate.includes('*')) throw new Error('ALLOWED_ORIGINS no admite comodines');
    let parsed;
    try { parsed = new URL(candidate); } catch { throw new Error(`Origen HTTPS inválido: ${candidate}`); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error(`ALLOWED_ORIGINS solo admite orígenes HTTPS exactos: ${candidate}`);
    }
    origins.add(parsed.origin);
  }
  return origins;
}

function resolveListenHost(env = process.env) {
  const explicit = String(env.HOST || '').trim();
  if (explicit) {
    if (!/^[a-zA-Z0-9.:[\]-]+$/.test(explicit)) throw new Error('HOST contiene caracteres inválidos');
    return explicit;
  }
  return String(env.RENDER || '').toLowerCase() === 'true' ? '0.0.0.0' : '127.0.0.1';
}

module.exports = { parseAllowedOrigins, resolveListenHost, validatePublicBaseUrl };
