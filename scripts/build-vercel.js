'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function validateApiBase(value) {
  if (value === undefined || value === null || String(value).trim() === '') return '';
  const candidate = String(value).trim();
  let parsed;
  try { parsed = new URL(candidate); } catch { throw new Error('MEDIAHUB_API_BASE debe ser una URL HTTPS válida'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('MEDIAHUB_API_BASE debe usar HTTPS y no incluir credenciales, consulta ni fragmento');
  }
  return parsed.href.replace(/\/$/, '');
}

async function build() {
  const root = path.join(__dirname, '..');
  const source = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  const apiBase = validateApiBase(process.env.MEDIAHUB_API_BASE);
  const marker = '<!-- MEDIAHUB_API_CONFIG -->';
  if (!source.includes(marker)) throw new Error('Falta el marcador de configuración del frontend');
  const serializedApiBase = JSON.stringify(apiBase).replace(/</g, '\\u003c');
  const output = source.replace(marker, `<script>window.MEDIAHUB_API_BASE=${serializedApiBase};<\/script>`);
  const publicDir = path.join(root, 'public');
  const outputPath = path.join(publicDir, 'index.html');
  await fs.mkdir(publicDir, { recursive: true });
  await fs.rm(outputPath, { force: true });
  await fs.writeFile(outputPath, output);
  for (const entry of ['manifest.webmanifest', 'sw.js']) {
    await fs.copyFile(path.join(root, entry), path.join(publicDir, entry));
  }
  for (const directory of ['assets']) {
    await fs.cp(path.join(root, directory), path.join(publicDir, directory), { recursive: true, force: true });
  }
  console.log(`Frontend generado en public/index.html (${apiBase ? 'backend configurado' : 'backend sin configurar'})`);
}

if (require.main === module) build().catch((error) => { console.error(error.message); process.exit(1); });

module.exports = { build, validateApiBase };
