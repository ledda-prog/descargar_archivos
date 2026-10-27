'use strict';

const { json } = require('./_http');

module.exports = (req, res) => json(res, 200, { public_base_url: process.env.PUBLIC_BASE_URL || null });
