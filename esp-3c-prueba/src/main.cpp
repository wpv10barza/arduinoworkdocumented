#include <Arduino.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <esp_system.h>

#if __has_include("local_config.h")
#include "local_config.h"
#else
#error "Copie include/local_config.example.h como include/local_config.h y configure red, URL y token."
#endif

namespace {
constexpr uint32_t kWifiRetryMs = 15000;
constexpr uint32_t kDeliveryRetryMs = 10000;
constexpr uint32_t kHttpTimeoutMs = 10000;
constexpr size_t kMaxCommandLength = 1000;

Preferences preferences;
String deviceId;
String pendingText;
String pendingRequestId;
String serialLine;
uint32_t lastWifiAttempt = 0;
uint32_t lastDeliveryAttempt = 0;

String normalizedBaseUrl() {
  String value(API_BASE_URL_VALUE);
  value.trim();
  while (value.endsWith("/")) value.remove(value.length() - 1);
  return value;
}

String jsonEscape(const String &input) {
  String output;
  output.reserve(input.length() + 16);
  for (size_t index = 0; index < input.length(); ++index) {
    const char value = input[index];
    switch (value) {
      case '\\': output += "\\\\"; break;
      case '"': output += "\\\""; break;
      case '\n': output += "\\n"; break;
      case '\r': output += "\\r"; break;
      case '\t': output += "\\t"; break;
      default:
        if (static_cast<uint8_t>(value) >= 0x20) output += value;
        break;
    }
  }
  return output;
}

String buildDeviceId() {
  const uint64_t mac = ESP.getEfuseMac();
  char suffix[13];
  snprintf(
      suffix,
      sizeof(suffix),
      "%02X%02X%02X",
      static_cast<unsigned>((mac >> 16) & 0xFF),
      static_cast<unsigned>((mac >> 8) & 0xFF),
      static_cast<unsigned>(mac & 0xFF));
  return String(DEVICE_ID_PREFIX_VALUE) + "-" + suffix;
}

String newRequestId() {
  char randomPart[17];
  snprintf(randomPart, sizeof(randomPart), "%08lX%08lX",
           static_cast<unsigned long>(esp_random()),
           static_cast<unsigned long>(esp_random()));
  return deviceId + "-" + randomPart;
}

void savePending() {
  preferences.putString("text", pendingText);
  preferences.putString("request", pendingRequestId);
}

void clearPending() {
  pendingText = "";
  pendingRequestId = "";
  preferences.remove("text");
  preferences.remove("request");
}

void printStatus() {
  Serial.println("\n=== ESP-HI 3C ===");
  Serial.printf("device_id: %s\n", deviceId.c_str());
  Serial.printf("wifi: %s\n", WiFi.status() == WL_CONNECTED ? "conectado" : "sin conexion");
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("ip: %s\n", WiFi.localIP().toString().c_str());
  }
  Serial.printf("backend: %s\n", normalizedBaseUrl().c_str());
  Serial.printf("pendiente: %s\n", pendingText.isEmpty() ? "no" : "si");
  if (!pendingText.isEmpty()) Serial.printf("request_id: %s\n", pendingRequestId.c_str());
  Serial.println("=================\n");
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (lastWifiAttempt != 0 && millis() - lastWifiAttempt < kWifiRetryMs) return;
  lastWifiAttempt = millis();
  Serial.printf("[wifi] conectando a %s\n", WIFI_SSID_VALUE);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID_VALUE, WIFI_PASSWORD_VALUE);
  const uint32_t deadline = millis() + 8000;
  while (WiFi.status() != WL_CONNECTED && millis() < deadline) delay(150);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] conectado: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("[wifi] no disponible; la instruccion permanece en NVS");
  }
}

void checkBackendHealth() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.setTimeout(kHttpTimeoutMs);
  const String url = normalizedBaseUrl() + "/api/device/v1/health";
  if (!http.begin(url)) {
    Serial.println("[api] URL de health invalida");
    return;
  }
  const int status = http.GET();
  Serial.printf("[api] health HTTP %d\n", status);
  if (status > 0) Serial.println(http.getString());
  http.end();
}

