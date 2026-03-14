/**
 * Maestra Discovery Implementation
 * ESP32-only: mDNS browsing + HTTP provisioning
 */

#include "MaestraDiscovery.h"

#ifdef ESP32

MaestraDiscovery::MaestraDiscovery()
    : _mqttPort(1883) {
    _apiUrl[0] = '\0';
    _mqttBroker[0] = '\0';
    _natsUrl[0] = '\0';
    _wsUrl[0] = '\0';
    _deviceId[0] = '\0';
    _entityId[0] = '\0';
}

// ============================================================================
// mDNS Discovery
// ============================================================================

bool MaestraDiscovery::discoverMaestra(unsigned long timeoutMs) {
    if (!MDNS.begin("maestra-device")) {
        Serial.println("[MaestraDiscovery] mDNS init failed");
        return false;
    }

    Serial.println("[MaestraDiscovery] Browsing for _maestra._tcp ...");

    unsigned long start = millis();
    int found = 0;

    while (millis() - start < timeoutMs) {
        found = MDNS.queryService("maestra", "tcp");
        if (found > 0) break;
        delay(500);
    }

    if (found == 0) {
        Serial.println("[MaestraDiscovery] No Maestra service found");
        return false;
    }

    // Use the first service instance
    IPAddress ip = MDNS.IP(0);
    int port = MDNS.port(0);

    // Build default API URL from host IP and port
    snprintf(_apiUrl, sizeof(_apiUrl), "http://%s:%d", ip.toString().c_str(), port);

    // Default MQTT broker to same host
    strncpy(_mqttBroker, ip.toString().c_str(), sizeof(_mqttBroker) - 1);
    _mqttBroker[sizeof(_mqttBroker) - 1] = '\0';
    _mqttPort = 1883;

    // Parse TXT records for specific service URLs
    int numTxt = MDNS.numTxt(0);
    for (int i = 0; i < numTxt; i++) {
        String key = MDNS.txtKey(0, i);
        String val = MDNS.txt(0, i);

        if (key == "api_url") {
            strncpy(_apiUrl, val.c_str(), sizeof(_apiUrl) - 1);
            _apiUrl[sizeof(_apiUrl) - 1] = '\0';
        } else if (key == "mqtt_broker") {
            strncpy(_mqttBroker, val.c_str(), sizeof(_mqttBroker) - 1);
            _mqttBroker[sizeof(_mqttBroker) - 1] = '\0';
        } else if (key == "mqtt_port") {
            _mqttPort = val.toInt();
        } else if (key == "nats_url") {
            strncpy(_natsUrl, val.c_str(), sizeof(_natsUrl) - 1);
            _natsUrl[sizeof(_natsUrl) - 1] = '\0';
        } else if (key == "ws_url") {
            strncpy(_wsUrl, val.c_str(), sizeof(_wsUrl) - 1);
            _wsUrl[sizeof(_wsUrl) - 1] = '\0';
        }
    }

    Serial.print("[MaestraDiscovery] Found Maestra at ");
    Serial.println(_apiUrl);

    return true;
}

// ============================================================================
// Device Advertisement (POST /devices/discover)
// ============================================================================

bool MaestraDiscovery::advertiseDevice(const char* hardwareId, const char* deviceType, const char* name) {
    if (_apiUrl[0] == '\0') {
        Serial.println("[MaestraDiscovery] No API URL - run discoverMaestra() first");
        return false;
    }

    char url[MAESTRA_URL_BUFFER_SIZE + 32];
    snprintf(url, sizeof(url), "%s/devices/discover", _apiUrl);

    // Build JSON body
    StaticJsonDocument<512> doc;
    doc["hardware_id"] = hardwareId;
    doc["device_type"] = deviceType;
    doc["name"] = name ? name : hardwareId;

    char body[512];
    serializeJson(doc, body);

    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.POST(body);

    if (httpCode != 200 && httpCode != 201) {
        Serial.print("[MaestraDiscovery] advertiseDevice failed, HTTP ");
        Serial.println(httpCode);
        http.end();
        return false;
    }

    // Parse response to get device ID
    String response = http.getString();
    http.end();

    StaticJsonDocument<1024> respDoc;
    DeserializationError err = deserializeJson(respDoc, response);
    if (err) {
        Serial.println("[MaestraDiscovery] Failed to parse advertise response");
        return false;
    }

    const char* id = respDoc["id"] | "";
    strncpy(_deviceId, id, sizeof(_deviceId) - 1);
    _deviceId[sizeof(_deviceId) - 1] = '\0';

    Serial.print("[MaestraDiscovery] Device registered, id=");
    Serial.println(_deviceId);

    return true;
}

