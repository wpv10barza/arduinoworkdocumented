#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "secrets.h"

#if !USE_INSECURE_TLS && !defined(GATEWAY_ROOT_CA)
#error "Define GATEWAY_ROOT_CA when USE_INSECURE_TLS is 0"
#endif

namespace {
constexpr uint32_t kSerialBaud = 115200;
constexpr uint32_t kReconnectIntervalMs = 15000;
Preferences preferences;
uint32_t lastMessageId = 0;
uint32_t lastPollAt = 0;
uint32_t lastReconnectAt = 0;
String serialLine;
bool configReady = false;

String urlEncode(const String &value) {
  static const char hex[] = "0123456789ABCDEF";
  String encoded;
  encoded.reserve(value.length() * 3);
  for (size_t i = 0; i < value.length(); ++i) {
    const uint8_t c = static_cast<uint8_t>(value[i]);
    const bool unreserved =
        (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' ||
        c == '~';
    if (unreserved) encoded += static_cast<char>(c);
    else {
      encoded += '%';
      encoded += hex[(c >> 4) & 0x0F];
      encoded += hex[c & 0x0F];
    }
  }
  return encoded;
}

void configureTls(WiFiClientSecure &client) {
#if USE_INSECURE_TLS
  client.setInsecure();
#else
  client.setCACert(GATEWAY_ROOT_CA);
#endif
  client.setTimeout(HTTP_TIMEOUT_MS / 1000);
}

bool configurationLooksReady() {
  const String ssid(WIFI_SSID);
  const String gateway(GATEWAY_URL);
  const String key(DEVICE_KEY);
  if (ssid.startsWith("YOUR_") || gateway.indexOf("DEPLOYMENT_ID") >= 0 ||
      key.startsWith("REPLACE_")) {
    Serial.println("[config] Copy secrets.example.h to secrets.h and edit it.");
    return false;
  }
  return true;
}

bool ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  const uint32_t now = millis();
  if (lastReconnectAt != 0 && now - lastReconnectAt < kReconnectIntervalMs) return false;
  lastReconnectAt = now;
  Serial.printf("[wifi] Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED &&
         millis() - startedAt < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[wifi] Connection timed out; retrying later.");
    return false;
  }
  Serial.printf("[wifi] Connected. IP=%s RSSI=%d dBm\n",
                WiFi.localIP().toString().c_str(), WiFi.RSSI());
  return true;
}

bool beginHttp(HTTPClient &http, WiFiClientSecure &client, const String &url) {
  configureTls(client);
  if (!http.begin(client, url)) {
    Serial.println("[http] Unable to initialize request.");
    return false;
  }
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
  http.setReuse(false);
  http.addHeader("User-Agent", "esp32-s3-whatsapp/1.0");
  return true;
}

void handleIncomingMessage(uint32_t id, const String &from, const String &body) {
  Serial.printf("\n[whatsapp] #%lu from %s\n%s\n",
                static_cast<unsigned long>(id), from.c_str(), body.c_str());
  String command(body);
  command.trim();
  command.toLowerCase();
  if (command == "ping") {
    // reply path is implemented in the source project
  } else if (command == "status") {
    // status path is implemented in the source project
  }
}

bool pollIncoming() {
  if (!ensureWiFi()) return false;
  WiFiClientSecure client;
  HTTPClient http;
  if (!beginHttp(http, client, GATEWAY_URL)) return false;
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");
  const String form = "action=poll&device_key=" + urlEncode(DEVICE_KEY) +
                      "&after=" + String(lastMessageId);
  const int status = http.POST(form);
  const String payload = status > 0 ? http.getString() : String();
  http.end();
  client.stop();
  if (status < 200 || status >= 300) return false;
  JsonDocument response;
  if (deserializeJson(response, payload)) return false;
  if (!(response["ok"] | false)) return false;
  const JsonObjectConst message = response["message"].as<JsonObjectConst>();
  if (message.isNull()) return true;
  const uint32_t id = message["id"] | 0U;
  const String from = message["from"] | "unknown";
  const String body = message["body"] | "";
  if (id == 0 || id <= lastMessageId) return true;
  lastMessageId = id;
  preferences.putUInt("last_id", lastMessageId);
  handleIncomingMessage(id, from, body);
  return true;
}

void handleSerialLine(String line) {
  line.trim();
  if (line.isEmpty()) return;
  if (line == "help") {
    Serial.println("Commands: help, status, poll, send <text>");
  } else if (line == "status") {
    Serial.println(WiFi.localIP());
  } else if (line == "poll") {
    pollIncoming();
  }
}

void readSerial() {
  while (Serial.available() > 0) {
    const char c = static_cast<char>(Serial.read());
    if (c == '\r') continue;
    if (c == '\n') {
      handleSerialLine(serialLine);
      serialLine = "";
    } else if (serialLine.length() < 1000) {
      serialLine += c;
    }
  }
}
}

void setup() {
  Serial.begin(kSerialBaud);
  delay(800);
  Serial.println("\nESP32-S3 WhatsApp gateway prototype");
  preferences.begin("whatsapp", false);
  lastMessageId = preferences.getUInt("last_id", 0);
  configReady = configurationLooksReady();
  if (configReady) ensureWiFi();
  Serial.println("Type help for commands.");
}

void loop() {
  readSerial();
  if (!configReady) { delay(50); return; }
  const uint32_t now = millis();
  if (lastPollAt == 0 || now - lastPollAt >= POLL_INTERVAL_MS) {
    lastPollAt = now;
    pollIncoming();
  }
  delay(10);
}