bool deliverPending() {
  if (pendingText.isEmpty() || WiFi.status() != WL_CONNECTED) return false;
  if (lastDeliveryAttempt != 0 && millis() - lastDeliveryAttempt < kDeliveryRetryMs) return false;
  lastDeliveryAttempt = millis();

  const String body =
      "{\"device_id\":\"" + jsonEscape(deviceId) +
      "\",\"request_id\":\"" + jsonEscape(pendingRequestId) +
      "\",\"text\":\"" + jsonEscape(pendingText) + "\"}";

  HTTPClient http;
  http.setTimeout(kHttpTimeoutMs);
  const String url = normalizedBaseUrl() + "/api/device/v1/commands";
  if (!http.begin(url)) {
    Serial.println("[api] URL de commands invalida");
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-3C-Device-Token", DEVICE_TOKEN_VALUE);
  const int status = http.POST(body);
  const String response = status > 0 ? http.getString() : http.errorToString(status);
  http.end();

  Serial.printf("[api] commands HTTP %d\n", status);
  Serial.println(response);
  if (status == 200 || status == 202) {
    clearPending();
    Serial.println("[api] instruccion aceptada; ahora requiere confirmacion humana en la interfaz");
    return true;
  }
  Serial.println("[api] entrega pendiente; se reintentara con el mismo request_id");
  return false;
}

void queueCommand(String text) {
  text.trim();
  if (text.isEmpty()) return;
  if (text.length() > kMaxCommandLength) {
    Serial.printf("[input] maximo %u caracteres\n", static_cast<unsigned>(kMaxCommandLength));
    return;
  }
  if (!pendingText.isEmpty()) {
    Serial.println("[input] ya existe una instruccion pendiente; espere su entrega");
    return;
  }
  pendingText = text;
  pendingRequestId = newRequestId();
  savePending();
  lastDeliveryAttempt = 0;
  Serial.printf("[input] guardada: %s\n", pendingRequestId.c_str());
  deliverPending();
}

void handleSerialLine(String line) {
  line.trim();
  if (line.isEmpty()) return;
  if (line.equalsIgnoreCase("STATUS")) {
    printStatus();
  } else if (line.equalsIgnoreCase("RETRY")) {
    lastWifiAttempt = 0;
    lastDeliveryAttempt = 0;
    connectWifi();
    deliverPending();
  } else if (line.equalsIgnoreCase("HEALTH")) {
    checkBackendHealth();
  } else if (line.equalsIgnoreCase("HELP")) {
    Serial.println("Comandos: STATUS, HEALTH, RETRY, SEND <instruccion>");
  } else if (line.startsWith("SEND ") || line.startsWith("send ")) {
    queueCommand(line.substring(5));
  } else {
    queueCommand(line);
  }
}

void readSerial() {
  while (Serial.available()) {
    const char value = static_cast<char>(Serial.read());
    if (value == '\n') {
      handleSerialLine(serialLine);
      serialLine = "";
    } else if (value != '\r' && serialLine.length() <= kMaxCommandLength + 8) {
      serialLine += value;
    }
  }
}

#if COMMAND_BUTTON_PIN_VALUE >= 0
void checkCommandButton() {
  static bool previous = HIGH;
  const bool current = digitalRead(COMMAND_BUTTON_PIN_VALUE);
  if (previous == HIGH && current == LOW) queueCommand(COMMAND_BUTTON_TEXT_VALUE);
  previous = current;
}
#endif
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(900);
  preferences.begin("asistente3c", false);
  deviceId = buildDeviceId();
  pendingText = preferences.getString("text", "");
  pendingRequestId = preferences.getString("request", "");
  if (!pendingText.isEmpty() && pendingRequestId.isEmpty()) {
    pendingRequestId = newRequestId();
    savePending();
  }

#if COMMAND_BUTTON_PIN_VALUE >= 0
  pinMode(COMMAND_BUTTON_PIN_VALUE, INPUT_PULLUP);
#endif

  Serial.println("\nESP-Hi 3C iniciado. Escriba HELP.");
  connectWifi();
  checkBackendHealth();
  deliverPending();
  printStatus();
}

void loop() {
  readSerial();
  connectWifi();
  deliverPending();
#if COMMAND_BUTTON_PIN_VALUE >= 0
  checkCommandButton();
#endif
  delay(10);
}
