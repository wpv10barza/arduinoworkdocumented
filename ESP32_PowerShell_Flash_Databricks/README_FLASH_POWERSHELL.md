# Flash completo desde PowerShell — ESP32-S3-4848S040

Este notebook conserva el procedimiento de actualización del repositorio `wpv10barza/erp-mantto-esp32`, validación y flash completo del panel desde **Windows PowerShell**.

> Colab sirve aquí como documento de consulta en Drive. El flash físico del ESP32 se hace desde PowerShell en la PC donde está conectado el USB; Colab no controla ese puerto COM local.

## 1. Requisitos

```powershell
git --version
py --version
py -m pip install --upgrade platformio==6.2.0
pio --version
```

## 2. Actualizar `main`

```powershell
cd $HOME\erp-mantto-esp32
git fetch origin main --prune
git checkout main
git reset --hard origin/main
git clean -fd -e include/local_config.h

$Main = (git rev-parse HEAD).Trim()
$Remote = ((git ls-remote origin refs/heads/main) -split "\s+")[0]
"LOCAL  = $Main"
"REMOTE = $Remote"
if ($Main -ne $Remote) { throw "El repositorio local no coincide con origin/main" }
```

Si todavía no existe el repositorio:

```powershell
cd $HOME
git clone https://github.com/wpv10barza/erp-mantto-esp32.git
cd .\erp-mantto-esp32
```

## 3. Configuración privada

```powershell
if (-not (Test-Path .\include\local_config.h)) {
  Copy-Item .\include\local_config.example.h .\include\local_config.h
  notepad .\include\local_config.h
}
git check-ignore .\include\local_config.h
```

Completa localmente Wi‑Fi, OAuth de Databricks y Device API token. No subas ese archivo a GitHub.

## 4. Pruebas

```powershell
python .\tests\test_panel_state_contract.py
python .\tests\test_final_ui_contract.py
python .\tests\test_wifi_source.py
python .\tests\test_command_editor_integration.py
python .\tests\test_touch_gpio_contract.py
python .\test\command_buffer_regression.py
python .\tests\test_production_firmware.py
pio test -e native
```

## 5. Compilar firmware

```powershell
pio run -e panel_4848s040
```

## 6. Detectar puerto COM

```powershell
pio device list
[System.IO.Ports.SerialPort]::GetPortNames()
```

## 7. Flash completo limpio

Sustituye `COM5` por el puerto real:

```powershell
$Port = "COM5"
pio run -e panel_4848s040 -t erase --upload-port $Port
pio run -e panel_4848s040 -t upload --upload-port $Port
```

## 8. Monitor serie

```powershell
pio device monitor --port $Port --baud 115200
```

## 9. Verificación física

Comprueba:
- precisión de cada botón del menú principal;
- retorno `INICIO` desde `EDITAR ORDEN 3C`;
- teclado ABC/123 centrado;
- BKSP, SPACE, ENTER;
- cursor izquierda/derecha, DEL y LIMPIAR;
- `PROBAR CLOUD` para Databricks + Google Sheets;
- `ENVIAR 3C`.

## 10. GitHub Actions

```powershell
gh run list --repo wpv10barza/erp-mantto-esp32 --branch main --limit 10
```

No flashees como versión final un commit cuyo workflow **Firmware CD** esté fallando.

## Seguridad

Nunca guardes contraseñas, client secrets ni tokens dentro del notebook, README o repositorio. Las credenciales del ESP32 deben quedar únicamente en `include/local_config.h`, que está ignorado por Git.
