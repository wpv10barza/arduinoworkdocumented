# MAX30102 ESP32 MicroPython Web Server

Proyecto MicroPython para ESP32 que lee un sensor MAX30102/MAX30105 por I2C y publica BPM y temperatura en una página web local.

## Componentes

- `boot.py` — conecta el ESP32 a Wi‑Fi mediante valores locales de configuración.
- `main.py` — configura el MAX30102, calcula BPM y sirve la interfaz HTTP.
- `max30102.py` — controlador MicroPython del sensor MAX30102/MAX30105.
- `circular_buffer.py` — buffer circular auxiliar usado por el controlador.
- `web.html` — referencia de la interfaz web.

## Hardware documentado por el código

- ESP32 con MicroPython.
- Sensor MAX30102/MAX30105.
- Bus I2C: SDA GPIO 21 y SCL GPIO 22.
- LED de estado en GPIO 2.

Las credenciales reales no se incorporan. El `boot.py` de origen conserva únicamente los valores literales de ejemplo `ssid` y `password`.

Procedencia: `wpv10barza/MAX30102-webserver` (`master`). El README de origen describía un proyecto distinto («Mine to Mill 2025»), por lo que esta documentación se basó en el código fuente real y no en ese texto inconsistente.
