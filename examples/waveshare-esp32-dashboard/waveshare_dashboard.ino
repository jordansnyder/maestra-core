/**
 * Waveshare ESP32-S3 3.5" Touchscreen Dashboard for Maestra
 *
 * Connects to Maestra via MQTT and displays live entity state across
 * three swipeable dashboard views:
 *
 *   1. OVERVIEW  — WiFi, MQTT status, tracked entities, device health
 *   2. ENTITIES  — Real-time state cards for up to 4 subscribed entities
 *   3. ACTIVITY  — Scrolling feed of recent state-change events
 *
 * Hardware: Waveshare ESP32-S3 3.5" Touch LCD (480×320, ILI9488, FT6336U)
 *
 * Dependencies (PlatformIO / Arduino Library Manager):
 *   - TFT_eSPI            (display driver)
 *   - FT6336U             (capacitive touch)
 *   - PubSubClient        (MQTT)
 *   - ArduinoJson  >=7    (JSON parsing)
 *   - MaestraClient        (Maestra Arduino SDK — copy from sdks/arduino/)
 */

#include <WiFi.h>
#include <TFT_eSPI.h>
#include <FT6336U.h>
#include <MaestraClient.h>

// ============================================================================
//  USER CONFIGURATION — edit these for your environment
// ============================================================================

// WiFi
const char* WIFI_SSID     = "your-wifi-ssid";
const char* WIFI_PASSWORD = "your-wifi-password";

// Maestra MQTT broker (IP of the machine running `make up`)
const char* MQTT_HOST = "192.168.1.100";
const int   MQTT_PORT = 1883;

// Entity slugs to subscribe to (up to 4 shown on the Entities view)
const char* ENTITY_SLUGS[] = {
  "entity-one",
  "entity-two",
  "entity-three",
  "entity-four",
};
const int NUM_ENTITIES = 4;

// State keys to display per entity card (first 3 keys found are shown)
// Leave empty to auto-display whatever keys arrive.
const char* DISPLAY_KEYS[] = {};
const int NUM_DISPLAY_KEYS = 0;

// ── Touch I2C pins (Waveshare ESP32-S3 3.5" LCD defaults) ──────────────────
#define TOUCH_SDA  7
#define TOUCH_SCL  8
#define TOUCH_INT  3
#define TOUCH_RST  2

// ============================================================================
//  COLOUR PALETTE (RGB565)
// ============================================================================

#define C_BG          0x1082   // dark charcoal  #18191c
#define C_CARD        0x2104   // card surface    #202228
#define C_HEADER      0x18C3   // header bar      #19191b
#define C_NAV         0x18C3   // nav bar
#define C_NAV_ACTIVE  0x2965   // active tab bg   #2a2d34
#define C_TEXT        0xE71C   // off-white        #e6e6e6
#define C_TEXT_DIM    0x7BEF   // dim grey         #7c7e83
#define C_ACCENT      0x04FF   // teal accent      #00bfff
#define C_GREEN       0x07E0   // status green
#define C_RED         0xF800   // status red
#define C_YELLOW      0xFFE0   // warning yellow
#define C_ORANGE      0xFD20   // orange

// ============================================================================
//  LAYOUT CONSTANTS (480 × 320)
// ============================================================================

#define SCREEN_W  480
#define SCREEN_H  320
#define HEADER_H   36
#define NAV_H      40
#define CONTENT_Y  HEADER_H
#define CONTENT_H  (SCREEN_H - HEADER_H - NAV_H)

// ============================================================================
//  GLOBALS
// ============================================================================

TFT_eSPI tft = TFT_eSPI();
FT6336U  touch;

WiFiClient   wifiClient;
MaestraClient maestra(wifiClient);

MaestraEntity* entities[4] = {nullptr, nullptr, nullptr, nullptr};

// Current view: 0=Overview, 1=Entities, 2=Activity
int currentView = 0;
const char* VIEW_LABELS[] = {"OVERVIEW", "ENTITIES", "ACTIVITY"};

// Activity log (circular buffer)
#define LOG_MAX 12
struct LogEntry {
  char slug[24];
  char summary[48];
  unsigned long ts;  // millis()
};
LogEntry activityLog[LOG_MAX];
int logHead = 0;
int logCount = 0;

// Redraw flags
bool needsFullRedraw  = true;
bool needsContentDraw = false;

