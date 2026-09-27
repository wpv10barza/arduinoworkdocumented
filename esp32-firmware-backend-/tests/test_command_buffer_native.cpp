#include <cassert>
#include <cstring>

#include "command_buffer.h"

int main() {
  CommandBuffer<48> buffer;
  assert(buffer.set("Cambia la tarea J10 a mensual"));
  assert(buffer.invariantHolds());

  buffer.setCursor(3);
  assert(buffer.insert('X'));
  assert(std::strcmp(buffer.c_str(), "CamXbia la tarea J10 a mensual") == 0);
  assert(buffer.cursor() == 4);

  assert(buffer.backspace());
  assert(std::strcmp(buffer.c_str(), "Cambia la tarea J10 a mensual") == 0);

  buffer.moveEnd();
  assert(buffer.insert('!'));
  assert(std::strstr(buffer.c_str(), "!") != nullptr);

  CommandBuffer<4> bounded;
  assert(bounded.set("ABCD"));
  bounded.setCursor(2);
  assert(!bounded.insert('X'));
  assert(std::strcmp(bounded.c_str(), "ABCD") == 0);
  assert(bounded.invariantHolds());

  return 0;
}
