# MediaHub

Aplicación para descargar contenido propio o autorizado desde URLs públicas compatibles con `yt-dlp`. Admite uso local y una arquitectura completa en Vercel.

La versión web también es una PWA instalable.

## Aplicación portable para Windows

La versión de Windows ejecuta el backend, `yt-dlp` y FFmpeg en la PC del usuario. Así, el procesamiento usa su conexión en lugar de una IP de centro de datos. No garantiza que todas las plataformas acepten todos los enlaces y no evade autenticación, DRM ni restricciones.

Para desarrollo:

```powershell
npm install
npm run desktop:dev
```

Para generar `release/MediaHub-Portable-<versión>.exe`:

```powershell
npm run desktop:dist
```

El ejecutable debe publicarse como archivo de una versión en GitHub Releases. El botón **Descargar para Windows** de Vercel apunta siempre a la versión más reciente. Windows puede mostrar una advertencia de SmartScreen mientras el ejecutable no esté firmado digitalmente.

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
- Para YouTube deja que la versión actual de `yt-dlp` seleccione automáticamente los clientes públicos compatibles, sin leer cookies del navegador.
- YouTube puede rechazar las IP de centros de datos aunque el enlace sea público. En ese caso la aplicación muestra una explicación clara; no intenta evadir el control ni solicita credenciales.
- En la aplicación local, los trabajos listos, fallidos o cancelados vencen automáticamente para no acumular memoria ni archivos.

## Requisitos y pruebas

Node.js 20+, `yt-dlp` y FFmpeg. Ya fueron instalados mediante WinGet para el usuario actual.

```powershell
npm test
```

Consultar [TESTING.md](TESTING.md) para pruebas manuales.

## Despliegue completo en Vercel

La web usa cuatro piezas del mismo proyecto:

- `public/`: landing estática.
- `api/`: consulta de enlaces y estado de trabajos.
- Vercel Queue: entrega durable de descargas.
- Vercel Daemon + Blob privado: ejecuta `yt-dlp`/FFmpeg y entrega archivos mediante enlaces temporales.

Configuración del proyecto [MediaHub](https://media-hub-umber.vercel.app):

1. Framework preset **Other**, build `npm run build` y salida `public`.
2. Crear un Blob store **privado** y conectarlo al proyecto. Vercel proporciona `BLOB_READ_WRITE_TOKEN` o la identidad OIDC correspondiente.
3. Mantener `QUEUE_REGION=iad1` en Production para que API y daemon usen la misma región.
4. Configurar `PUBLIC_BASE_URL=https://media-hub-umber.vercel.app` si se quiere fijar el enlace compartido.
5. Desplegar a Production. `vercel.json` crea un daemon `mediahub-worker` en `iad1`; `worker/Dockerfile` instala `yt-dlp` y FFmpeg.

Vercel Daemons y Queues están en beta. El plan Hobby permite probarlos dentro de su cuota, pero el procesamiento y la transferencia de multimedia consumen recursos. Los archivos quedan privados y el navegador recibe un enlace firmado por quince minutos.

Para comprobar solamente el frontend local:

```powershell
npm run build
```

## Seguridad para producción

Antes de publicar se necesita, como mínimo:

- HTTPS válido detrás de un proxy o plataforma administrada; el proceso Node no debe exponerse directamente.
- Autenticación y autorización para limitar quién procesa contenido.
- Cuotas y rate limiting por usuario/IP, límites de duración y tamaño y protección contra abuso.
- Cola de trabajos con concurrencia controlada y procesos aislados.
- Almacenamiento temporal privado con vencimiento, eliminación verificable y sin URLs permanentes.
- Registro seguro de errores y métricas, sin guardar enlaces sensibles innecesariamente.
- Revisión de derechos de autor, privacidad y términos/API oficiales de cada plataforma.

El despliegue público debe incorporar autenticación, cuotas, rate limiting y una política explícita de retención antes de admitir usuarios no confiables. YouTube todavía puede rechazar las IP de Vercel; la arquitectura mejora persistencia y entrega, pero no evade ese control de la plataforma.
