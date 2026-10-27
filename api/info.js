'use strict';

const { json, requirePost } = require('./_http');
const { getInfo, publicExtractorError } = require('../backend/server');
const { startSafeProxy, validatePublicUrl } = require('../backend/security');

module.exports = async (req, res) => {
  if (!requirePost(req, res)) return;
  let proxy;
  try {
    const url = await validatePublicUrl(req.body?.url);
    proxy = await startSafeProxy();
    return json(res, 200, await getInfo(url, proxy.url));
  } catch (error) {
    return json(res, error.statusCode || 500, { error: publicExtractorError(error.message) });
  } finally {
    await proxy?.close();
  }
};
