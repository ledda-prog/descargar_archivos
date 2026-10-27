# Memoria del proyecto

## Estado actual

MediaHub funciona localmente y tiene preparada una arquitectura web completa para Vercel. Usa Node.js, `yt-dlp` y FFmpeg para consultar y descargar URLs públicas compatibles.

## Decisiones

- Flujo basado en consentimiento explícito.
- El backend corre en `http://127.0.0.1:3000` y sirve también la interfaz.
- Descarga MP4, convierte MP3 y elimina archivos temporales.
- El navegador permite elegir ubicación mediante `showSaveFilePicker`; el fallback descarga directamente sin cargar un blob completo en memoria.
- Las descargas usan trabajos locales (`/api/jobs`) con porcentaje y archivo temporal.
- El recuadro MP4/MP3 se completa visualmente según el progreso.
- Video usa las resoluciones reales disponibles con selección estricta o máxima calidad; audio permite 128, 192 o 320 kbps.
- Compartir envía la URL de MediaHub, no el archivo ni el enlace del contenido.
- YouTube deja que `yt-dlp` elija los clientes públicos compatibles, sin cookies.
- La variante Windows usa Electron, inicia el backend en un puerto local aleatorio y empaqueta `yt-dlp.exe` y `ffmpeg.exe`.
- La landing de Vercel enlaza la última versión portable publicada en GitHub Releases.
- El historial vive solo en `localStorage`, admite hasta 20 entradas y no conserva archivos ni IDs de trabajos.
- `PUBLIC_BASE_URL` es opcional, solo acepta HTTPS (o HTTP local de desarrollo) y define el enlace compartido sin publicar ni reconfigurar la escucha local.
- La interfaz ofrece Web Share cuando existe, copiar enlace y WhatsApp; advierte cuando la URL solo funciona en el mismo equipo.
- En Vercel, `api/` atiende consultas y trabajos, Vercel Queue los entrega, un Daemon ejecuta `yt-dlp`/FFmpeg y Blob privado conserva estado y archivos.
- La descarga web recibe un enlace firmado de Blob por quince minutos; los archivos no atraviesan la respuesta de una Function.
- El frontend desplegado usa la API del mismo dominio e ignora la antigua URL de Render.

## Pendientes

1. Probar con enlaces propios de cada plataforma objetivo.
2. Adaptar extractores cuando las plataformas cambien.
3. Conectar un Blob store privado al proyecto Vercel y desplegar a Production.
4. Antes de abrirlo a usuarios no confiables: autenticación, cuotas, rate limiting y política de retención/eliminación de Blob.