// Timing
unsigned long lastTouch      = 0;
unsigned long lastHealthDraw = 0;
unsigned long lastReconnect  = 0;
unsigned long bootTime       = 0;

// ============================================================================
//  ACTIVITY LOG
// ============================================================================

void logActivity(const char* slug, const char* summary) {
  LogEntry& e = activityLog[logHead];
  strncpy(e.slug, slug, sizeof(e.slug) - 1);
  e.slug[sizeof(e.slug) - 1] = '\0';
  strncpy(e.summary, summary, sizeof(e.summary) - 1);
  e.summary[sizeof(e.summary) - 1] = '\0';
  e.ts = millis();
  logHead = (logHead + 1) % LOG_MAX;
  if (logCount < LOG_MAX) logCount++;
}

// ============================================================================
//  ENTITY CALLBACKS
// ============================================================================

void onEntityStateChange(const char* slug, JsonObject state, JsonArray changedKeys) {
  // Build a short summary for the activity log
  char summary[48] = "";
  int written = 0;
  for (JsonVariant k : changedKeys) {
    const char* key = k.as<const char*>();
    if (!key) continue;
    int n = snprintf(summary + written, sizeof(summary) - written,
                     "%s%s", (written > 0 ? ", " : ""), key);
    if (n < 0 || written + n >= (int)sizeof(summary) - 1) break;
    written += n;
  }

  logActivity(slug, summary);

  // Request content redraw if on a relevant view
  if (currentView == 1 || currentView == 2) {
    needsContentDraw = true;
  }
}

// ============================================================================
//  DRAWING — HEADER
// ============================================================================

void drawHeader() {
  tft.fillRect(0, 0, SCREEN_W, HEADER_H, C_HEADER);

  // Title
  tft.setTextColor(C_ACCENT, C_HEADER);
  tft.setTextDatum(ML_DATUM);
  tft.setTextSize(1);
  tft.drawString("MAESTRA", 12, HEADER_H / 2, 4);

  // View label
  tft.setTextColor(C_TEXT, C_HEADER);
  tft.setTextDatum(MC_DATUM);
  tft.drawString(VIEW_LABELS[currentView], SCREEN_W / 2, HEADER_H / 2, 4);

  // Status indicators (right side)
  int x = SCREEN_W - 12;

  // MQTT dot
  uint16_t mqttColor = maestra.isConnected() ? C_GREEN : C_RED;
  tft.fillCircle(x, HEADER_H / 2, 5, mqttColor);
  x -= 18;

  // WiFi dot
  uint16_t wifiColor = (WiFi.status() == WL_CONNECTED) ? C_GREEN : C_RED;
  tft.fillCircle(x, HEADER_H / 2, 5, wifiColor);
}

// ============================================================================
//  DRAWING — NAVIGATION BAR
// ============================================================================

void drawNavBar() {
  int y = SCREEN_H - NAV_H;
  tft.fillRect(0, y, SCREEN_W, NAV_H, C_NAV);

  int tabW = SCREEN_W / 3;
  for (int i = 0; i < 3; i++) {
    int tx = i * tabW;
    if (i == currentView) {
      tft.fillRect(tx + 2, y + 2, tabW - 4, NAV_H - 4, C_NAV_ACTIVE);
      // Active indicator line
      tft.fillRect(tx + tabW / 4, y, tabW / 2, 3, C_ACCENT);
    }
    tft.setTextColor(i == currentView ? C_ACCENT : C_TEXT_DIM, i == currentView ? C_NAV_ACTIVE : C_NAV);
    tft.setTextDatum(MC_DATUM);
    tft.drawString(VIEW_LABELS[i], tx + tabW / 2, y + NAV_H / 2, 2);
  }
}

// ============================================================================
//  DRAWING — OVERVIEW VIEW
// ============================================================================

