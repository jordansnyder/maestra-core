/**
 * Maestra ESP32 OLED Artist Display
 *
 * Auto-discovers Maestra via mDNS, registers itself, and waits for
 * admin approval in the Dashboard. Once approved and bound to an entity,
 * displays artist info on an ER-OLEDM032-1 grayscale OLED (256x64, SSD1322).
 *
 * Connects via Ethernet on the Olimex ESP32-POE board (LAN8710A PHY).
 * Falls back to WiFi with hardcoded config if USE_WIFI is defined.
 *
 * Boot flow (Ethernet / auto-discovery):
 *   1. Init display, connect Ethernet, show MAC address
 *   2. mDNS discover Maestra (no hardcoded IP needed)
 *   3. Register as pending device using MAC as hardware_id
 *   4. Poll for admin approval (admin binds entity in Dashboard)
 *   5. Resolve entity slug from provisioned entity_id
 *   6. Connect MQTT, subscribe to entity, fetch initial state
 *   7. Display artist info, update live on state changes
 *
 * Entity state fields: name, bio, website
 */

#include <SPI.h>
#include <HTTPClient.h>
#include <ESPmDNS.h>
#include <MaestraClient.h>
#include "er_oled.h"

// ---- Network mode ----
// Uncomment to use WiFi with hardcoded config (skips auto-discovery)
//#define USE_WIFI

#include <WiFi.h>
#ifndef USE_WIFI
  #undef ETH_PHY_POWER
  #define ETH_PHY_POWER  12
  #undef ETH_CLK_MODE
  #define ETH_CLK_MODE   ETH_CLOCK_GPIO17_OUT
  #include <ETH.h>
#endif

// ---- Configuration ----

// WiFi credentials (only used in USE_WIFI mode)
const char* WIFI_SSID     = "maestra";
const char* WIFI_PASSWORD = "bath-chapel-locusts";

// Maestra server — the only thing you need to configure per-venue.
// Everything else (which entity to display) is assigned in the Dashboard.
const char* MAESTRA_HOST = "192.168.128.115";
const int   API_PORT     = 8080;
const int   MQTT_PORT    = 1883;

// ---- Display constants ----

#define DISPLAY_COLS  32   // Characters per line (256px / 8px per char)

// ---- Globals ----

WiFiClient netClient;
MaestraClient maestra(netClient);
MaestraEntity* artistEntity = nullptr;

#ifndef USE_WIFI
  volatile bool ethConnected = false;
#endif

bool provisioned = false;  // true once we have a valid entity slug

// Display text buffers (32 chars + null terminator)
char artistName[DISPLAY_COLS + 1];
char bioLine1[DISPLAY_COLS + 1];
char bioLine2[DISPLAY_COLS + 1];
char website[DISPLAY_COLS + 1];
char macAddress[18];

// Resolved config (populated by discovery or fallback)
char resolvedApiUrl[128];
char resolvedMqttBroker[64];
int  resolvedMqttPort = 1883;
char resolvedEntitySlug[64];

bool displayDirty = false;

// ---- Helper functions ----

void sanitizeForDisplay(char* str) {
  for (int i = 0; str[i] != '\0'; i++) {
    if (str[i] < 32 || str[i] > 122) {
      str[i] = ' ';
    }
  }
}

void wordWrap(const char* text, char* line1, char* line2, int maxWidth) {
  int len = strlen(text);
  if (len <= maxWidth) {
    strncpy(line1, text, maxWidth);
    line1[maxWidth] = '\0';
    line2[0] = '\0';
    return;
  }
  int breakAt = maxWidth;
  for (int i = maxWidth; i > 0; i--) {
    if (text[i] == ' ') { breakAt = i; break; }
  }
  strncpy(line1, text, breakAt);
  line1[breakAt] = '\0';
  const char* remainder = text + breakAt;
  if (*remainder == ' ') remainder++;
  strncpy(line2, remainder, maxWidth);
  line2[maxWidth] = '\0';
}

void updateDisplay() {
  er_oled_clear();
  er_oled_string(0,  0, artistName, 1);
  er_oled_string(0, 16, bioLine1,   0);
  er_oled_string(0, 32, bioLine2,   0);
  er_oled_string(0, 48, website,    0);
}

void showStatus(const char* line1, const char* line2 = nullptr, const char* line3 = nullptr) {
  er_oled_clear();
  er_oled_string(0, 0, "MAESTRA", 1);
  er_oled_string(0, 20, line1, 0);
  if (line2) er_oled_string(0, 36, line2, 0);
  if (line3) er_oled_string(0, 52, line3, 0);
}

