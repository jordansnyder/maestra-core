/**
 * ofxMaestra - OpenFrameworks addon for the Maestra platform
 *
 * MQTT-based state management for creative coding with OpenFrameworks.
 * Requires the ofxMQTT addon (https://github.com/256dpi/ofxMQTT).
 */

#pragma once

#include "ofMain.h"
#include "ofxMQTT.h"
#include <functional>
#include <vector>
#include <string>
#include <memory>

// Forward declarations
class ofxMaestra;

// ============================================================================
// Callback types
// ============================================================================

using MaestraStateChangeCallback = std::function<void(
    const std::string& entitySlug,
    const ofJson& state,
    const std::vector<std::string>& changedKeys)>;

using MaestraWildcardCallback = std::function<void(
    const std::string& entityType,
    const std::string& entitySlug,
    const ofJson& state,
    const std::vector<std::string>& changedKeys)>;

using MaestraStreamCallback = std::function<void(
    const std::string& streamId,
    const std::string& name,
    const std::string& streamType,
    const std::string& address,
    int port)>;

// ============================================================================
// MaestraEntityState
// ============================================================================

class MaestraEntityState {
public:
    MaestraEntityState();

    /** Get a value by key with a default. */
    template<typename T>
    T get(const std::string& key, T defaultValue) const {
        if (_state.contains(key) && !_state[key].is_null()) {
            try {
                return _state[key].get<T>();
            } catch (...) {
                return defaultValue;
            }
        }
        return defaultValue;
    }

    /** Check if a key exists in the state. */
    bool has(const std::string& key) const;

    /** Get the full state as JSON. */
    const ofJson& data() const;

    /** Internal: merge incoming state keys. */
    void _update(const ofJson& newState);

    /** Internal: replace entire state. */
    void _replace(const ofJson& newState);

private:
    ofJson _state;
};

// ============================================================================
// MaestraEntity
// ============================================================================

class MaestraEntity {
public:
    MaestraEntity(ofxMaestra* client, const std::string& slug);

    /** Get the entity slug. */
    const std::string& slug() const;

    /** Get the cached entity state. */
    MaestraEntityState& state();

    /** Update state (merge). Publishes to maestra/entity/state/update/<slug>. */
    void updateState(const ofJson& updates);

    /** Update a single state key (merge). */
    void updateState(const std::string& key, const ofJson& value);

    /** Replace the entire state. Publishes to maestra/entity/state/set/<slug>. */
    void setState(const ofJson& newState);

    /** Register a callback for state changes. Set before calling subscribeEntity(). */
    void onStateChange(MaestraStateChangeCallback callback);

    /** Internal: handle an incoming state change message. */
    void _handleMessage(const ofJson& payload);

private:
    ofxMaestra* _client;
    std::string _slug;
    MaestraEntityState _state;
    MaestraStateChangeCallback _callback;
};

// ============================================================================
// MaestraStreamInfo
// ============================================================================

struct MaestraStreamInfo {
    std::string id;
    std::string name;
    std::string stream_type;
    std::string publisher_id;
    std::string protocol;
    std::string address;
    int port;
};

// ============================================================================
// ofxMaestra
// ============================================================================

class ofxMaestra {
public:
    ofxMaestra();
    ~ofxMaestra();

    // Configuration
    void setBroker(const std::string& host, int port = 1883);
    void setClientId(const std::string& clientId);
    void setCredentials(const std::string& username, const std::string& password);

    // Connection
    bool connect();
    void disconnect();
    bool isConnected() const;

    /** Process MQTT events. Call from ofApp::update(). */
    void update();

    // Entity management
    MaestraEntity* getEntity(const std::string& slug);
    void subscribeEntity(const std::string& slug);
    void subscribeAllEntities(MaestraWildcardCallback callback);
    void subscribeEntityType(const std::string& type, MaestraWildcardCallback callback);

    // State publishing
    void updateEntityState(const std::string& slug, const ofJson& state, const std::string& source = "");
    void setEntityState(const std::string& slug, const ofJson& state, const std::string& source = "");

    // Stream discovery
    void subscribeStreamEvents(MaestraStreamCallback callback);
    void subscribeStreamType(const std::string& streamType, MaestraStreamCallback callback);

    // Stream advertisement
    void advertiseStream(const std::string& name, const std::string& streamType,
                         const std::string& protocol, const std::string& address,
                         int port, const std::string& publisherId = "");
    void withdrawStream(const std::string& streamId);
    void streamHeartbeat(const std::string& streamId);

private:
    ofxMQTT _mqtt;
    std::string _broker;
    int _port;
    std::string _clientId;
    std::string _username;
    std::string _password;
    bool _hasCredentials;
    bool _connected;

    // Entity registry
    std::vector<std::unique_ptr<MaestraEntity>> _entities;

    // Wildcard entity subscriptions
    MaestraWildcardCallback _wildcardAllCallback;
    std::vector<std::string> _wildcardTypes;
    std::vector<MaestraWildcardCallback> _wildcardTypeCallbacks;

    // Stream subscriptions
    MaestraStreamCallback _streamCallback;

    // Internal
    void _onMessage(ofxMQTTMessage& msg);
    void _onConnected();
    void _publishState(const std::string& slug, const ofJson& state,
                       const std::string& source, bool replace);
    void _handleStreamMessage(const ofJson& payload);
};