void drawOverview() {
  int y = CONTENT_Y + 8;
  int rowH = 36;
  int labelX = 20;
  int valueX = 260;

  auto drawRow = [&](const char* label, const char* value, uint16_t valColor = C_TEXT) {
    tft.setTextColor(C_TEXT_DIM, C_BG);
    tft.setTextDatum(ML_DATUM);
    tft.drawString(label, labelX, y + rowH / 2, 4);
    tft.setTextColor(valColor, C_BG);
    tft.setTextDatum(ML_DATUM);
    tft.drawString(value, valueX, y + rowH / 2, 4);
    y += rowH;
  };

  // WiFi
  char buf[64];
  if (WiFi.status() == WL_CONNECTED) {
    snprintf(buf, sizeof(buf), "%s (%d dBm)", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    drawRow("WiFi", buf, C_GREEN);
  } else {
    drawRow("WiFi", "Disconnected", C_RED);
  }

  // MQTT
  drawRow("MQTT", maestra.isConnected() ? "Connected" : "Disconnected",
          maestra.isConnected() ? C_GREEN : C_RED);

  // Entities tracked
  snprintf(buf, sizeof(buf), "%d", NUM_ENTITIES);
  drawRow("Entities", buf, C_ACCENT);

  // Uptime
  unsigned long secs = (millis() - bootTime) / 1000;
  unsigned long mins = secs / 60;
  unsigned long hrs  = mins / 60;
  if (hrs > 0) {
    snprintf(buf, sizeof(buf), "%luh %lum", hrs, mins % 60);
  } else if (mins > 0) {
    snprintf(buf, sizeof(buf), "%lum %lus", mins, secs % 60);
  } else {
    snprintf(buf, sizeof(buf), "%lus", secs);
  }
  drawRow("Uptime", buf);

  // Free heap
  snprintf(buf, sizeof(buf), "%d KB", ESP.getFreeHeap() / 1024);
  drawRow("Free RAM", buf, ESP.getFreeHeap() < 30000 ? C_YELLOW : C_TEXT);

  // Activity count
  snprintf(buf, sizeof(buf), "%d events", logCount);
  drawRow("Activity", buf, C_TEXT_DIM);
}

// ============================================================================
//  DRAWING — ENTITIES VIEW (2×2 card grid)
// ============================================================================

void drawEntityCard(int col, int row, int idx) {
  int cardW = (SCREEN_W - 24) / 2;  // 228 each
  int cardH = (CONTENT_H - 20) / 2; // ~112 each
  int x = 8 + col * (cardW + 8);
  int y = CONTENT_Y + 6 + row * (cardH + 8);

  // Card background
  tft.fillRoundRect(x, y, cardW, cardH, 6, C_CARD);

  if (idx >= NUM_ENTITIES || !entities[idx]) {
    tft.setTextColor(C_TEXT_DIM, C_CARD);
    tft.setTextDatum(MC_DATUM);
    tft.drawString("--", x + cardW / 2, y + cardH / 2, 4);
    return;
  }

  MaestraEntity* ent = entities[idx];

  // Entity slug (header of card)
  tft.setTextColor(C_ACCENT, C_CARD);
  tft.setTextDatum(TL_DATUM);
  tft.drawString(ent->slug(), x + 10, y + 8, 2);

  // Draw state values
  JsonObject stateData = ent->state().data();
  int vy = y + 30;
  int count = 0;
  int maxRows = 3;

  for (JsonPair kv : stateData) {
    if (count >= maxRows) break;

    const char* key = kv.key().c_str();
    // Skip internal/meta keys
    if (strcmp(key, "device_id") == 0 || strcmp(key, "hardware_id") == 0) continue;

    // Key label
    tft.setTextColor(C_TEXT_DIM, C_CARD);
    tft.setTextDatum(TL_DATUM);
    // Truncate key display to fit card
    char keyBuf[16];
    strncpy(keyBuf, key, 15);
    keyBuf[15] = '\0';
    tft.drawString(keyBuf, x + 10, vy, 2);

    // Value
    char valBuf[20];
    if (kv.value().is<bool>()) {
      snprintf(valBuf, sizeof(valBuf), "%s", kv.value().as<bool>() ? "true" : "false");
    } else if (kv.value().is<float>()) {
      snprintf(valBuf, sizeof(valBuf), "%.2f", kv.value().as<float>());
    } else if (kv.value().is<int>()) {
      snprintf(valBuf, sizeof(valBuf), "%d", kv.value().as<int>());
    } else if (kv.value().is<const char*>()) {
      strncpy(valBuf, kv.value().as<const char*>(), sizeof(valBuf) - 1);
      valBuf[sizeof(valBuf) - 1] = '\0';
    } else {
      strcpy(valBuf, "...");
    }

    tft.setTextColor(C_TEXT, C_CARD);
    tft.setTextDatum(TR_DATUM);
    tft.drawString(valBuf, x + cardW - 10, vy, 2);

    vy += 24;
    count++;
  }

  if (count == 0) {
    tft.setTextColor(C_TEXT_DIM, C_CARD);
    tft.setTextDatum(MC_DATUM);
    tft.drawString("awaiting data", x + cardW / 2, y + cardH / 2 + 8, 2);
  }
}

void drawEntities() {
  // 2×2 grid
  drawEntityCard(0, 0, 0);
  drawEntityCard(1, 0, 1);
  drawEntityCard(0, 1, 2);
  drawEntityCard(1, 1, 3);
}

// ============================================================================
//  DRAWING — ACTIVITY VIEW
// ============================================================================

void drawActivity() {
  int rowH = 28;
  int maxVisible = CONTENT_H / rowH;
  int x = 12;
  int y = CONTENT_Y + 4;

  if (logCount == 0) {
    tft.setTextColor(C_TEXT_DIM, C_BG);
    tft.setTextDatum(MC_DATUM);
    tft.drawString("No activity yet", SCREEN_W / 2, CONTENT_Y + CONTENT_H / 2, 4);
    return;
  }

  // Draw most recent first
  int drawn = 0;
  for (int i = 0; i < logCount && drawn < maxVisible; i++) {
    int idx = (logHead - 1 - i + LOG_MAX) % LOG_MAX;
    LogEntry& e = activityLog[idx];

    // Time ago
    unsigned long ago = (millis() - e.ts) / 1000;
    char timeBuf[12];
    if (ago < 60) {
      snprintf(timeBuf, sizeof(timeBuf), "%lus", ago);
    } else if (ago < 3600) {
      snprintf(timeBuf, sizeof(timeBuf), "%lum", ago / 60);
    } else {
      snprintf(timeBuf, sizeof(timeBuf), "%luh", ago / 3600);
    }

    // Alternating row background
    if (drawn % 2 == 0) {
      tft.fillRect(0, y, SCREEN_W, rowH, C_CARD);
    }

    // Time
    tft.setTextColor(C_TEXT_DIM, drawn % 2 == 0 ? C_CARD : C_BG);
    tft.setTextDatum(ML_DATUM);
    tft.drawString(timeBuf, x, y + rowH / 2, 2);

    // Slug
    tft.setTextColor(C_ACCENT, drawn % 2 == 0 ? C_CARD : C_BG);
    tft.drawString(e.slug, x + 48, y + rowH / 2, 2);

    // Changed keys
    tft.setTextColor(C_TEXT, drawn % 2 == 0 ? C_CARD : C_BG);
    tft.drawString(e.summary, x + 200, y + rowH / 2, 2);

    y += rowH;
    drawn++;
  }
}

// ============================================================================
//  DRAWING — MASTER
// ============================================================================

void drawContent() {
  // Clear content area
  tft.fillRect(0, CONTENT_Y, SCREEN_W, CONTENT_H, C_BG);

  switch (currentView) {
    case 0: drawOverview();  break;
    case 1: drawEntities();  break;
    case 2: drawActivity();  break;
  }
}

void drawAll() {
  tft.fillScreen(C_BG);
  drawHeader();
  drawContent();
  drawNavBar();
  needsFullRedraw  = false;
  needsContentDraw = false;
}

// ============================================================================
//  TOUCH HANDLING
// ============================================================================

void handleTouch() {
  if (!touch.read()) return;

  // Debounce: ignore touches within 300ms of each other
  if (millis() - lastTouch < 300) return;
  lastTouch = millis();

  int tx = touch.points[0].x;
  int ty = touch.points[0].y;

  // Check if touch is in the nav bar region
  if (ty >= SCREEN_H - NAV_H) {
    int tabW = SCREEN_W / 3;
    int newView = tx / tabW;
    if (newView >= 0 && newView < 3 && newView != currentView) {
      currentView = newView;
      needsFullRedraw = true;
    }
    return;
  }

  // Content area: swipe-like left/right tap zones
  if (ty >= CONTENT_Y && ty < SCREEN_H - NAV_H) {
    if (tx < 60) {
      // Left edge tap → previous view
      if (currentView > 0) {
        currentView--;
        needsFullRedraw = true;
      }
    } else if (tx > SCREEN_W - 60) {
      // Right edge tap → next view
      if (currentView < 2) {
        currentView++;
        needsFullRedraw = true;
      }
    }
  }
}

// ============================================================================
//  WIFI + MQTT SETUP
// ============================================================================

void setupWiFi() {
  tft.setTextColor(C_TEXT, C_BG);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("Connecting to WiFi...", SCREEN_W / 2, SCREEN_H / 2 - 20, 4);
  tft.setTextColor(C_TEXT_DIM, C_BG);
  tft.drawString(WIFI_SSID, SCREEN_W / 2, SCREEN_H / 2 + 20, 2);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    tft.fillCircle(SCREEN_W / 2 - 40 + (attempts % 10) * 10, SCREEN_H / 2 + 50, 3, C_ACCENT);
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    tft.fillScreen(C_BG);
    tft.setTextColor(C_GREEN, C_BG);
    tft.setTextDatum(MC_DATUM);
    tft.drawString("WiFi Connected", SCREEN_W / 2, SCREEN_H / 2 - 10, 4);
    tft.setTextColor(C_TEXT_DIM, C_BG);
    tft.drawString(WiFi.localIP().toString().c_str(), SCREEN_W / 2, SCREEN_H / 2 + 20, 2);
    delay(800);
  } else {
    tft.fillScreen(C_BG);
    tft.setTextColor(C_YELLOW, C_BG);
    tft.setTextDatum(MC_DATUM);
    tft.drawString("WiFi failed - continuing", SCREEN_W / 2, SCREEN_H / 2, 4);
    delay(1000);
  }
}

