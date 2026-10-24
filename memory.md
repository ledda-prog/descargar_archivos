# Memoria del proyecto

## Estado actual

MediaHub es una aplicación web local funcional. Usa Node.js, `yt-dlp` y FFmpeg para consultar y descargar URLs públicas compatibles.

## Decisiones

- Flujo basado en consentimiento explícito.
- El backend corre en `http://127.0.0.1:3000` y sirve también la interfaz.
- Descarga MP4, convierte MP3 y elimina archivos temporales.
- El navegador permite elegir ubicación mediante `showSaveFilePicker`; el fallback descarga directamente sin cargar un blob completo en memoria.
- Las descargas usan trabajos locales (`/api/jobs`) con porcentaje y archivo temporal.
- El recuadro MP4/MP3 se completa visualmente según el progreso.
- Video usa las resoluciones reales disponibles con selección estricta o máxima calidad; audio permite 128, 192 o 320 kbps.
- Compartir envía la URL de MediaHub, no el archivo ni el enlace del contenido.
- YouTube usa `web_safari,web_embedded` como fallback sin cookies ante bloqueos anti-bot.
- El historial vive solo en `localStorage`, admite hasta 20 entradas y no conserva archivos ni IDs de trabajos.
- `PUBLIC_BASE_URL` es opcional, solo acepta HTTPS (o HTTP local de desarrollo) y define el enlace compartido sin publicar ni reconfigurar la escucha local.
- La interfaz ofrece Web Share cuando existe, copiar enlace y WhatsApp; advierte cuando la URL solo funciona en el mismo equipo.

## Pendientes

1. Probar con enlaces propios de cada plataforma objetivo.
2. Adaptar extractores cuando las plataformas cambien.
3. Para publicar, el usuario todavía debe elegir dominio HTTPS, proveedor/infraestructura y política de acceso; luego hay que incorporar autenticación, cuotas, rate limiting, cola y almacenamiento temporal privado.
