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

module.exports = { validatePublicBaseUrl };