bool connectMQTT() {
  if (maestra.isConnected()) return true;

  maestra.setBroker(MQTT_HOST, MQTT_PORT);
  maestra.setClientId("waveshare-dashboard");

  if (!maestra.connect()) return false;

  // Subscribe to all configured entities
  for (int i = 0; i < NUM_ENTITIES; i++) {
    entities[i] = maestra.getEntity(ENTITY_SLUGS[i]);
    entities[i]->onStateChange(onEntityStateChange);
    maestra.subscribeEntity(ENTITY_SLUGS[i]);
  }

  return true;
}

// ============================================================================
//  ARDUINO SETUP
// ============================================================================

void setup() {
  Serial.begin(115200);
  Serial.println("Maestra Waveshare Dashboard starting...");

  bootTime = millis();

  // Initialize display
  tft.init();
  tft.setRotation(1);  // landscape
  tft.fillScreen(C_BG);
  tft.setTextWrap(false);

  // Splash
  tft.setTextColor(C_ACCENT, C_BG);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("MAESTRA", SCREEN_W / 2, SCREEN_H / 2 - 30, 4);
  tft.setTextColor(C_TEXT_DIM, C_BG);
  tft.drawString("Waveshare Dashboard", SCREEN_W / 2, SCREEN_H / 2 + 10, 2);
  delay(1200);

  // Initialize touch
  Wire.begin(TOUCH_SDA, TOUCH_SCL);
  touch.begin();

  // Connect WiFi
  tft.fillScreen(C_BG);
  setupWiFi();

  // Connect MQTT
  tft.fillScreen(C_BG);
  tft.setTextColor(C_TEXT, C_BG);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("Connecting to Maestra...", SCREEN_W / 2, SCREEN_H / 2, 4);

  connectMQTT();
  delay(500);

  // Draw initial view
  needsFullRedraw = true;
}

// ============================================================================
//  ARDUINO LOOP
// ============================================================================

void loop() {
  // Process MQTT messages
  maestra.loop();

  // Reconnect MQTT if needed (every 5s)
  if (!maestra.isConnected() && millis() - lastReconnect > 5000) {
    lastReconnect = millis();
    connectMQTT();
    needsFullRedraw = true;
  }

  // Handle touch input
  handleTouch();

  // Redraw if needed
  if (needsFullRedraw) {
    drawAll();
  } else if (needsContentDraw) {
    drawContent();
    needsContentDraw = false;
  }

  // Periodic refresh for the overview view (uptime, heap, etc.)
  if (currentView == 0 && millis() - lastHealthDraw > 2000) {
    lastHealthDraw = millis();
    drawContent();
  }

  // Periodic refresh for the activity view (time-ago updates)
  if (currentView == 2 && millis() - lastHealthDraw > 5000) {
    lastHealthDraw = millis();
    drawContent();
  }
}
