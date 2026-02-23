/*
 * Potentiometer → Serial (Arduino NG)
 *
 * Reads a potentiometer on analog pin A0 and sends the raw 10-bit
 * value (0-1023) over Serial at 9600 baud.
 *
 * The Arduino NG uses an ATmega8/ATmega168 and has a built-in USB-to-serial
 * adapter (FT232RL). It runs at 16 MHz and requires you to hold the reset
 * button and release just before uploading.
 *
 * Wiring (Potentiometer → Arduino NG):
 *   Pin 1 (outer)  → 5V
 *   Pin 2 (wiper)  → A0
 *   Pin 3 (outer)  → GND
 *
 * Board settings in Arduino IDE:
 *   Board:     "Arduino NG or older"
 *   Processor: "ATmega168" (or ATmega8 for earlier revisions)
 *   Port:      your serial port
 */

const int POT_PIN = A0;
const unsigned long SEND_INTERVAL_MS = 50;
int lastValue = 0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int value = analogRead(POT_PIN);
  if(value != lastValue) {
    Serial.println(value);
    Serial.flush();
    lastValue = value;
  }
  delay(SEND_INTERVAL_MS);
}
