const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'gateway', 'google-apps-script', 'Code.gs'),
  'utf8',
);

function createRelay() {
  const values = new Map([
    ['DEVICE_KEY', 'device-key-1234567890123456789012'],
    ['TWILIO_ACCOUNT_SID', 'AC123'],
    ['TWILIO_AUTH_TOKEN', 'auth-token'],
    ['TWILIO_FROM', 'whatsapp:+14155238886'],
    ['TWILIO_TO', 'whatsapp:+51999999999'],
    ['TWILIO_WEBHOOK_KEY', 'webhook-key-12345678901234567890'],
    ['ALLOWED_WHATSAPP_FROM', 'whatsapp:+51999999999'],
  ]);
  const fetchCalls = [];

  const properties = {
    getProperty(name) {
      return values.has(name) ? values.get(name) : null;
    },
    setProperties(entries) {
      Object.entries(entries).forEach(([key, value]) => values.set(key, value));
    },
  };

  const context = vm.createContext({
    console,
    ContentService: {
      MimeType: { JSON: 'application/json', XML: 'application/xml' },
      createTextOutput(text) {
        return {
          text,
          mimeType: null,
          setMimeType(mimeType) {
            this.mimeType = mimeType;
            return this;
          },
        };
      },
    },
    LockService: {
      getScriptLock() {
        return { waitLock() {}, releaseLock() {} };
      },
    },
    PropertiesService: {
      getScriptProperties() {
        return properties;
      },
    },
    UrlFetchApp: {
      fetch(url, options) {
        fetchCalls.push({ url, options });
        return {
          getResponseCode: () => 201,
          getContentText: () => JSON.stringify({ sid: 'SM-outbound', status: 'queued' }),
        };
      },
    },
    Utilities: {
      base64Encode(value) {
        return Buffer.from(value, 'utf8').toString('base64');
      },
      newBlob(value) {
        return {
          getBytes() {
            return Array.from(Buffer.from(value, 'utf8'));
          },
        };
      },
    },
  });

  vm.runInContext(source, context, { filename: 'Code.gs' });
  return { context, fetchCalls, values };
}

function json(output) {
  return JSON.parse(output.text);
}

test('health endpoint is public and contains no credentials', () => {
  const { context } = createRelay();
  const response = json(context.doGet({ parameter: { action: 'health' } }));

  assert.equal(response.ok, true);
  assert.equal(response.service, 'esp32-whatsapp-relay');
  assert.equal(JSON.stringify(response).includes('auth-token'), false);
});

test('device poll rejects a wrong key', () => {
  const { context } = createRelay();
  const response = json(context.doPost({
    parameter: { action: 'poll', device_key: 'wrong', after: '0' },
  }));

  assert.deepEqual(response, { ok: false, error: 'unauthorized' });
});

test('Twilio inbound message is queued once and can be polled', () => {
  const { context, values } = createRelay();
  const inbound = {
    parameter: {
      Body: 'ping',
      From: 'whatsapp:+51999999999',
      To: 'whatsapp:+14155238886',
      MessageSid: 'SM-inbound-1',
      twilio_key: 'webhook-key-12345678901234567890',
    },
  };

  assert.match(context.doPost(inbound).text, /<Response><\/Response>/);
  context.doPost(inbound); // Simulate a Twilio retry.

  const storedQueue = JSON.parse(values.get('INBOUND_QUEUE'));
  assert.equal(storedQueue.length, 1);

  const firstPoll = json(context.doPost({
    parameter: {
      action: 'poll',
      device_key: 'device-key-1234567890123456789012',
      after: '0',
    },
  }));
  assert.equal(firstPoll.ok, true);
  assert.equal(firstPoll.message.id, 1);
  assert.equal(firstPoll.message.body, 'ping');

  const nextPoll = json(context.doPost({
    parameter: {
      action: 'poll',
      device_key: 'device-key-1234567890123456789012',
      after: '1',
    },
  }));
  assert.equal(nextPoll.message, null);
});

test('device send calls Twilio with the fixed configured recipient', () => {
  const { context, fetchCalls } = createRelay();
  const response = json(context.doPost({
    parameter: {
      action: 'send',
      device_key: 'device-key-1234567890123456789012',
      text: 'Hello from ESP32',
    },
  }));

  assert.equal(response.ok, true);
  assert.equal(response.sid, 'SM-outbound');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].options.payload.To, 'whatsapp:+51999999999');
  assert.equal(fetchCalls[0].options.payload.Body, 'Hello from ESP32');
  assert.match(fetchCalls[0].options.headers.Authorization, /^Basic /);
});

