# API local

Base: `http://127.0.0.1:3000`

## `GET /api/health`

Respuesta: `{"ok":true}`.

## `GET /api/config`

Devuelve únicamente configuración pública para la interfaz:

```json
{"public_base_url":null}
```

Sin `PUBLIC_BASE_URL`, el valor es `null`. La variable acepta HTTPS o, solo para desarrollo, HTTP sobre `localhost`, `127.0.0.1` o `::1`. No expone secretos ni cambia la dirección de escucha del servidor.

## `POST /api/info`

```json
{"url":"https://sitio.example/contenido"}
```

Devuelve título, autor, duración, miniatura, plataforma, URL normalizada y opciones calculadas desde los formatos reales informados por la plataforma:

```json
{
  "video_options": [
    {"quality":"720","width":1280,"height":720,"label":"1280×720","estimated_size":27000000}
  ],
  "best_video_estimated_size": 27000000,
  "audio_options": [
    {"quality":"192","bitrate":192,"label":"192 kbps","estimated_size":2880000}
  ]
}
```

`estimated_size` está expresado en bytes y puede ser `null` cuando la plataforma no aporta datos suficientes.

## `POST /api/jobs`

```json
{"url":"https://sitio.example/contenido","format":"video","quality":"720"}
```

`format` acepta `video` o `audio`. Para video, `quality` debe ser una altura devuelta por `video_options` o `best`; para audio acepta `128`, `192` o `320` kbps. Una altura concreta se exige de forma exacta y nunca cae silenciosamente a una superior. Devuelve un trabajo con `id`, `status`, `progress` y `stage`.

## `GET /api/jobs/:id`

Consulta el estado y porcentaje. Estados: `queued`, `processing`, `ready`, `failed` o `cancelled`.

## `DELETE /api/jobs/:id`

Cancela un trabajo activo, detiene el árbol de procesos de `yt-dlp`/FFmpeg y programa la limpieza de sus archivos temporales. Para un trabajo ya terminado, elimina inmediatamente el archivo temporal y el registro.

## `GET /api/jobs/:id/file`

Cuando el trabajo está `ready`, transmite el archivo con `Content-Disposition: attachment` y elimina su copia temporal al cerrarse la respuesta. Esto permite tanto escritura transmitida mediante `showSaveFilePicker` como descarga nativa directa del navegador, sin construir un `Blob` completo en memoria.

## Límites

- Solo HTTP/HTTPS público y puertos 80/443.
- Sin credenciales, cookies, playlists, DRM ni redes privadas.
- Máximo 500 MB y 10 minutos por proceso.
- Los trabajos listos, fallidos o cancelados vencen automáticamente. Sus archivos temporales se eliminan al vencer, al descargarse o al cancelarse.
- La ruta antigua `POST /api/download` no está disponible; todas las descargas usan trabajos cancelables.

## Historial local

El historial no tiene endpoint ni se envía al backend. La interfaz conserva en `localStorage`, con un máximo de 20 entradas, únicamente título, URL fuente, plataforma, formato, calidad, fecha y resultado (`started` o `saved`). No almacena archivos, blobs, nombres temporales ni identificadores de trabajos.
