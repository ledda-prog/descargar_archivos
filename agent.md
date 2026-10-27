# Instrucciones del proyecto

- Responder y trabajar en español, con máxima concisión.
- Mantener el MVP consent-first: solo contenido propio, autorizado o APIs oficiales.
- No implementar scraping, bypass de DRM, autenticación de terceros ni extracción restringida.
- Preservar la interfaz responsive y accesible de `index.html`.
- Documentar cambios relevantes en `README.md`.
- Verificar archivos y comportamiento antes de finalizar.

## Estructura

- `index.html`: landing y aplicación interactiva.
- `README.md`: alcance, decisiones y próximos pasos.
- `backend/server.js`: servidor local y procesamiento con `yt-dlp`.
- `backend/security.js`: validación SSRF, CORS y nombres seguros.
- `backend/test.js`: pruebas automatizadas.
- `backend/API-CONTRACT.md`: contrato actual del backend.
- `api/`: Functions de Vercel para metadatos, creación y consulta de trabajos.
- `backend/vercel-store.js`: estado durable de trabajos en Blob privado.
- `worker/`: Daemon de Vercel que consume Queue y procesa multimedia.
- `start.ps1`: inicio para Windows con verificación de dependencias.
