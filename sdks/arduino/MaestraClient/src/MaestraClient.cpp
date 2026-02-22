/**
 * Maestra Client Implementation
 */

#include "MaestraClient.h"

// Global client pointer for callback
static MaestraClient* _globalClient = nullptr;

// MQTT callback wrapper
static void mqttCallback(char* topic, byte* payload, unsigned int length) {
    if (_globalClient) {
        _globalClient->_handleMessage(topic, payload, length);
    }
}

// ============================================================================
// MaestraEntityState
// ============================================================================

MaestraEntityState::MaestraEntityState() {
    _state = _doc.to<JsonObject>();
}

bool MaestraEntityState::has(const char* key) {
    return _state.containsKey(key);
}

JsonObject MaestraEntityState::data() {
    return _state;
}

void MaestraEntityState::_update(JsonObject newState) {
    for (JsonPair kv : newState) {
        _state[kv.key()] = kv.value();
    }
}

// ============================================================================
// MaestraEntity
// ============================================================================

MaestraEntity::MaestraEntity(MaestraClient* client, const char* slug)
    : _client(client), _callback(nullptr) {
    strncpy(_slug, slug, sizeof(_slug) - 1);
    _slug[sizeof(_slug) - 1] = '\0';
}

void MaestraEntity::updateState(JsonObject updates) {
    _client->updateEntityState(_slug, updates);
}

void MaestraEntity::updateState(const char* key, JsonVariant value) {
    StaticJsonDocument<256> doc;
    JsonObject obj = doc.to<JsonObject>();
    obj[key] = value;
    updateState(obj);
}

void MaestraEntity::setState(JsonObject newState) {
    _client->setEntityState(_slug, newState);
}

void MaestraEntity::onStateChange(StateChangeCallback callback) {
    _callback = callback;
}

void MaestraEntity::_handleMessage(JsonObject payload) {
    if (!payload.containsKey("current_state")) return;

    JsonObject currentState = payload["current_state"];
    _state._update(currentState);

    if (_callback) {
        JsonArray changedKeys = payload["changed_keys"];
        _callback(_slug, currentState, changedKeys);
    }
}

// ============================================================================
// MaestraClient
// ============================================================================

MaestraClient::MaestraClient(Client& networkClient)
    : _mqtt(networkClient), _port(1883), _hasCredentials(false),
      _entityCount(0), _streamCallback(nullptr), _streamCount(0) {
    strcpy(_broker, "localhost");
    strcpy(_clientId, "maestra-arduino");
    _globalClient = this;

    for (int i = 0; i < MAX_ENTITIES; i++) {
        _entities[i] = nullptr;
    }
    memset(_streams, 0, sizeof(_streams));
}

void MaestraClient::setBroker(const char* host, uint16_t port) {
    strncpy(_broker, host, sizeof(_broker) - 1);
    _port = port;
}

void MaestraClient::setClientId(const char* clientId) {
    strncpy(_clientId, clientId, sizeof(_clientId) - 1);
}

void MaestraClient::setCredentials(const char* username, const char* password) {
    strncpy(_username, username, sizeof(_username) - 1);
    strncpy(_password, password, sizeof(_password) - 1);
    _hasCredentials = true;
}

bool MaestraClient::connect() {
    _mqtt.setServer(_broker, _port);
    _mqtt.setCallback(mqttCallback);
    _mqtt.setBufferSize(MAESTRA_JSON_BUFFER_SIZE);

    bool connected;
    if (_hasCredentials) {
        connected = _mqtt.connect(_clientId, _username, _password);
    } else {
        connected = _mqtt.connect(_clientId);
    }

    if (connected) {
        Serial.println("✅ Connected to Maestra MQTT broker");
    } else {
        Serial.print("❌ MQTT connection failed, rc=");
        Serial.println(_mqtt.state());
    }

    return connected;
}

void MaestraClient::disconnect() {
    _mqtt.disconnect();
}

bool MaestraClient::isConnected() {
    return _mqtt.connected();
}

void MaestraClient::loop() {
    _mqtt.loop();
}

MaestraEntity* MaestraClient::getEntity(const char* slug) {
    // Check if already exists
    for (int i = 0; i < _entityCount; i++) {
        if (_entities[i] && strcmp(_entities[i]->slug(), slug) == 0) {
            return _entities[i];
        }
    }

    // Create new entity
    if (_entityCount < MAX_ENTITIES) {
        MaestraEntity* entity = new MaestraEntity(this, slug);
        _entities[_entityCount++] = entity;
        return entity;
    }

    return nullptr;
}

void MaestraClient::subscribeEntity(const char* slug) {
    char topic[MAESTRA_TOPIC_BUFFER_SIZE];
    snprintf(topic, sizeof(topic), "maestra/entity/state/+/%s", slug);
    _mqtt.subscribe(topic);
    Serial.print("📡 Subscribed to: ");
    Serial.println(topic);
}

