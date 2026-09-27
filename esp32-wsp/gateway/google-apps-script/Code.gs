/*
 * ESP32-S3 <-> Twilio WhatsApp development relay.
 *
 * Required Script Properties:
 *   DEVICE_KEY
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM               e.g. whatsapp:+14155238886
 *   TWILIO_TO                 e.g. whatsapp:+519XXXXXXXX
 *   TWILIO_WEBHOOK_KEY
 *   ALLOWED_WHATSAPP_FROM     e.g. whatsapp:+519XXXXXXXX
 */

const MAX_QUEUE_LENGTH = 6;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_QUEUE_BYTES = 8000;

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || 'health');

  if (action === 'health') {
    return json_({
      ok: true,
      service: 'esp32-whatsapp-relay',
      time: new Date().toISOString(),
    });
  }

  if (action === 'poll') {
    return poll_(e);
  }

  return json_({ ok: false, error: 'unknown_action' });
}

function doPost(e) {
  const action = String((e && e.parameter && e.parameter.action) || '');

  if (action === 'send') {
    return sendFromDevice_(e);
  }

  if (action === 'poll') {
    return poll_(e);
  }

  // Twilio sends Body, From, To, and MessageSid as form parameters.
  if (e && e.parameter && e.parameter.From && e.parameter.MessageSid) {
    return receiveFromTwilio_(e);
  }

  return json_({ ok: false, error: 'unknown_action' });
}

function poll_(e) {
  if (!authorizedDevice_(e)) {
    return json_({ ok: false, error: 'unauthorized' });
  }

  const after = Math.max(0, Number(e.parameter.after || 0));
  const queue = readQueue_();
  const message = queue.find(function (item) {
    return Number(item.id) > after;
  }) || null;

  return json_({ ok: true, message: message });
}

function sendFromDevice_(e) {
  if (!authorizedDevice_(e)) {
    return json_({ ok: false, error: 'unauthorized' });
  }

  const text = String(e.parameter.text || '').trim();
  if (!text) {
    return json_({ ok: false, error: 'empty_message' });
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    return json_({ ok: false, error: 'message_too_long' });
  }

  try {
    const result = sendTwilioMessage_(text);
    return json_({ ok: true, sid: result.sid, status: result.status });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: 'twilio_send_failed' });
  }
}

function receiveFromTwilio_(e) {
  const properties = PropertiesService.getScriptProperties();
  const expectedKey = properties.getProperty('TWILIO_WEBHOOK_KEY') || '';
  const suppliedKey = String(e.parameter.twilio_key || '');

  if (!constantTimeEqual_(suppliedKey, expectedKey)) {
    console.warn('Rejected Twilio webhook: invalid key.');
    return emptyTwiml_();
  }

  const from = String(e.parameter.From || '');
  const allowedFrom = properties.getProperty('ALLOWED_WHATSAPP_FROM') ||
      properties.getProperty('TWILIO_TO') || '';
  if (allowedFrom && from !== allowedFrom) {
    console.warn('Rejected Twilio webhook: sender is not allowed.');
    return emptyTwiml_();
  }

  const body = String(e.parameter.Body || '').trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!body) {
    return emptyTwiml_();
  }

  enqueue_({
    from: from,
    body: body,
    twilio_sid: String(e.parameter.MessageSid || ''),
    received_at: new Date().toISOString(),
  });

  // The ESP32 decides whether commands such as ping/status need a reply.
  return emptyTwiml_();
}

function sendTwilioMessage_(text) {
  const properties = PropertiesService.getScriptProperties();
  const accountSid = requiredProperty_(properties, 'TWILIO_ACCOUNT_SID');
  const authToken = requiredProperty_(properties, 'TWILIO_AUTH_TOKEN');
  const from = requiredProperty_(properties, 'TWILIO_FROM');
  const to = requiredProperty_(properties, 'TWILIO_TO');

  const endpoint = 'https://api.twilio.com/2010-04-01/Accounts/' +
      encodeURIComponent(accountSid) + '/Messages.json';
  const authorization = Utilities.base64Encode(accountSid + ':' + authToken);
  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    payload: { To: to, From: from, Body: text },
    headers: { Authorization: 'Basic ' + authorization },
    muteHttpExceptions: true,
  });

  const statusCode = response.getResponseCode();
  const content = response.getContentText();
  let result = {};
  try {
    result = JSON.parse(content);
  } catch (ignored) {
    result = {};
  }

  if (statusCode < 200 || statusCode >= 300) {
    const twilioCode = result.code || statusCode;
    const twilioMessage = result.message || 'Twilio request failed';
    throw new Error('Twilio ' + twilioCode + ': ' + twilioMessage);
  }

  return result;
}

function enqueue_(message) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const properties = PropertiesService.getScriptProperties();
    const current = Number(properties.getProperty('QUEUE_COUNTER') || 0);
    const nextId = current >= 4294967294 ? 1 : current + 1;
    const queue = readQueue_();

    const duplicate = queue.find(function (item) {
      return message.twilio_sid && item.twilio_sid === message.twilio_sid;
    });
    if (duplicate) {
      return duplicate.id;
    }

    message.id = nextId;
    queue.push(message);
    while (queue.length > MAX_QUEUE_LENGTH) {
      queue.shift();
    }

    let serializedQueue = JSON.stringify(queue);
    while (queue.length > 1 && utf8Length_(serializedQueue) > MAX_QUEUE_BYTES) {
      queue.shift();
      serializedQueue = JSON.stringify(queue);
    }

    properties.setProperties({
      QUEUE_COUNTER: String(nextId),
      INBOUND_QUEUE: serializedQueue,
    });
    return nextId;
  } finally {
    lock.releaseLock();
  }
}

function readQueue_() {
  const raw = PropertiesService.getScriptProperties()
      .getProperty('INBOUND_QUEUE');
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Invalid queue JSON; starting with an empty queue.', error);
    return [];
  }
}

function authorizedDevice_(e) {
  const expected = PropertiesService.getScriptProperties()
      .getProperty('DEVICE_KEY') || '';
  const supplied = String((e && e.parameter && e.parameter.device_key) || '');
  return constantTimeEqual_(supplied, expected);
}

function constantTimeEqual_(left, right) {
  left = String(left || '');
  right = String(right || '');
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let i = 0; i < left.length; ++i) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

function requiredProperty_(properties, name) {
  const value = properties.getProperty(name);
  if (!value) {
    throw new Error('Missing Script Property: ' + name);
  }
  return value;
}

function utf8Length_(value) {
  return Utilities.newBlob(String(value)).getBytes().length;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
      .setMimeType(ContentService.MimeType.JSON);
}

function emptyTwiml_() {
  return ContentService
      .createTextOutput('<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
      .setMimeType(ContentService.MimeType.XML);
}
