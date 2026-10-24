# MediaHub

Aplicación para descargar contenido propio o autorizado desde URLs públicas compatibles con `yt-dlp`. Admite uso local y despliegue dividido: frontend estático en Vercel y backend Docker en Render.

La versión web también es una PWA instalable. Incluye una demo multimedia propia en `demo/mediahub-demo.mp4` para comprobar consulta, selección de formato, progreso y descarga sin depender de servicios externos.

## Iniciar

Hacer clic derecho en `start.ps1` y elegir **Ejecutar con PowerShell**, o ejecutar:

```powershell
.\start.ps1
```

La app se abre en `http://127.0.0.1:3000`. La terminal debe permanecer abierta mientras se usa.

### Enlace público opcional

`PUBLIC_BASE_URL` indica qué URL debe usar **Compartir**, **Copiar enlace** y **WhatsApp**. Debe contener la URL HTTPS pública real elegida por el usuario. En desarrollo se permite HTTP únicamente para localhost:

```powershell
$env:PUBLIC_BASE_URL = '<URL_HTTPS_PUBLICA_REAL>'
.\start.ps1
```

Configurar esta variable no publica la aplicación ni abre el servidor: por defecto continúa escuchando solo en `127.0.0.1`. Sin la variable, se comparte la URL actual y la interfaz advierte que localhost/127.0.0.1 solo funciona en el mismo equipo.

## Funciones

- Consulta título, plataforma, miniatura y duración.
- Descarga video MP4 o convierte audio a MP3.
- Detecta las resoluciones de video realmente disponibles, muestra su tamaño estimado y permite elegirlas o usar máxima calidad.
- Conserva audio MP3 en 128, 192 o 320 kbps y estima su tamaño según la duración.
- Las resoluciones concretas son estrictas: nunca se sustituyen silenciosamente por una superior.
- Muestra el porcentaje sobre el recuadro del formato elegido mientras procesa.
- Permite cancelar una descarga activa; detiene `yt-dlp` y FFmpeg y limpia los archivos temporales.
- Permite elegir la ubicación con **Guardar como** cuando el navegador lo soporta y transmite el contenido directamente al archivo elegido.
- En otros navegadores inicia una descarga nativa desde el backend, sin cargar el archivo completo en memoria.
- Guarda localmente hasta 20 descargas recientes con título, fuente, plataforma, formato, calidad, fecha y resultado. No guarda archivos ni IDs del backend.
- El historial permite reponer una configuración, eliminar entradas o borrarlo completo. Reintentar exige confirmar nuevamente el permiso y no inicia acciones automáticamente.
- Compartir usa `PUBLIC_BASE_URL` cuando está configurada; además ofrece copiar el enlace y abrir WhatsApp.
- Comparte el enlace de MediaHub mediante Web Share o WhatsApp.
- Rechaza URLs locales/privadas, credenciales embebidas, puertos no permitidos y archivos mayores de 500 MB.
- No usa cookies, sesiones privadas ni bypass de DRM.
- Para YouTube usa clientes públicos alternativos compatibles con restricciones anti-bot, sin leer cookies del navegador.
- YouTube puede rechazar las IP de centros de datos aunque el enlace sea público. En ese caso la aplicación muestra una explicación clara; no intenta evadir el control ni solicita credenciales.
- Los trabajos listos, fallidos o cancelados vencen automáticamente para no acumular memoria ni archivos.

## Requisitos y pruebas

Node.js 20+, `yt-dlp` y FFmpeg. Ya fueron instalados mediante WinGet para el usuario actual.

```powershell
npm test
```

Consultar [TESTING.md](TESTING.md) para pruebas manuales.

## Despliegue dividido

No se despliega automáticamente. El orden recomendado es Render primero y Vercel después.

### 1. Backend en Render

1. Subir el proyecto a un repositorio privado o autorizado para Render.
2. En Render, crear un Blueprint usando `render.yaml`. Este usa `Dockerfile`, el plan gratuito y `/api/health`.
3. Esperar la URL HTTPS del servicio, por ejemplo `https://mediahub-backend.onrender.com`.
4. Confirmar que `https://TU-SERVICIO.onrender.com/api/health` responde `{ "ok": true }`.

Variables del backend:

- `RENDER=true`: hace que el servidor escuche en `0.0.0.0`; localmente escucha en `127.0.0.1`.
- `PORT`: Render la establece. Localmente se usa `3000`.
- `ALLOWED_ORIGINS=https://media-hub-umber.vercel.app`: lista separada por comas de orígenes HTTPS exactos. No admite comodines.
- `PUBLIC_BASE_URL=https://media-hub-umber.vercel.app`: enlace de la página que usan Compartir, Copiar y WhatsApp.

El contenedor ejecuta Node 20 como usuario sin privilegios e instala FFmpeg y `yt-dlp` dentro de un entorno virtual de Python.

### 2. Frontend en Vercel

En el proyecto Vercel de [MediaHub](https://media-hub-umber.vercel.app), configurar:

- Framework preset: **Other**.
- Build command: `npm run build` (también está declarado en `vercel.json`).
- Output directory: `public`.
- Variable de entorno: `MEDIAHUB_API_BASE=https://TU-SERVICIO.onrender.com`.

`npm run build` valida que `MEDIAHUB_API_BASE` use HTTPS, genera `public/index.html` e inyecta allí la URL del backend. Si falta la variable, el build funciona pero la interfaz queda bloqueada con un mensaje claro de configuración pendiente.

Después de conocer la URL definitiva de Vercel, debe coincidir exactamente con `ALLOWED_ORIGINS` en Render. Los previews de Vercel no quedan autorizados automáticamente; se deben añadir uno por uno si se desean usar.

### Comprobación local del frontend generado

```powershell
$env:MEDIAHUB_API_BASE = 'https://TU-SERVICIO.onrender.com'
npm run build
```

El resultado estático queda en `public/index.html`.

## Seguridad para producción

Antes de publicar se necesita, como mínimo:

- HTTPS válido detrás de un proxy o plataforma administrada; el proceso Node no debe exponerse directamente.
- Autenticación y autorización para limitar quién procesa contenido.
- Cuotas y rate limiting por usuario/IP, límites de duración y tamaño y protección contra abuso.
- Cola de trabajos con concurrencia controlada y procesos aislados.
- Almacenamiento temporal privado con vencimiento, eliminación verificable y sin URLs permanentes.
- Registro seguro de errores y métricas, sin guardar enlaces sensibles innecesariamente.
- Revisión de derechos de autor, privacidad y términos/API oficiales de cada plataforma.

El despliegue público debe incorporar autenticación, cuotas y rate limiting antes de admitir usuarios no confiables. Render gratuito puede suspender el servicio por inactividad; la interfaz informará si el backend todavía está iniciándose o no está disponible.
