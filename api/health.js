'use strict';

const { json } = require('./_http');

module.exports = (req, res) => json(res, 200, { ok: true, runtime: 'vercel' });
