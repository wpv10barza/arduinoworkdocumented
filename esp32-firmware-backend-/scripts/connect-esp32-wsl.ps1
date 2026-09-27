# ESP32 USB -> WSL2 preparation for the Guition 4848S040 panel.
# Run from PowerShell as Administrator.
[CmdletBinding()]
param(
    [string]$BusId
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================"
Write-Host " ESP32 -> WINDOWS -> WSL2"
Write-Host "============================================================"

if (-not (Get-Command usbipd -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] usbipd no está instalado o no está en PATH." -ForegroundColor Red
    Write-Host ""
    Write-Host "Instale usbipd-win y vuelva a ejecutar este script."
    exit 1
}

Write-Host ""
Write-Host "[1] DISPOSITIVOS USB"
usbipd list

if ([string]::IsNullOrWhiteSpace($BusId)) {
    Write-Host ""
    $BusId = Read-Host "Escriba el BUSID del ESP32-S3-4848S040"
}

if ([string]::IsNullOrWhiteSpace($BusId)) {
    Write-Host "[ERROR] BUSID vacío." -ForegroundColor Red
    exit 2
}

Write-Host ""
Write-Host "[2] COMPARTIR $BusId"
usbipd bind --busid $BusId
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] usbipd bind falló para $BusId." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "[3] ADJUNTAR $BusId A WSL2"
usbipd attach --wsl --busid $BusId
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] usbipd attach falló para $BusId." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "[4] ESTADO FINAL"
usbipd list

Write-Host ""
Write-Host "[5] SHA256 DEL SCRIPT"
$scriptPath = $MyInvocation.MyCommand.Path
if ($scriptPath -and (Test-Path $scriptPath)) {
    Get-FileHash -Algorithm SHA256 -Path $scriptPath | Format-Table -AutoSize
}

Write-Host ""
Write-Host "============================================================"
Write-Host " ESP32 ADJUNTADO A WSL2"
Write-Host "============================================================"
Write-Host ""
Write-Host "Ahora, dentro de WSL, ejecute:"
Write-Host ""
Write-Host '  cd $HOME/projects/4848-production'
Write-Host '  git pull --ff-only'
Write-Host '  bash ./scripts/setup-wsl-env.sh'
Write-Host '  ls -l /dev/ttyACM* /dev/ttyUSB* 2>/dev/null'
Write-Host '  pio device list'
Write-Host ""
Write-Host "Para desconectar al terminar:"
Write-Host "  usbipd detach --busid $BusId"
Write-Host ""