// ---- Apply state fields to display buffers ----

void applyStateToBuffers(JsonObject state) {
  if (state["name"].is<const char*>()) {
    strncpy(artistName, state["name"] | "", DISPLAY_COLS);
    artistName[DISPLAY_COLS] = '\0';
    sanitizeForDisplay(artistName);
  }
  if (state["bio"].is<const char*>()) {
    char safeBio[65];
    strncpy(safeBio, state["bio"] | "", 64);
    safeBio[64] = '\0';
    sanitizeForDisplay(safeBio);
    wordWrap(safeBio, bioLine1, bioLine2, DISPLAY_COLS);
  }
  if (state["website"].is<const char*>()) {
    strncpy(website, state["website"] | "", DISPLAY_COLS);
    website[DISPLAY_COLS] = '\0';
    sanitizeForDisplay(website);
  }
  displayDirty = true;
}

// ---- MQTT state change callback ----

void onArtistStateChange(const char* slug, JsonObject state, JsonArray changedKeys) {
  Serial.print("State changed for: ");
  Serial.println(slug);
  applyStateToBuffers(state);
}

// ---- HTTP: fetch entity state ----

void fetchEntityState() {
  HTTPClient http;
  String url = String(resolvedApiUrl) + "/entities/by-slug/" + resolvedEntitySlug;
  Serial.print("Fetching entity state: ");
  Serial.println(url);

  http.begin(url);
  int httpCode = http.GET();
  if (httpCode == 200) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, http.getString());
    if (!err && doc["state"].is<JsonObject>()) {
      applyStateToBuffers(doc["state"]);
      Serial.println("Initial state loaded");
    }
  } else {
    Serial.printf("Fetch state HTTP error: %d\n", httpCode);
  }
  http.end();
}

// ---- HTTP: resolve entity_id UUID to slug ----

bool resolveEntitySlug(const char* entityId) {
  HTTPClient http;
  String url = String(resolvedApiUrl) + "/entities/" + entityId;
  Serial.print("Resolving entity slug: ");
  Serial.println(url);

  http.begin(url);
  int httpCode = http.GET();
  if (httpCode == 200) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, http.getString());
    if (!err && doc["slug"].is<const char*>()) {
      strncpy(resolvedEntitySlug, doc["slug"] | "", sizeof(resolvedEntitySlug) - 1);
      resolvedEntitySlug[sizeof(resolvedEntitySlug) - 1] = '\0';
      Serial.print("Entity slug: ");
      Serial.println(resolvedEntitySlug);
      http.end();
      return true;
    }
  }
  Serial.printf("Resolve slug HTTP error: %d\n", httpCode);
  http.end();
  return false;
}

// ---- Network setup ----

#ifndef USE_WIFI
void onEthEvent(arduino_event_id_t event) {
  switch (event) {
    case ARDUINO_EVENT_ETH_START:
      ETH.setHostname("esp32-oled-artist");
      break;
    case ARDUINO_EVENT_ETH_GOT_IP:
      Serial.print("ETH IP: ");
      Serial.print(ETH.localIP());
      Serial.print("  MAC: ");
      Serial.println(ETH.macAddress());
      ethConnected = true;
      break;
    case ARDUINO_EVENT_ETH_DISCONNECTED:
      Serial.println("ETH: Link down");
      ethConnected = false;
      break;
    default: break;
  }
}
#endif

