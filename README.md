# arduinoworkdocumented

Repositorio para proyectos Arduino, ESP32, ESP32-S3, firmware y sistemas embebidos.

## Proyectos incorporados

- `esp32-firmware-backend-/` — línea de firmware ESP32-S3 con PlatformIO, API de dispositivo, teclado virtual, command buffer, viewport, pruebas y workflows de GitHub Actions. Procedencia: `wpv10barza/esp32-firmware-backend-`.
- `esp32-wsp/` — prototipo ESP32-S3 de mensajería bidireccional WhatsApp mediante Google Apps Script/Twilio, con sketch Arduino, relay y pruebas. Procedencia: `wpv10barza/esp32-wsp`.
- `esp-3c-prueba/` — firmware ESP32-C3 para el puente hacia Asistente 3C, con contrato HTTP, persistencia NVS, reintentos e integración de CI. Procedencia: `wpv10barza/esp-3c-prueba`.
- `esp32-demo/` — proyecto Waveshare ESP32-S3 para cuenta regresiva de Google Calendar, con perfil de hardware, detección segura de placa y automatización de compilación/carga. Procedencia: `wpv10barza/esp32-demo`.

## Criterio de organización

Los proyectos embebidos se clasifican por tecnología y hardware antes que por periodo cronológico. Cada proyecto conserva su identidad dentro de una carpeta propia.

Se excluyeron dependencias descargadas, entornos virtuales, cachés, artefactos de compilación, credenciales y secretos.

`bemoreagent` está excluido y no fue modificado.

## Fuentes relacionadas conservadas aparte

Las variantes del panel ESP32-S3-4848S040 y sus repositorios relacionados no se duplican aquí cuando su contenido corresponde a la misma línea de desarrollo. Permanecen en sus repositorios fuente para conservar historial e identidad.
