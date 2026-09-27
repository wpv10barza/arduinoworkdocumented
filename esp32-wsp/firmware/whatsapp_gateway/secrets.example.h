#pragma once

// Copy this file to secrets.h and edit only the copied file.
// secrets.h is ignored by Git.

#define WIFI_SSID "YOUR_2_4_GHZ_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// Google Apps Script Web App deployment URL. It must end in /exec.
#define GATEWAY_URL "https://script.google.com/macros/s/DEPLOYMENT_ID/exec"

// Must exactly match the DEVICE_KEY Script Property in Apps Script.
#define DEVICE_KEY "REPLACE_WITH_A_RANDOM_KEY_OF_AT_LEAST_32_CHARACTERS"

// Development default. This encrypts traffic but does not authenticate the
// server certificate, so it is vulnerable to man-in-the-middle attacks.
#define USE_INSECURE_TLS 1

// If USE_INSECURE_TLS is 0, define GATEWAY_ROOT_CA as adjacent C string
// literals containing the maintained PEM certificate and explicit \n markers.

#define POLL_INTERVAL_MS 5000UL
#define WIFI_CONNECT_TIMEOUT_MS 20000UL
#define HTTP_TIMEOUT_MS 15000U

// Set to 1 only after basic receive/poll testing works.
#define SEND_BOOT_MESSAGE 0