// ============================================================================
// Provisioning Poll (GET /devices/{id}/provision)
// ============================================================================

bool MaestraDiscovery::waitForProvisioning(const char* deviceId, unsigned long pollIntervalMs, unsigned long timeoutMs) {
    if (_apiUrl[0] == '\0') {
        Serial.println("[MaestraDiscovery] No API URL - run discoverMaestra() first");
        return false;
    }

    char url[MAESTRA_URL_BUFFER_SIZE + 64];
    snprintf(url, sizeof(url), "%s/devices/%s/provision", _apiUrl, deviceId);

    Serial.println("[MaestraDiscovery] Waiting for provisioning approval ...");

    unsigned long start = millis();

    while (millis() - start < timeoutMs) {
        HTTPClient http;
        http.begin(url);

        int httpCode = http.GET();

        if (httpCode == 200) {
            String response = http.getString();
            http.end();

            StaticJsonDocument<1024> doc;
            DeserializationError err = deserializeJson(doc, response);
            if (err) {
                Serial.println("[MaestraDiscovery] Failed to parse provision response");
                return false;
            }

            // Update connection config from provisioning response
            const char* mqttBroker = doc["mqtt_broker"] | "";
            if (mqttBroker[0] != '\0') {
                strncpy(_mqttBroker, mqttBroker, sizeof(_mqttBroker) - 1);
                _mqttBroker[sizeof(_mqttBroker) - 1] = '\0';
            }

            int mqttPort = doc["mqtt_port"] | 0;
            if (mqttPort > 0) {
                _mqttPort = mqttPort;
            }

            const char* apiUrl = doc["api_url"] | "";
            if (apiUrl[0] != '\0') {
                strncpy(_apiUrl, apiUrl, sizeof(_apiUrl) - 1);
                _apiUrl[sizeof(_apiUrl) - 1] = '\0';
            }

            const char* natsUrl = doc["nats_url"] | "";
            if (natsUrl[0] != '\0') {
                strncpy(_natsUrl, natsUrl, sizeof(_natsUrl) - 1);
                _natsUrl[sizeof(_natsUrl) - 1] = '\0';
            }

            const char* wsUrl = doc["ws_url"] | "";
            if (wsUrl[0] != '\0') {
                strncpy(_wsUrl, wsUrl, sizeof(_wsUrl) - 1);
                _wsUrl[sizeof(_wsUrl) - 1] = '\0';
            }

            const char* entityId = doc["entity_id"] | "";
            if (entityId[0] != '\0') {
                strncpy(_entityId, entityId, sizeof(_entityId) - 1);
                _entityId[sizeof(_entityId) - 1] = '\0';
            }

            Serial.println("[MaestraDiscovery] Provisioning complete!");
            Serial.print("  MQTT: ");
            Serial.print(_mqttBroker);
            Serial.print(":");
            Serial.println(_mqttPort);

            return true;
        }

        http.end();

        if (httpCode == 403) {
            // Still pending - keep polling
        } else if (httpCode == 404) {
            Serial.println("[MaestraDiscovery] Device not found - may have been rejected");
            return false;
        } else {
            Serial.print("[MaestraDiscovery] Unexpected HTTP ");
            Serial.println(httpCode);
        }

        delay(pollIntervalMs);
    }

    Serial.println("[MaestraDiscovery] Provisioning timed out");
    return false;
}

#endif // ESP32
