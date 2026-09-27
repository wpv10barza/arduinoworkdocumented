# ESP32-S3 two-way WhatsApp prototype

This project lets an ESP32-S3 send WhatsApp messages and receive simple WhatsApp
commands over Wi-Fi. It uses:

- an ESP32-S3 running the Arduino framework;
- a Google Apps Script web app as a small cloud relay; and
- the Twilio WhatsApp Sandbox for development.

No SIM card is required. Twilio receives public WhatsApp webhooks, while the
ESP32 polls the relay because a device on a home Wi-Fi network cannot normally
accept an inbound Internet webhook.

```mermaid
flowchart LR
    A["WhatsApp phone"] <--> B["Twilio Sandbox"]
    B <--> C["Apps Script relay"]
    C <--> D["ESP32-S3 over Wi-Fi"]
```

## What works

- Enter `send Hello from ESP32` in Serial Monitor to send a WhatsApp message.
- Send `ping` from WhatsApp and the ESP32 replies with `pong from ESP32-S3`.
- Send `status` from WhatsApp and the ESP32 replies with its uptime, RSSI, and IP.
- Other inbound WhatsApp messages are printed in Serial Monitor.
- The last processed message ID is saved in ESP32 non-volatile storage, avoiding
  duplicate command execution after a reboot.
- GitHub Actions compiles the sketch for ESP32-S3 with Arduino-ESP32 3.3.11.

This first version uses Serial Monitor for its user interface. The networking
code is compatible with both the Waveshare 2.1-inch LCD and 2.06-inch AMOLED
families. Their display and touch drivers are different, so add the visual UI
only after confirming the exact model printed on the back of the board.

## 1. Prepare the Twilio WhatsApp Sandbox

1. Create or open a Twilio account.
2. Open the WhatsApp Sandbox / **Try WhatsApp** area.
3. From your phone, send the displayed `join ...` phrase to the Twilio Sandbox
   number.
4. Copy these values for the next section:
   - Account SID
   - Auth Token
   - Sandbox sender, normally `whatsapp:+14155238886`
   - your destination in E.164 format, for example `whatsapp:+519XXXXXXXX`

The Sandbox is for testing. A phone must join your Sandbox, and free-form
outbound messages are normally allowed only in the 24-hour customer-service
window opened by an inbound user message. Production alerts require an approved
WhatsApp sender and, when applicable, approved templates.

## 2. Deploy the Google Apps Script relay

1. Create a standalone project at <https://script.google.com/>.
2. Replace its `Code.gs` with
   [`gateway/google-apps-script/Code.gs`](gateway/google-apps-script/Code.gs).
3. In **Project settings > Script properties**, create the following properties:

| Property | Example |
|---|---|
| `DEVICE_KEY` | a new random string of at least 32 characters |
| `TWILIO_ACCOUNT_SID` | `AC...` |
| `TWILIO_AUTH_TOKEN` | your Twilio Auth Token |
| `TWILIO_FROM` | `whatsapp:+14155238886` |
| `TWILIO_TO` | `whatsapp:+519XXXXXXXX` |
| `TWILIO_WEBHOOK_KEY` | a second random string of at least 32 characters |
| `ALLOWED_WHATSAPP_FROM` | `whatsapp:+519XXXXXXXX` |

Generate different values for `DEVICE_KEY` and `TWILIO_WEBHOOK_KEY`. Never put
the Twilio Auth Token in this repository or in the ESP32 firmware.

4. Choose **Deploy > New deployment > Web app**.
5. Execute the app as yourself and allow access to **Anyone**.
6. Copy the deployment URL ending in `/exec`.
7. In Twilio's Sandbox configuration, set **When a message comes in** to HTTP
   `POST` and use:

   ```text
   https://script.google.com/macros/s/DEPLOYMENT_ID/exec?twilio_key=YOUR_TWILIO_WEBHOOK_KEY
   ```

8. Test relay health in a browser:

   ```text
   https://script.google.com/macros/s/DEPLOYMENT_ID/exec?action=health
   ```

It should return JSON containing `"ok":true`.

## 3. Configure and compile the ESP32-S3

Copy the example configuration:

```bash
cp firmware/whatsapp_gateway/secrets.example.h \
   firmware/whatsapp_gateway/secrets.h
```

Edit `secrets.h` and set:

- your 2.4 GHz Wi-Fi SSID and password;
- the Apps Script deployment URL ending in `/exec`; and
- the same `DEVICE_KEY` stored in Apps Script.

Install the toolchain and compile:

```bash
arduino-cli core update-index
arduino-cli core install esp32:esp32@3.3.11
arduino-cli lib install ArduinoJson@7.4.3
arduino-cli compile \
  --fqbn 'esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB' \
  firmware/whatsapp_gateway
```

Upload from Windows PowerShell, replacing `COM10` with the port that actually
reports an ESP32-S3:

```powershell
arduino-cli upload `
  -p COM10 `
  --fqbn "esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB" `
  firmware/whatsapp_gateway
```

Open Serial Monitor at 115200 baud and type `help`.

> Important: if `esptool chip-id` reports `ESP32-D0WD-V3`, that port is a
> classic ESP32 and is not the Waveshare ESP32-S3. Do not upload this S3 build to
> that port.

## Security scope

This is a small development prototype, not a production WhatsApp gateway.

- `secrets.h` is ignored by Git.
- Twilio credentials stay in Apps Script and are never stored on the ESP32.
- The device and Twilio webhook use separate shared keys.
- Inbound messages can be restricted to `ALLOWED_WHATSAPP_FROM`.
- For the easiest first test, `secrets.example.h` enables TLS without server
  certificate verification. This is vulnerable to a man-in-the-middle attack.
  Before production use, set `USE_INSECURE_TLS` to `0` and provide a maintained
  root CA certificate, or move the relay to infrastructure with a certificate
  strategy you control.
- Google Apps Script does not expose all request headers needed for normal
  `X-Twilio-Signature` verification. The development relay therefore protects
  its Twilio webhook with a long secret URL parameter. Use a server capable of
  Twilio signature verification for production.

## Serial commands

| Command | Result |
|---|---|
| `help` | Shows the command list |
| `status` | Shows local Wi-Fi/device state |
| `poll` | Immediately checks for one inbound message |
| `send <text>` | Sends `<text>` to the configured WhatsApp recipient |

## Troubleshooting

- **`401` or `unauthorized`:** `DEVICE_KEY` differs between Apps Script and
  `secrets.h`.
- **No inbound command:** confirm Twilio uses HTTP POST and the webhook URL has
  the correct `twilio_key`.
- **No outbound message:** first send a WhatsApp message to the Sandbox to open
  the test conversation window, then inspect the Apps Script execution log.
- **ESP32 continually reconnects:** the ESP32-S3 supports 2.4 GHz Wi-Fi, not a
  5 GHz-only SSID.
- **Wrong serial chip:** identify each COM port with `esptool chip-id` before
  uploading.

