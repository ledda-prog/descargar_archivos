# Pruebas

## Automatizadas

Requisito: Node.js 20 o posterior.

```powershell
node --test backend/test.js
```

Las pruebas no descargan contenido ni usan la red. Cubren validación, trabajos cancelables, formatos, fallback sin `Blob`, historial, configuración pública segura y fallbacks de compartir.

## Smoke test manual

Usar únicamente contenido propio o autorizado.

1. **yt-dlp:** ejecutar `yt-dlp --version`; confirmar que muestra una versión y que el backend lo detecta como disponible.
2. **Formatos:** consultar un enlace público autorizado y confirmar que el selector muestra únicamente resoluciones ofrecidas por ese contenido. Cambiar entre video y audio y verificar que actualiza resolución/calidad y tamaño estimado.
3. **Descarga:** descargar una resolución concreta y comprobar que el archivo resultante no usa una altura superior; repetir con **Mejor disponible**. Confirmar estados, nombre, extensión y tamaño razonables.
4. **Guardar como:** pulsar **Descargar** y verificar que el navegador abre su selector de ubicación cuando esa preferencia está habilitada. Elegir una carpeta temporal y confirmar que el archivo se abre correctamente. La web no puede imponer una ruta sin aprobación del usuario.
5. **Fallback:** probar en un navegador sin File System Access API o desactivar el selector. Confirmar que aparece **Descarga iniciada**, que el gestor nativo muestra el progreso y que el archivo llega a la carpeta configurada, incluso con un archivo grande y sin un aumento equivalente en la memoria de la pestaña.
6. **Compartir:** desde HTTPS o localhost, pulsar **Compartir**. En un dispositivo compatible, confirmar que aparece el panel nativo y permite WhatsApp u otra app. En escritorio sin Web Share API, confirmar que se ofrece copiar el enlace o abrir el enlace de WhatsApp, sin enviar nada automáticamente.
7. **Seguridad:** probar `file:`, `ftp:`, `localhost`, `127.0.0.1`, `[::1]` y una IP privada. Todos deben rechazarse antes de ejecutar yt-dlp.
8. **Cancelar:** durante una descarga, pulsar **Cancelar**. Confirmar el estado cancelado, que el porcentaje deja de avanzar y que no quedan procesos `yt-dlp`/FFmpeg de ese trabajo.
9. **Historial:** completar más de una descarga y comprobar título, fuente, plataforma, formato, calidad, fecha y resultado. Repetir una combinación para confirmar que no se duplica y verificar el límite de 20.
10. **Reintentar:** pulsar **Reintentar** y confirmar que repone enlace, formato y calidad, desmarca el consentimiento y no consulta ni descarga hasta una acción manual.
11. **Administrar historial:** eliminar una entrada y después usar **Borrar historial**. Probar también con `localStorage` bloqueado o con JSON inválido y confirmar que la descarga sigue funcionando.
12. **Compartir local:** sin `PUBLIC_BASE_URL`, comprobar que copiar, compartir y WhatsApp usan la URL actual y muestran que localhost/127.0.0.1 solo funciona en el mismo equipo.
13. **Configuración pública:** iniciar con una URL HTTPS real en `PUBLIC_BASE_URL`, consultar `/api/config` y confirmar que las tres acciones usan exactamente esa URL. Verificar que una URL HTTP pública impide iniciar el backend.
14. **Limpieza:** confirmar que los archivos temporales del servidor se eliminan al completar, cancelar, fallar o vencer el tiempo de retención.

Resultado esperado: ninguna descarga comienza sin acción explícita; el usuario elige el destino mediante el navegador; compartir requiere confirmación en la aplicación seleccionada.
