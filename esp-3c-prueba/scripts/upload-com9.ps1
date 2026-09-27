$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

py -m platformio run
py -m platformio run --target upload --upload-port COM9
py -m platformio device monitor --port COM9 --baud 115200

