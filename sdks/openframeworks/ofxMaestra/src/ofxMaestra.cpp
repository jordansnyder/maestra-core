/**
 * ofxMaestra Implementation
 */

#include "ofxMaestra.h"

// ============================================================================
// MaestraEntityState
// ============================================================================

MaestraEntityState::MaestraEntityState() : _state(ofJson::object()) {}

bool MaestraEntityState::has(const std::string& key) const {
    return _state.contains(key);
}

const ofJson& MaestraEntityState::data() const {
    return _state;
}

void MaestraEntityState::_update(const ofJson& newState) {
    for (auto& [key, value] : newState.items()) {
        _state[key] = value;
    }
}

void MaestraEntityState::_replace(const ofJson& newState) {
    _state = newState;
}

// ============================================================================
// MaestraEntity
// ============================================================================

MaestraEntity::MaestraEntity(ofxMaestra* client, const std::string& slug)
    : _client(client), _slug(slug), _callback(nullptr) {}

const std::string& MaestraEntity::slug() const {
    return _slug;
}

MaestraEntityState& MaestraEntity::state() {
    return _state;
}

void MaestraEntity::updateState(const ofJson& updates) {
    _client->updateEntityState(_slug, updates);
}

void MaestraEntity::updateState(const std::string& key, const ofJson& value) {
    ofJson updates;
    updates[key] = value;
    _client->updateEntityState(_slug, updates);
}

void MaestraEntity::setState(const ofJson& newState) {
    _client->setEntityState(_slug, newState);
}

void MaestraEntity::onStateChange(MaestraStateChangeCallback callback) {
    _callback = callback;
}

void MaestraEntity::_handleMessage(const ofJson& payload) {
    if (!payload.contains("current_state")) return;

    const ofJson& currentState = payload["current_state"];
    _state._update(currentState);

    if (_callback) {
        std::vector<std::string> changedKeys;
        if (payload.contains("changed_keys") && payload["changed_keys"].is_array()) {
            for (const auto& key : payload["changed_keys"]) {
                changedKeys.push_back(key.get<std::string>());
            }
        }
        _callback(_slug, currentState, changedKeys);
    }
}

// ============================================================================
// ofxMaestra
// ============================================================================

ofxMaestra::ofxMaestra()
    : _broker("localhost"), _port(1883), _clientId("maestra-openframeworks"),
      _hasCredentials(false), _connected(false),
      _wildcardAllCallback(nullptr), _streamCallback(nullptr),
      _showPhase("idle") {}

ofxMaestra::~ofxMaestra() {
    disconnect();
}

void ofxMaestra::setBroker(const std::string& host, int port) {
    _broker = host;
    _port = port;
}

void ofxMaestra::setClientId(const std::string& clientId) {
    _clientId = clientId;
}

void ofxMaestra::setCredentials(const std::string& username, const std::string& password) {
    _username = username;
    _password = password;
    _hasCredentials = true;
}

bool ofxMaestra::connect() {
    // Register event listeners
    ofAddListener(_mqtt.onOnline, this, &ofxMaestra::_onConnected);
    ofAddListener(_mqtt.onMessage, this, &ofxMaestra::_onMessage);

    _mqtt.begin(_broker, _port);
    _mqtt.setClientId(_clientId);

    if (_hasCredentials) {
        _mqtt.setCredentials(_username, _password);
    }

    _mqtt.connect();
    ofLogNotice("ofxMaestra") << "Connecting to MQTT broker at " << _broker << ":" << _port;
    return true;
}

void ofxMaestra::disconnect() {
    if (_connected) {
        _mqtt.disconnect();
        _connected = false;
        ofLogNotice("ofxMaestra") << "Disconnected";
    }
}

bool ofxMaestra::isConnected() const {
    return _connected;
}

void ofxMaestra::update() {
    _mqtt.update();
}

void ofxMaestra::_onConnected() {
    _connected = true;
    ofLogNotice("ofxMaestra") << "Connected to MQTT broker";

    // Auto-subscribe to show control state
    _mqtt.subscribe("maestra/entity/state/show_control/show");
}

// ============================================================================
// Entity Management
// ============================================================================

MaestraEntity* ofxMaestra::getEntity(const std::string& slug) {
    // Check if already exists
    for (auto& entity : _entities) {
        if (entity->slug() == slug) {
            return entity.get();
        }
    }

    // Create new entity
    auto entity = std::make_unique<MaestraEntity>(this, slug);
    MaestraEntity* ptr = entity.get();
    _entities.push_back(std::move(entity));
    return ptr;
}

void ofxMaestra::subscribeEntity(const std::string& slug) {
    std::string topic = "maestra/entity/state/+/" + slug;
    _mqtt.subscribe(topic);
    ofLogNotice("ofxMaestra") << "Subscribed to: " << topic;
}

void ofxMaestra::subscribeAllEntities(MaestraWildcardCallback callback) {
    _wildcardAllCallback = callback;
    _mqtt.subscribe("maestra/entity/state/#");
    ofLogNotice("ofxMaestra") << "Subscribed to all entity state changes";
}

void ofxMaestra::subscribeEntityType(const std::string& type, MaestraWildcardCallback callback) {
    _wildcardTypes.push_back(type);
    _wildcardTypeCallbacks.push_back(callback);
    std::string topic = "maestra/entity/state/" + type + "/+";
    _mqtt.subscribe(topic);
    ofLogNotice("ofxMaestra") << "Subscribed to entity type: " << type;
}

// ============================================================================
// State Publishing
// ============================================================================

void ofxMaestra::updateEntityState(const std::string& slug, const ofJson& state, const std::string& source) {
    _publishState(slug, state, source, false);
}