void setupNetwork() {
#ifdef USE_WIFI
  showStatus("Connecting WiFi...", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println();
  WiFi.macAddress().toCharArray(macAddress, sizeof(macAddress));
  char ipStr[16];
  WiFi.localIP().toString().toCharArray(ipStr, sizeof(ipStr));
  showStatus("WiFi connected", ipStr);
#else
  showStatus("Starting Ethernet...");
  WiFi.onEvent(onEthEvent);
  ETH.begin();
  int timeout = 30;
  while (!ethConnected && timeout > 0) { delay(500); Serial.print("."); timeout--; }
  Serial.println();
  if (ethConnected) {
    ETH.macAddress().toCharArray(macAddress, sizeof(macAddress));
    char ipStr[16];
    ETH.localIP().toString().toCharArray(ipStr, sizeof(ipStr));
    showStatus("Ethernet connected", ipStr);
  } else {
    showStatus("ETH: No link!", "Check cable");
  }
#endif

  Serial.print("MAC: ");
  Serial.println(macAddress);
  showStatus("MAC Address:", macAddress);
  delay(3000);
}

bool isNetworkConnected() {
#ifdef USE_WIFI
  return WiFi.status() == WL_CONNECTED;
#else
  return ethConnected;
#endif
}

// ---- Discovery & provisioning ----

/**
 * Try mDNS to find Maestra automatically, fall back to MAESTRA_HOST.
 * Returns true if API URL and MQTT broker are configured.
 */
bool discoverMaestraHost() {
  showStatus("Discovering...", "Searching for Maestra");

  if (MDNS.begin("esp32-oled-artist")) {
    int found = 0;
    // Try a few rounds of mDNS queries (5 seconds total)
    for (int attempt = 0; attempt < 5 && found == 0; attempt++) {
      found = MDNS.queryService("maestra", "tcp");
      if (found == 0) delay(1000);
    }

    if (found > 0) {
      IPAddress ip = MDNS.IP(0);
      int port = MDNS.port(0);

      snprintf(resolvedApiUrl, sizeof(resolvedApiUrl), "http://%s:%d", ip.toString().c_str(), port);
      strncpy(resolvedMqttBroker, ip.toString().c_str(), sizeof(resolvedMqttBroker) - 1);
      resolvedMqttPort = 1883;

      // Check TXT records for explicit MQTT config
      int numTxt = MDNS.numTxt(0);
      for (int i = 0; i < numTxt; i++) {
        String key = MDNS.txtKey(0, i);
        String val = MDNS.txt(0, i);
        if (key == "mqtt_broker") {
          strncpy(resolvedMqttBroker, val.c_str(), sizeof(resolvedMqttBroker) - 1);
        } else if (key == "mqtt_port") {
          resolvedMqttPort = val.toInt();
        } else if (key == "api_url") {
          strncpy(resolvedApiUrl, val.c_str(), sizeof(resolvedApiUrl) - 1);
        }
      }

      showStatus("Found via mDNS!", resolvedMqttBroker);
      delay(1000);
      return true;
    }
  }

  // mDNS failed — fall back to hardcoded host
  showStatus("mDNS: not found", "Using fallback host", MAESTRA_HOST);
  snprintf(resolvedApiUrl, sizeof(resolvedApiUrl), "http://%s:%d", MAESTRA_HOST, API_PORT);
  strncpy(resolvedMqttBroker, MAESTRA_HOST, sizeof(resolvedMqttBroker));
  resolvedMqttPort = MQTT_PORT;
  delay(1000);
  return true;
}

/**
 * Register device with Fleet Manager and wait for admin to approve
 * and bind an entity in the Dashboard.
 */
bool discoverAndProvision() {
  // Resolve Maestra host (mDNS → fallback)
  if (!discoverMaestraHost()) return false;

  // Step 1: Check if device already has config (re-provisioning after reboot)
  showStatus("Checking config...", macAddress);
  {
    HTTPClient http;
    String url = String(resolvedApiUrl) + "/devices/config/" + macAddress;
    http.begin(url);
    int httpCode = http.GET();
    if (httpCode == 200) {
      JsonDocument doc;
      DeserializationError err = deserializeJson(doc, http.getString());
      // If config has entity_slug, we're already provisioned
      if (!err && doc["entity_slug"].is<const char*>()) {
        strncpy(resolvedEntitySlug, doc["entity_slug"] | "", sizeof(resolvedEntitySlug) - 1);
        if (resolvedEntitySlug[0] != '\0') {
          http.end();
          Serial.print("Already provisioned, entity: ");
          Serial.println(resolvedEntitySlug);
          return true;
        }
      }
    }
    http.end();
  }

  // Step 2: Register as pending device
  showStatus("Registering...", macAddress);
  {
    HTTPClient http;
    String url = String(resolvedApiUrl) + "/devices/discover";
    JsonDocument doc;
    doc["hardware_id"] = macAddress;
    doc["device_type"] = "esp32-oled-display";
    doc["name"] = "OLED Artist Display";

    char body[256];
    serializeJson(doc, body);

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    int httpCode = http.POST(body);

    if (httpCode != 200 && httpCode != 201) {
      showStatus("Register failed!", "Check Maestra is up");
      http.end();
      return false;
    }

    // Parse device ID from response
    JsonDocument resp;
    deserializeJson(resp, http.getString());
    const char* deviceId = resp["id"] | "";
    http.end();

    if (deviceId[0] == '\0') {
      showStatus("No device ID!");
      return false;
    }

    // Step 3: Wait for admin approval — show MAC prominently
    showStatus("Awaiting approval", macAddress, "Approve in Dashboard");

    // Poll provisioning endpoint until approved (10 min timeout)
    String provUrl = String(resolvedApiUrl) + "/devices/" + deviceId + "/provision";
    unsigned long start = millis();
    unsigned long timeout = 600000;  // 10 minutes

    while (millis() - start < timeout) {
      HTTPClient poll;
      poll.begin(provUrl);
      int code = poll.GET();

      if (code == 200) {
        JsonDocument provDoc;
        DeserializationError err = deserializeJson(provDoc, poll.getString());
        poll.end();

        if (err) { delay(5000); continue; }

        // Get entity_id from provisioning response
        const char* entityId = provDoc["entity_id"] | "";
        if (entityId[0] == '\0') {
          // Approved but no entity bound yet — keep polling
          showStatus("Approved!", "Bind an entity in", "Dashboard...");
          delay(5000);
          continue;
        }

        // Resolve entity UUID to slug
        showStatus("Loading entity...");
        if (resolveEntitySlug(entityId)) {
          return true;
        }

        showStatus("Entity error!", "Check Dashboard");
        return false;
      }

      poll.end();

      if (code == 403) {
        // Still pending — keep polling
      } else if (code == 404) {
        showStatus("Device rejected!", "Check Dashboard");
        return false;
      }

      delay(5000);
    }

    showStatus("Approval timeout", "Reboot to retry");
    return false;
  }
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

  // Clear buffers
  memset(artistName, 0, sizeof(artistName));
  memset(bioLine1,   0, sizeof(bioLine1));
  memset(bioLine2,   0, sizeof(bioLine2));
  memset(website,    0, sizeof(website));
  memset(macAddress, 0, sizeof(macAddress));
  resolvedApiUrl[0] = '\0';
  resolvedMqttBroker[0] = '\0';
  resolvedEntitySlug[0] = '\0';

  // Connect to network
  setupNetwork();
  if (!isNetworkConnected()) {
    showStatus("Network failed!", "Check connection");
    return;
  }

  // Discover Maestra and get provisioned config
  if (!discoverAndProvision()) {
    Serial.println("Discovery/provisioning failed - halting");
    return;  // loop() will show "not provisioned" and halt
  }
  provisioned = true;

  // Connect MQTT
  showStatus("Connecting MQTT...", resolvedMqttBroker);
  maestra.setBroker(resolvedMqttBroker, resolvedMqttPort);

  // Use unique client ID to avoid broker kicking duplicate connections
  char clientId[48];
  snprintf(clientId, sizeof(clientId), "oled-artist-%s", macAddress);
  // Replace colons with dashes for MQTT client ID
  for (int i = 0; clientId[i]; i++) {
    if (clientId[i] == ':') clientId[i] = '-';
  }
  maestra.setClientId(clientId);

  if (maestra.connect()) {
    Serial.println("MQTT connected");

    artistEntity = maestra.getEntity(resolvedEntitySlug);
    artistEntity->onStateChange(onArtistStateChange);
    maestra.subscribeEntity(resolvedEntitySlug);

    Serial.print("Subscribed to entity: ");
    Serial.println(resolvedEntitySlug);

    // Fetch current state immediately via HTTP
    showStatus("Loading state...", resolvedEntitySlug);
    fetchEntityState();
  } else {
    Serial.println("MQTT connection failed");
    showStatus("MQTT failed!", resolvedMqttBroker);
  }
}

void loop() {
  if (!provisioned) {
    delay(10000);  // Halted — reboot to retry
    return;
  }

  if (!isNetworkConnected()) {
    showStatus("Network lost!", "Check cable");
    delay(5000);
    return;
  }

  maestra.loop();

  // Reconnect MQTT if disconnected (reuse cached config, no re-discovery)
  if (!maestra.isConnected()) {
    Serial.println("MQTT reconnecting...");
    showStatus("Reconnecting...", resolvedMqttBroker);

    if (maestra.connect()) {
      maestra.subscribeEntity(resolvedEntitySlug);
      Serial.println("Reconnected");

      // Always return immediately after reconnect so loop() can service
      // MQTT keepalives. The MQTT subscription will deliver current state.
      // Only fetch via HTTP on initial boot (in setup), never on reconnect.
      if (artistName[0] != '\0') {
        displayDirty = true;
      }
      return;
    }
    delay(5000);  // Only delay on failed reconnect
    return;
  }

  // Update display when new data arrives
  if (displayDirty) {
    updateDisplay();
    displayDirty = false;
    Serial.println("Display updated");
  }
}