void MaestraClient::updateEntityState(const char* slug, JsonObject state, const char* source) {
    _publishState(slug, state, source, false);
}

void MaestraClient::setEntityState(const char* slug, JsonObject state, const char* source) {
    _publishState(slug, state, source, true);
}

void MaestraClient::_publishState(const char* slug, JsonObject state, const char* source, bool replace) {
    char topic[MAESTRA_TOPIC_BUFFER_SIZE];
    snprintf(topic, sizeof(topic), "maestra/entity/state/%s/%s",
             replace ? "set" : "update", slug);

    StaticJsonDocument<MAESTRA_JSON_BUFFER_SIZE> doc;
    doc["state"] = state;
    if (source) {
        doc["source"] = source;
    }

    char buffer[MAESTRA_JSON_BUFFER_SIZE];
    serializeJson(doc, buffer);

    _mqtt.publish(topic, buffer);
}

// ============================================================================
// Stream Methods
// ============================================================================

void MaestraClient::subscribeStreamEvents(StreamAdvertisedCallback callback) {
    _streamCallback = callback;
    _mqtt.subscribe("maestra/stream/advertise");
    Serial.println("📡 Subscribed to stream events");
}

void MaestraClient::subscribeStreamType(const char* streamType, StreamAdvertisedCallback callback) {
    _streamCallback = callback;
    char topic[MAESTRA_TOPIC_BUFFER_SIZE];
    snprintf(topic, sizeof(topic), "maestra/stream/advertise/%s", streamType);
    _mqtt.subscribe(topic);
    Serial.print("📡 Subscribed to stream type: ");
    Serial.println(streamType);
}

void MaestraClient::advertiseStream(const char* name, const char* streamType,
                                     const char* protocol, const char* address,
                                     int port, const char* publisherId) {
    StaticJsonDocument<MAESTRA_JSON_BUFFER_SIZE> doc;
    doc["name"] = name;
    doc["stream_type"] = streamType;
    doc["publisher_id"] = publisherId ? publisherId : _clientId;
    doc["protocol"] = protocol;
    doc["address"] = address;
    doc["port"] = port;

    char buffer[MAESTRA_JSON_BUFFER_SIZE];
    serializeJson(doc, buffer);

    _mqtt.publish("maestra/stream/advertise", buffer);
    Serial.print("📡 Advertised stream: ");
    Serial.println(name);
}

void MaestraClient::withdrawStream(const char* streamId) {
    char topic[MAESTRA_TOPIC_BUFFER_SIZE];
    snprintf(topic, sizeof(topic), "maestra/stream/withdraw/%s", streamId);
    _mqtt.publish(topic, "{}");
}

void MaestraClient::streamHeartbeat(const char* streamId) {
    char topic[MAESTRA_TOPIC_BUFFER_SIZE];
    snprintf(topic, sizeof(topic), "maestra/stream/heartbeat/%s", streamId);
    _mqtt.publish(topic, "{}");
}

void MaestraClient::_handleStreamMessage(const char* topic, JsonObject payload) {
    if (!_streamCallback) return;

    const char* streamId = payload["id"] | "";
    const char* streamName = payload["name"] | "";
    const char* streamType = payload["stream_type"] | "";
    const char* address = payload["address"] | "";
    int port = payload["port"] | 0;

    _streamCallback(streamId, streamName, streamType, address, port);
}

// ============================================================================
// Message Handler
// ============================================================================

void MaestraClient::_handleMessage(char* topic, byte* payload, unsigned int length) {
    // Parse topic into parts
    char* parts[6];
    int partCount = 0;
    char topicCopy[MAESTRA_TOPIC_BUFFER_SIZE];
    strncpy(topicCopy, topic, sizeof(topicCopy));
    topicCopy[sizeof(topicCopy) - 1] = '\0';

    char* token = strtok(topicCopy, "/");
    while (token && partCount < 6) {
        parts[partCount++] = token;
        token = strtok(nullptr, "/");
    }

    if (partCount < 3) return;

    // Parse JSON payload
    StaticJsonDocument<MAESTRA_JSON_BUFFER_SIZE> doc;
    DeserializationError error = deserializeJson(doc, payload, length);
    if (error) return;

    // Route stream messages: maestra/stream/advertise[/type]
    if (partCount >= 3 && strcmp(parts[1], "stream") == 0 &&
        strcmp(parts[2], "advertise") == 0) {
        _handleStreamMessage(topic, doc.as<JsonObject>());
        return;
    }

    // Route entity messages: maestra/entity/state/<type>/<slug>
    if (partCount >= 5 && strcmp(parts[1], "entity") == 0) {
        const char* entitySlug = parts[4];

        for (int i = 0; i < _entityCount; i++) {
            if (_entities[i] && strcmp(_entities[i]->slug(), entitySlug) == 0) {
                _entities[i]->_handleMessage(doc.as<JsonObject>());
                break;
            }
        }
    }
}
