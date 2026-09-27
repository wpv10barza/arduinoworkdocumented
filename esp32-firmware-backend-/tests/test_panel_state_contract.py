from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / "src" / "main.cpp").read_text(encoding="utf-8")


def require(text: str, needle: str) -> None:
    if needle not in text:
        raise AssertionError(f"missing required panel-state contract: {needle}")


# Every backend transport failure must be promoted to a visible ERROR state.
require(MAIN, 'updatePanel(PanelState::Error, message, true);')
require(MAIN, 'setTransportError("POST", code, lastBackendMessage, true);')
require(MAIN, 'setTransportError("POLL", code, body, true);')
require(MAIN, 'Serial.printf("[ERROR] health HTTP=%d endpoint=%s detail=%s\\n",')

# POST 200/202 is only valid when the backend actually returned a command_id.
require(MAIN, 'if (!lastCommandId.length()) {')
require(MAIN, 'setProtocolError("POST", "falta command_id");')
require(MAIN, 'CONFIRMACIÓN REQUERIDA EN WEB')

# Polling must classify all documented failure spellings case-insensitively.
require(MAIN, 'String normalizedStatus(String status)')
for status in ["error", "failed", "fallido"]:
    require(MAIN, f'status == "{status}"')
require(MAIN, 'setProtocolError("POLL", result.length() ? result : "Error reportado por backend 3C");')

# Unknown or missing backend status must not silently remain PENDING.
require(MAIN, 'else {\n    setProtocolError("POLL", status.length() ? String("estado desconocido \'") + status + "\'" : "falta status");')

# Physical panel UI contract: the production panel must draw both requested buttons.
require(MAIN, 'drawButton(20, 370, 210, 82, "PROBAR WSL"')
require(MAIN, 'drawButton(250, 370, 210, 82, "ENVIAR 3C"')
require(MAIN, 'else if (sample.y >= 350)')
require(MAIN, 'if (sample.x < 240)')
require(MAIN, 'commandEditorOpen = true;')

# Guition 4848S040 display/touch contract from the known-good 19/20 Sep version.
require(MAIN, 'st7701_type9_init_operations')
require(MAIN, 'kScreenWidth, kScreenHeight, rgbPanel, 1, true')
require(MAIN, 'sample.x = rawX < kScreenWidth ? rawX')
require(MAIN, 'sample.y = rawY < kScreenHeight ? rawY')
require(MAIN, 'Wire.begin(pins::touchSda, pins::touchScl, 100000)')
require(MAIN, 'displayReady = true;')
require(MAIN, 'drawPanel();')


# Complete editor button contract: the controls visible above the virtual keyboard
# must remain wired to the same touch regions used by handleTouch().
for button in [
    'drawButton(8, 172, 100, 36, "CANCELAR"',
    'drawButton(112, 172, 72, 36, "<"',
    'drawButton(192, 172, 72, 36, "DEL"',
    'drawButton(272, 172, 115, 36,',
    'keyboardMode == virtual_keyboard::KeyboardMode::Alpha ? "123" : "ABC"',
]:
    require(MAIN, button)

# Each virtual-key action must remain reachable from the real touch handler.
for action in [
    'case KeyKind::Character:',
    'case KeyKind::Backspace:',
    'case KeyKind::Space:',
    'case KeyKind::Enter:',
    'case KeyKind::ToggleAlphaNumeric:',
    'virtual_keyboard::hitTest(keyboardMode, sample.x, sample.y, &key)',
]:
    require(MAIN, action)

# The editor must actually render the generated key rectangles.
require(MAIN, 'const size_t count = virtual_keyboard::buildKeys(keyboardMode, keys, 50);')
require(MAIN, 'display->fillRoundRect(key.rect.left, key.rect.top')

# Success/rejection are terminal and visible; pending is the only polling state that remains active.
require(MAIN, 'updatePanel(PanelState::Applied, result.length() ? result : "Confirmado en backend 3C", true);')
require(MAIN, 'updatePanel(PanelState::Rejected, result.length() ? result : "Rechazado en backend 3C", true);')
require(MAIN, 'updatePanel(PanelState::Pending, "CONFIRMACIÓN REQUERIDA EN WEB");')

print("Panel state contract: PASS")
print("- Health HTTP failures -> visible ERROR")
print("- POST transport/protocol failures -> visible ERROR")
print("- Poll HTTP failures -> visible ERROR")
print("- error/failed/fallido -> visible ERROR")
print("- unknown/missing status -> visible ERROR")
print("- applied/rejected/pending transitions remain explicit")
