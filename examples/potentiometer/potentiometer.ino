/*
 * 4× Potentiometer → Serial (Arduino NG)
 *
 * Reads four potentiometers on analog pins A0-A3 and sends the raw
 * 10-bit values (0-1023) as a comma-separated line over Serial at
 * 9600 baud.  Output format: "val0,val1,val2,val3\n"
 *
 * The UE5 Aurora project maps these to:
 *   A0 (pot1) — Hue         (aurora color sweep)
 *   A1 (pot2) — Intensity   (brightness)
 *   A2 (pot3) — Height      (curtain vertical extent)
 *   A3 (pot4) — Turbulence  (wave speed / fold complexity)
 *
 * The Arduino NG uses an ATmega8/ATmega168 and has a built-in
 * USB-to-serial adapter (FT232RL). It runs at 16 MHz and requires
 * you to hold the reset button and release just before uploading.
 *
 * Wiring (each potentiometer → Arduino NG):
 *   Pin 1 (outer)  → 5V
 *   Pin 2 (wiper)  → A0 / A1 / A2 / A3
 *   Pin 3 (outer)  → GND
 *
 * Board settings in Arduino IDE:
 *   Board:     "Arduino NG or older"
 *   Processor: "ATmega168" (or ATmega8 for earlier revisions)
 *   Port:      your serial port
 */

const int POT_PINS[] = {A0, A1, A2, A3};
const int NUM_POTS = 4;
const unsigned long SEND_INTERVAL_MS = 50;

int lastValues[4] = {0, 0, 0, 0};
bool changed = false;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int values[NUM_POTS];
  changed = false;

  for (int i = 0; i < NUM_POTS; i++) {
    values[i] = analogRead(POT_PINS[i]);
    if (values[i] != lastValues[i]) {
      changed = true;
      lastValues[i] = values[i];
    }
  }

  if (changed) {
    for (int i = 0; i < NUM_POTS; i++) {
      if (i > 0) Serial.print(',');
      Serial.print(values[i]);
    }
    Serial.println();
    Serial.flush();
  }

  delay(SEND_INTERVAL_MS);
}
