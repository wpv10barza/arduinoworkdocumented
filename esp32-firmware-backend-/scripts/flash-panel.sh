#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

ENVIRONMENT="panel_4848s040"
BAUD="115200"
PORT=""
OPEN_MONITOR="false"

usage() {
  cat <<'EOF'
Uso:
  ./scripts/flash-panel.sh
  ./scripts/flash-panel.sh --monitor
  ./scripts/flash-panel.sh --port /dev/ttyACM0
  ./scripts/flash-panel.sh --port /dev/ttyUSB0 --monitor

El script compila y carga el firmware. El monitor serie es opcional con --monitor
para evitar errores cuando el terminal no es interactivo (por ejemplo, tareas
automatizadas, terminales integradas o scripts de WSL).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port|-p)
      [[ $# -ge 2 ]] || { echo "ERROR: --port requiere una ruta." >&2; exit 64; }
      PORT="$2"
      shift 2
      ;;
    --monitor|-m)
      OPEN_MONITOR="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: argumento desconocido: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

if [[ ! -f include/local_config.h ]]; then
  echo "ERROR: falta include/local_config.h."
  echo "       Use include/local_config.example.h como base."
  exit 2
fi

if ! command -v pio >/dev/null 2>&1; then
  echo "ERROR: PlatformIO no está disponible en PATH."
  echo "       Compruebe: pio --version"
  echo "       O instálelo en el entorno Python activo."
  exit 127
fi

echo "== Compilación =="
if ! pio run -e "$ENVIRONMENT"; then
  echo "ERROR: la compilación de $ENVIRONMENT falló."
  echo "       El firmware no se intentó cargar."
  exit 10
fi

echo "Firmware compilado correctamente."

detect_port() {
  local ports=()
  mapfile -t ports < <(find /dev -maxdepth 1 -type c \( -name 'ttyACM*' -o -name 'ttyUSB*' \) -print 2>/dev/null | sort)

  if ((${#ports[@]} == 1)); then
    printf '%s\n' "${ports[0]}"
    return 0
  fi

  if ((${#ports[@]} > 1)); then
    echo "ERROR: WSL muestra varios puertos serie:" >&2
    printf '  %s\n' "${ports[@]}" >&2
    echo "       Indique uno con --port /dev/ttyACM0 o --port /dev/ttyUSB0." >&2
  else
    echo "ERROR: WSL no muestra ningún /dev/ttyACM* ni /dev/ttyUSB*." >&2
  fi
  return 1
}

if [[ -z "$PORT" ]]; then
  if ! PORT="$(detect_port)"; then
    echo
    echo "Diagnóstico en WSL:"
    echo "  pio device list"
    echo "  command -v lsusb && lsusb || echo 'lsusb no está instalado'"
    echo "  ls -l /dev/ttyACM* /dev/ttyUSB*"
    echo
    echo "Si Windows detecta el ESP32 pero WSL no, adjunte el USB a WSL 2 con usbipd."
    echo "Después ejecute de nuevo este script."
    exit 20
  fi
fi

if [[ ! -e "$PORT" ]]; then
  echo "ERROR: el puerto no existe: $PORT"
  echo "       Ejecute: pio device list"
  exit 21
fi

if [[ ! -r "$PORT" || ! -w "$PORT" ]]; then
  echo "ERROR: no hay permisos de lectura/escritura sobre $PORT"
  ls -l "$PORT" || true
  echo "       Revise los grupos/permisos del dispositivo serie."
  exit 22
fi

echo "Puerto seleccionado: $PORT"
echo "== Carga =="

set +e
pio run -e "$ENVIRONMENT" -t upload --upload-port "$PORT"
STATUS=$?
set -e

if [[ $STATUS -ne 0 ]]; then
  echo
  echo "ERROR: PlatformIO no pudo cargar el firmware en $PORT (exit $STATUS)."
  echo "Diagnóstico:"
  echo "  pio device list"
  echo "  ls -l $PORT"
  echo "  python3 -m serial.tools.list_ports"
  echo "Si el ESP32 reinició y cambió de puerto, desconecte/reconecte USB y pruebe otra vez."
  exit "$STATUS"
fi

echo "Carga completada correctamente en $PORT"

if [[ "$OPEN_MONITOR" == "true" ]]; then
  echo "== Monitor serie ($BAUD) =="
  exec pio device monitor --port "$PORT" --baud "$BAUD"
fi

echo "Monitor no abierto. Para abrirlo manualmente:"
echo "  pio device monitor --port \"$PORT\" --baud $BAUD"
echo "  o: ./scripts/flash-panel.sh --port \"$PORT\" --monitor"
