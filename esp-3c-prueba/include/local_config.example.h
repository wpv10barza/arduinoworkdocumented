#pragma once

// Copie como local_config.h. El archivo real está ignorado por Git.
#define WIFI_SSID_VALUE "CAMBIAR_SSID"
#define WIFI_PASSWORD_VALUE "CAMBIAR_CLAVE"

// IP LAN accesible desde el ESP32. Nunca use 127.0.0.1 aquí.
#define API_BASE_URL_VALUE "http://192.168.1.50:3000"

// Debe coincidir con ESP32_API_TOKEN del archivo .env de asistente-3c.
#define DEVICE_TOKEN_VALUE "CAMBIAR_TOKEN_LARGO"
#define DEVICE_ID_PREFIX_VALUE "esp-hi-3c"

// Entrada física opcional. -1 mantiene todos los GPIO del perro sin tocar.
#define COMMAND_BUTTON_PIN_VALUE -1
#define COMMAND_BUTTON_TEXT_VALUE "Cambiar la tarea T-030 a cada 30 días"

