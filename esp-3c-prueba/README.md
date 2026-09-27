# ESP-Hi 3C · puente seguro hacia WSL

Firmware para el **ESP-Hi Mechanical Dog**, basado en `ESP32-C3-MINI-1-N4`.
Recibe instrucciones por el puerto serie, conserva una instrucción pendiente en
NVS si no hay red y la entrega al backend `asistente-3c` mediante HTTP.

La respuesta HTTP `202` significa únicamente que la instrucción quedó pendiente
de revisión. El dispositivo no escribe directamente en Google Sheets: la
interfaz web reconstruye la vista previa y exige confirmación humana.

## Contrato de red

- Salud: `GET /api/device/v1/health`
- Instrucción: `POST /api/device/v1/commands`
- Autenticación: `X-3C-Device-Token`
- Cuerpo: `device_id`, `request_id` y `text`
- Idempotencia: se reusa el mismo `request_id` hasta recibir HTTP `200` o `202`

## Preparar configuración

```bash
cd ~/projects/esp-3c-prueba
cp include/local_config.example.h include/local_config.h
nano include/local_config.h
```

Use la IP LAN de Windows o del servidor accesible desde la misma red que el
ESP32, por ejemplo `http://192.168.1.50:3000`. No configure `127.0.0.1` en el
dispositivo.

## Compilar en WSL

PlatformIO debe instalarse en un entorno separado del backend Node/Python:

```bash
cd ~/projects/esp-3c-prueba
python3 -m venv .venv
source .venv/bin/activate
pip install platformio
pio run
```

## Cargar desde Windows usando COM9

Abra PowerShell en la carpeta clonada y ejecute:

```powershell
py -m pip install platformio
py -m platformio run --target upload --upload-port COM9
py -m platformio device monitor --port COM9 --baud 115200
```

La placa seleccionada es `esp32-c3-devkitm-1`. No seleccione ESP8266.

## Cargar desde WSL

`COM9` no existe directamente dentro de WSL. Después de adjuntar el USB con
`usbipd`, compruebe el nombre Linux y cargue, por ejemplo:

```bash
ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null
pio run --target upload --upload-port /dev/ttyACM0
pio device monitor --port /dev/ttyACM0 --baud 115200
```

## Operación por el monitor serie

```text
STATUS
SEND Cambiar la tarea T-030 a cada 30 días
RETRY
HELP
```

Una línea que no empiece con una orden reservada también se interpreta como una
instrucción. Mientras exista una instrucción pendiente no se acepta otra, para
evitar perderla.

## Seguridad del hardware

Esta versión no activa servos SG92R, TFT 160×80, audio ni WS2812. Esos GPIO deben
tomarse del esquema oficial de Mainboard V1.2.1 y ServoDogBoard V1.0.2. La capa
de comunicación puede probarse sin mover el perro ni arriesgar sus actuadores.

## Prueba contra el backend WSL

Con `asistente-3c` ejecutándose en el puerto 3000:

```bash
ESP32_API_TOKEN='el-mismo-token-del-env' \
API_BASE_URL='http://127.0.0.1:3000' \
./scripts/wsl-contract-smoke-test.sh
```
