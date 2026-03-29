/**
 * Maestra ESP32 OLED Artist Display
 *
 * Subscribes to a Maestra entity via MQTT and displays artist
 * information on an ER-OLEDM032-1 grayscale OLED (256x64, SSD1322).
 *
 * Display layout (32 chars x 4 lines):
 *   Line 1: Artist name       (inverted)
 *   Line 2: Bio line 1        (normal)
 *   Line 3: Bio line 2        (normal, word-wrapped)
 *   Line 4: Website / social  (normal)
 *
 * Entity state fields: name, bio, website
 */

#include <WiFi.h>
#include <SPI.h>
#include <MaestraClient.h>
#include "er_oled.h"

// ---- Configuration ----

const char* WIFI_SSID     = "maestra";
const char* WIFI_PASSWORD = "bath-chapel-locusts";

const char* MQTT_HOST = "192.168.128.115";  // Your Maestra host IP
const int   MQTT_PORT = 1883;

const char* ENTITY_SLUG = "jts-artist-info";  // Entity slug to subscribe to

// ---- Display constants ----

#define DISPLAY_COLS  32   // Characters per line (256px / 8px per char)
#define LINE_HEIGHT   16   // Pixels per text line

// ---- Globals ----

WiFiClient wifiClient;
MaestraClient maestra(wifiClient);
MaestraEntity* artistEntity = nullptr;

// Display text buffers (32 chars + null terminator)
char artistName[DISPLAY_COLS + 1];
char bioLine1[DISPLAY_COLS + 1];
char bioLine2[DISPLAY_COLS + 1];
char website[DISPLAY_COLS + 1];

bool displayDirty = false;

// ---- Helper functions ----

/**
 * Replace characters outside the font range (ASCII 32-122) with spaces.
 * The AsciiLib font only covers space through 'z'.
 */
void sanitizeForDisplay(char* str) {
  for (int i = 0; str[i] != '\0'; i++) {
    if (str[i] < 32 || str[i] > 122) {
      str[i] = ' ';
    }
  }
}

/**
 * Word-wrap text into two lines, breaking at the last space
 * before maxWidth. If no space is found, hard-breaks at maxWidth.
 */
void wordWrap(const char* text, char* line1, char* line2, int maxWidth) {
  int len = strlen(text);

  if (len <= maxWidth) {
    strncpy(line1, text, maxWidth);
    line1[maxWidth] = '\0';
    line2[0] = '\0';
    return;
  }

  // Find last space at or before maxWidth
  int breakAt = maxWidth;
  for (int i = maxWidth; i > 0; i--) {
    if (text[i] == ' ') {
      breakAt = i;
      break;
    }
  }

  strncpy(line1, text, breakAt);
  line1[breakAt] = '\0';

  // Skip the space at the break point for line2
  const char* remainder = text + breakAt;
  if (*remainder == ' ') remainder++;

  strncpy(line2, remainder, maxWidth);
  line2[maxWidth] = '\0';
}

/**
 * Redraw the full OLED with current artist data.
 */
void updateDisplay() {
  er_oled_clear();
  er_oled_string(0,  0, artistName, 1);  // Inverted for emphasis
  er_oled_string(0, 16, bioLine1,   0);
  er_oled_string(0, 32, bioLine2,   0);
  er_oled_string(0, 48, website,    0);
}

/**
 * Show a status message on the display (used during boot/reconnect).
 */
void showStatus(const char* line1, const char* line2 = nullptr) {
  er_oled_clear();
  er_oled_string(0, 0, "MAESTRA", 1);
  er_oled_string(0, 24, line1, 0);
  if (line2) {
    er_oled_string(0, 40, line2, 0);
  }
}

// ---- Maestra callback ----

void onArtistStateChange(const char* slug, JsonObject state, JsonArray changedKeys) {
  Serial.print("State changed for: ");
  Serial.println(slug);

  if (state.containsKey("name")) {
    strncpy(artistName, state["name"] | "", DISPLAY_COLS);
    artistName[DISPLAY_COLS] = '\0';
    sanitizeForDisplay(artistName);
  }

  if (state.containsKey("bio")) {
    const char* bio = state["bio"] | "";
    char safeBio[65];
    strncpy(safeBio, bio, 64);
    safeBio[64] = '\0';
    sanitizeForDisplay(safeBio);
    wordWrap(safeBio, bioLine1, bioLine2, DISPLAY_COLS);
  }

  if (state.containsKey("website")) {
    strncpy(website, state["website"] | "", DISPLAY_COLS);
    website[DISPLAY_COLS] = '\0';
    sanitizeForDisplay(website);
  }

  displayDirty = true;

  // Debug output
  Serial.print("  Name: ");    Serial.println(artistName);
  Serial.print("  Bio1: ");    Serial.println(bioLine1);
  Serial.print("  Bio2: ");    Serial.println(bioLine2);
  Serial.print("  Web:  ");    Serial.println(website);
}

// ---- WiFi ----

void setupWiFi() {
  Serial.print("Connecting to WiFi");
  showStatus("Connecting WiFi...", WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("Connected! IP: ");
  Serial.println(WiFi.localIP());

  char ipStr[16];
  WiFi.localIP().toString().toCharArray(ipStr, sizeof(ipStr));
  showStatus("WiFi connected", ipStr);
  delay(1000);
}

// ---- Setup & Loop ----

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("Maestra OLED Artist Display");
  Serial.println("===========================");

  // Initialize display
  er_oled_begin();
  er_oled_clear();

  // Clear text buffers
  memset(artistName, 0, sizeof(artistName));
  memset(bioLine1,   0, sizeof(bioLine1));
  memset(bioLine2,   0, sizeof(bioLine2));
  memset(website,    0, sizeof(website));

  // Connect to WiFi
  setupWiFi();

  // Configure and connect to Maestra
  showStatus("Connecting MQTT...", MQTT_HOST);
  maestra.setBroker(MQTT_HOST, MQTT_PORT);
  maestra.setClientId("esp32-oled-artist");

  if (maestra.connect()) {
    Serial.println("MQTT connected");

    artistEntity = maestra.getEntity(ENTITY_SLUG);
    artistEntity->onStateChange(onArtistStateChange);
    maestra.subscribeEntity(ENTITY_SLUG);

    showStatus("Waiting for data...", ENTITY_SLUG);
    Serial.print("Subscribed to entity: ");
    Serial.println(ENTITY_SLUG);
  } else {
    Serial.println("MQTT connection failed");
    showStatus("MQTT failed!", "Check broker IP");
  }
}

void loop() {
  maestra.loop();

  // Reconnect if disconnected
  if (!maestra.isConnected()) {
    Serial.println("Reconnecting...");
    showStatus("Reconnecting...", MQTT_HOST);

    if (maestra.connect()) {
      maestra.subscribeEntity(ENTITY_SLUG);
      Serial.println("Reconnected");

      // Redraw last known data if we have any, otherwise show waiting
      if (artistName[0] != '\0') {
        displayDirty = true;
      } else {
        showStatus("Waiting for data...", ENTITY_SLUG);
      }
    }
    delay(5000);
    return;
  }

  // Update display when new data arrives
  if (displayDirty) {
    updateDisplay();
    displayDirty = false;
    Serial.println("Display updated");
  }
}
