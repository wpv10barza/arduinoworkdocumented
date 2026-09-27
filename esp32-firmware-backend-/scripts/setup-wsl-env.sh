#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.." || exit 1

VENV_DIR="${VENV_DIR:-.venv}"
PLATFORMIO_VERSION="${PLATFORMIO_VERSION:-6.2.0}"

echo
echo "============================================================"
echo " PREPARAR WSL - VENV + PLATFORMIO"
echo "============================================================"

if ! command -v python3 >/dev/null 2>&1; then
  echo "[ERROR] python3 no está instalado."
  echo "Ubuntu/Debian:"
  echo "  sudo apt update"
  echo "  sudo apt install -y python3 python3-venv python3-pip"
  exit 1
fi

echo
echo "[1] PYTHON"
python3 --version

if ! python3 -m venv --help >/dev/null 2>&1; then
  echo "[INFO] python3-venv no está disponible."
  if command -v sudo >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then
    echo "[INFO] Instalando python3-venv..."
    sudo apt-get update
    sudo apt-get install -y python3-venv
  else
    echo "[ERROR] No se puede instalar python3-venv automáticamente."
    echo "Instale python3-venv y vuelva a ejecutar."
    exit 2
  fi
fi

echo
echo "[2] CREAR / REPARAR .venv"

if [[ ! -d "$VENV_DIR" ]]; then
  python3 -m venv "$VENV_DIR"
else
  python3 -m venv --upgrade "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

echo
echo "[3] ACTIVAR .venv"
echo "Python activo: $(command -v python)"
python --version

echo
echo "[4] ACTUALIZAR PIP"
python -m pip install --upgrade pip

echo
echo "[5] INSTALAR PLATFORMIO $PLATFORMIO_VERSION"
python -m pip install --upgrade "platformio==$PLATFORMIO_VERSION"

echo
echo "[6] VERIFICAR"
echo "PlatformIO:"
pio --version
echo "pio:"
command -v pio

echo
echo "[7] SERIAL WSL"
ls -l /dev/ttyACM* /dev/ttyUSB* 2>/dev/null || true

echo
echo "[8] PLATFORMIO DEVICES"
pio device list || true

echo
echo "[9] SHA256 DE LOS SCRIPTS"
sha256sum scripts/connect-esp32-wsl.ps1 scripts/setup-wsl-env.sh scripts/flash-panel.sh

echo
echo "============================================================"
echo " WSL + VENV + PLATFORMIO LISTOS"
echo "============================================================"
echo
echo "Para reactivar:"
echo "  cd "$PWD""
echo "  source .venv/bin/activate"
echo
echo "Para compilar/cargar:"
echo "  ./scripts/flash-panel.sh"
echo
echo "Para abrir monitor:"
echo "  ./scripts/flash-panel.sh --monitor"
