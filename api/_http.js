'use strict';

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
}

function requirePost(req, res) {
  if (req.method === 'POST') return true;
  res.setHeader('Allow', 'POST');
  json(res, 405, { error: 'Método no permitido' });
  return false;
}

module.exports = { json, requirePost };