void ofxMaestra::setEntityState(const std::string& slug, const ofJson& state, const std::string& source) {
    _publishState(slug, state, source, true);
}

void ofxMaestra::_publishState(const std::string& slug, const ofJson& state,
                                const std::string& source, bool replace) {
    std::string action = replace ? "set" : "update";
    std::string topic = "maestra/entity/state/" + action + "/" + slug;

    ofJson payload;
    payload["state"] = state;
    payload["source"] = source.empty() ? _clientId : source;

    _mqtt.publish(topic, payload.dump());
}

// ============================================================================
// Show Control
// ============================================================================

std::string ofxMaestra::getShowPhase() const {
    return _showPhase;
}

bool ofxMaestra::isShowActive() const {
    return _showPhase == "active";
}

bool ofxMaestra::isShowPaused() const {
    return _showPhase == "paused";
}

void ofxMaestra::_handleShowMessage(const ofJson& payload) {
    if (!payload.contains("current_state")) return;

    const ofJson& currentState = payload["current_state"];
    if (!currentState.contains("phase")) return;

    std::string newPhase = currentState.value("phase", "idle");
    std::string previousPhase = currentState.value("previous_phase", _showPhase);

    // Only fire event if phase actually changed
    if (newPhase != _showPhase) {
        _showPhase = newPhase;

        MaestraShowPhaseEvent event;
        event.phase = _showPhase;
        event.previousPhase = previousPhase;
        ofNotifyEvent(onShowPhaseChange, event);
    }
}

// ============================================================================
// Stream Support
// ============================================================================

void ofxMaestra::subscribeStreamEvents(MaestraStreamCallback callback) {
    _streamCallback = callback;
    _mqtt.subscribe("maestra/stream/advertise");
    ofLogNotice("ofxMaestra") << "Subscribed to stream events";
}

void ofxMaestra::subscribeStreamType(const std::string& streamType, MaestraStreamCallback callback) {
    _streamCallback = callback;
    std::string topic = "maestra/stream/advertise/" + streamType;
    _mqtt.subscribe(topic);
    ofLogNotice("ofxMaestra") << "Subscribed to stream type: " << streamType;
}

void ofxMaestra::advertiseStream(const std::string& name, const std::string& streamType,
                                  const std::string& protocol, const std::string& address,
                                  int port, const std::string& publisherId) {
    ofJson payload;
    payload["name"] = name;
    payload["stream_type"] = streamType;
    payload["publisher_id"] = publisherId.empty() ? _clientId : publisherId;
    payload["protocol"] = protocol;
    payload["address"] = address;
    payload["port"] = port;

    _mqtt.publish("maestra/stream/advertise", payload.dump());
    ofLogNotice("ofxMaestra") << "Advertised stream: " << name;
}

void ofxMaestra::withdrawStream(const std::string& streamId) {
    _mqtt.publish("maestra/stream/withdraw/" + streamId, "{}");
}

void ofxMaestra::streamHeartbeat(const std::string& streamId) {
    _mqtt.publish("maestra/stream/heartbeat/" + streamId, "{}");
}

void ofxMaestra::_handleStreamMessage(const ofJson& payload) {
    if (!_streamCallback) return;

    std::string streamId = payload.value("id", "");
    std::string name = payload.value("name", "");
    std::string streamType = payload.value("stream_type", "");
    std::string address = payload.value("address", "");
    int port = payload.value("port", 0);

    _streamCallback(streamId, name, streamType, address, port);
}

// ============================================================================
// Message Handler
// ============================================================================

void ofxMaestra::_onMessage(ofxMQTTMessage& msg) {
    // Split topic into parts
    std::vector<std::string> parts;
    std::string topic = msg.topic;
    size_t pos = 0;
    while ((pos = topic.find('/')) != std::string::npos) {
        parts.push_back(topic.substr(0, pos));
        topic.erase(0, pos + 1);
    }
    parts.push_back(topic);

    if (parts.size() < 3) return;

    // Parse JSON payload
    ofJson payload;
    try {
        payload = ofJson::parse(msg.payload);
    } catch (...) {
        return;
    }

    // Route stream messages: maestra/stream/advertise[/type]
    if (parts.size() >= 3 && parts[1] == "stream" && parts[2] == "advertise") {
        _handleStreamMessage(payload);
        return;
    }

    // Route entity messages: maestra/entity/state/<type>/<slug>
    if (parts.size() >= 5 && parts[1] == "entity" && parts[2] == "state") {
        const std::string& entityType = parts[3];
        const std::string& entitySlug = parts[4];

        // Intercept show control messages
        if (entityType == "show_control" && entitySlug == "show") {
            _handleShowMessage(payload);
        }

        // Dispatch to specific MaestraEntity if registered
        for (auto& entity : _entities) {
            if (entity->slug() == entitySlug) {
                entity->_handleMessage(payload);
                break;
            }
        }

        // Extract state and changed_keys for wildcard callbacks
        ofJson currentState = payload.contains("current_state")
            ? payload["current_state"] : ofJson::object();
        std::vector<std::string> changedKeys;
        if (payload.contains("changed_keys") && payload["changed_keys"].is_array()) {
            for (const auto& key : payload["changed_keys"]) {
                changedKeys.push_back(key.get<std::string>());
            }
        }

        // Fire wildcard all-entities callback
        if (_wildcardAllCallback) {
            _wildcardAllCallback(entityType, entitySlug, currentState, changedKeys);
        }

        // Fire matching per-type wildcard callbacks
        for (size_t i = 0; i < _wildcardTypes.size(); i++) {
            if (_wildcardTypes[i] == entityType) {
                _wildcardTypeCallbacks[i](entityType, entitySlug, currentState, changedKeys);
            }
        }
    }
}
