import { test, expect } from '@playwright/test';
import { GoogleAuth } from 'google-auth-library';

const BASE_URL = (process.env.MONITOR_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const DEVICE_TOKEN = process.env.ESP32_API_TOKEN || 'ci-e2e-token';
const SPREADSHEET_ID = process.env.E2E_SPREADSHEET_ID;
const SHEET_NAME = process.env.E2E_SHEET_NAME;
const TASK_NAME = process.env.E2E_TASK_NAME;
const HEADER_ROW = Number(process.env.E2E_HEADER_ROW || '4');
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

function requireEnv(name, value) {
  if (!value) throw new Error(`Falta la variable requerida: ${name}`);
}

async function getGoogleAccessToken() {
  requireEnv('GOOGLE_SERVICE_ACCOUNT_JSON', GOOGLE_SERVICE_ACCOUNT_JSON);
  const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = await auth.getClient();
  const response = await client.getAccessToken();
  const token = typeof response === 'string' ? response : response?.token;
  if (!token) throw new Error('No se pudo obtener un access token de Google.');
  return token;
}

function sheetsUrl(range) {
  requireEnv('E2E_SPREADSHEET_ID', SPREADSHEET_ID);
  requireEnv('E2E_SHEET_NAME', SHEET_NAME);
  const encodedRange = encodeURIComponent(`${SHEET_NAME}!${range}`);
  return `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodedRange}`;
}

async function sheetsGet(accessToken, range) {
  const response = await fetch(sheetsUrl(range), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Google Sheets GET ${range} -> HTTP ${response.status}: ${body}`);
  return JSON.parse(body);
}

async function sheetsPut(accessToken, range, values) {
  const response = await fetch(`${sheetsUrl(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Google Sheets PUT ${range} -> HTTP ${response.status}: ${body}`);
  return JSON.parse(body || '{}');
}

function findUniqueTaskRow(values) {
  const target = String(TASK_NAME).trim();
  const matches = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = String(values[index]?.[0] ?? '').trim();
    if (value === target) matches.push(HEADER_ROW + 1 + index);
  }
  if (matches.length !== 1) {
    throw new Error(`La tarea E2E debe aparecer exactamente una vez en F. Encontradas: ${matches.join(', ') || 'ninguna'}`);
  }
  return matches[0];
}

async function pollDeviceCommand(request, commandId, expectedStatus) {
  const deadline = Date.now() + 30_000;
  let lastBody = null;
  while (Date.now() < deadline) {
    const response = await request.get(
      `${BASE_URL}/api/device/v1/commands/${encodeURIComponent(commandId)}`,
      { headers: { 'x-3c-device-token': DEVICE_TOKEN } },
    );
    lastBody = await response.json();
    if (response.ok() && lastBody.command?.status === expectedStatus) return lastBody.command;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`El comando ${commandId} no alcanzó ${expectedStatus}: ${JSON.stringify(lastBody)}`);
}

test('ESP32 -> Monitor -> confirmación -> Google Sheets real -> restauración', async ({ page, request }) => {
  requireEnv('E2E_SPREADSHEET_ID', SPREADSHEET_ID);
  requireEnv('E2E_SHEET_NAME', SHEET_NAME);
  requireEnv('E2E_TASK_NAME', TASK_NAME);
  const accessToken = await getGoogleAccessToken();

  const headerResponse = await sheetsGet(accessToken, `A${HEADER_ROW}:O${HEADER_ROW}`);
  const headers = headerResponse.values?.[0] || [];
  expect(headers[4]).toBe('TareaId');
  expect(headers[5]).toBe('Nombre');
  expect(headers[11]).toBe('Frecuencia');
  expect(headers[12]).toBe('UnidadTiempo');

  const taskColumn = await sheetsGet(accessToken, `F${HEADER_ROW + 1}:F`);
  const row = findUniqueTaskRow(taskColumn.values || []);
  const originalRowResponse = await sheetsGet(accessToken, `A${row}:O${row}`);
  const originalRow = originalRowResponse.values?.[0] || [];
  if (originalRow.length < 13) {
    throw new Error(`La fila E2E ${row} no contiene A:O completos.`);
  }

  const originalFrequency = originalRow[11] ?? '';
  const originalUnit = originalRow[12] ?? '';
  let commandId;

  // The real Monitor's E2E mode uses ci-sheet/Data internally. Rewrite only the
  // Google Sheets destination and authorization so the browser talks to the
  // real configured spreadsheet with a real service-account token.
  await page.route('https://sheets.googleapis.com/**', async route => {
    const target = new URL(route.request().url());
    target.pathname = target.pathname.replace(
      '/v4/spreadsheets/ci-sheet/',
      `/v4/spreadsheets/${SPREADSHEET_ID}/`,
    );

    const marker = '/values/';
    const markerIndex = target.pathname.indexOf(marker);
    if (markerIndex >= 0) {
      const encodedRange = target.pathname.slice(markerIndex + marker.length);
      const decodedRange = decodeURIComponent(encodedRange);
      const remappedRange = decodedRange.replace(/^Data!/, `${SHEET_NAME}!`);
      target.pathname =
        target.pathname.slice(0, markerIndex + marker.length) +
        encodeURIComponent(remappedRange);
    }

    const headers = {
      ...route.request().headers(),
      authorization: `Bearer ${accessToken}`,
    };
    await route.continue({ url: target.toString(), headers });
  });

  try {
    const command = `Cambia la tarea ${TASK_NAME} a mensual`;
    const enqueue = await request.post(`${BASE_URL}/api/device/v1/commands`, {
      headers: {
        'content-type': 'application/json',
        'x-3c-device-token': DEVICE_TOKEN,
      },
      data: {
        device_id: 'panel-4848s040-3c-real-sheet-e2e',
        request_id: `panel-4848s040-3c-real-sheet-e2e-${Date.now()}`,
        text: command,
      },
    });
    expect(enqueue.status()).toBe(202);
    const queued = await enqueue.json();
    commandId = queued.command_id;
    expect(queued.status).toBe('pending_confirmation');

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Automatización 3C')).toBeVisible();
    await expect(page.getByText(command)).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Revisar comando' }).click();
    await expect(page.getByText(`Cambios por confirmar · fila ${row}`)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('L · Frecuencia')).toBeVisible();
    await expect(page.getByText('M · UnidadTiempo')).toBeVisible();

    await page.getByRole('button', { name: 'Confirmar y aplicar' }).click();
    await expect(page.getByText(new RegExp(`Fila ${row} actualizada:`))).toBeVisible({ timeout: 60_000 });

    const updated = await sheetsGet(accessToken, `A${row}:O${row}`);
    const updatedRow = updated.values?.[0] || [];
    expect(updatedRow[11]).toBe('1');
    expect(updatedRow[12]).toBe('Mes');

    for (let index = 0; index < 15; index += 1) {
      if (index === 11 || index === 12) continue;
      expect(updatedRow[index], `columna ${index + 1} cambió inesperadamente`).toEqual(originalRow[index] ?? '');
    }

    const terminal = await pollDeviceCommand(request, commandId, 'applied');
    expect(terminal.result).toContain(`Fila ${row} actualizada`);
  } finally {
    // Restore the exact two fields changed by the test, even when an assertion
    // or the Monitor flow fails after one of the writes has happened.
    await sheetsPut(accessToken, `L${row}:M${row}`, [[originalFrequency, originalUnit]]);
    const restored = await sheetsGet(accessToken, `A${row}:O${row}`);
    const restoredRow = restored.values?.[0] || [];
    for (let index = 0; index < 15; index += 1) {
      expect(restoredRow[index], `la restauración dejó distinta la columna ${index + 1}`).toEqual(originalRow[index] ?? '');
    }
  }
});
