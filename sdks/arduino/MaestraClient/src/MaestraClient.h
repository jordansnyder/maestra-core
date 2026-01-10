/**
 * Maestra Client for Arduino/ESP32
 * MQTT-based state management for IoT devices
 */

#ifndef MAESTRA_CLIENT_H
#define MAESTRA_CLIENT_H

#include <Arduino.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <functional>

// Default buffer sizes
#define MAESTRA_JSON_BUFFER_SIZE 1024
#define MAESTRA_TOPIC_BUFFER_SIZE 128

// State change callback type
typedef std::function<void(const char* entitySlug, JsonObject state, JsonArray changedKeys)> StateChangeCallback;

/**
 * Entity State container
 */
class MaestraEntityState {
public:
    MaestraEntityState();

    // Get state value
    template<typename T>
    T get(const char* key, T defaultValue = T()) {
        if (_state.containsKey(key)) {
            return _state[key].as<T>();
        }
        return defaultValue;
    }

    // Check if key exists
    bool has(const char* key);

    // Get raw JSON object
    JsonObject data();

    // Internal: Update from JSON
    void _update(JsonObject newState);

private:
    StaticJsonDocument<MAESTRA_JSON_BUFFER_SIZE> _doc;
    JsonObject _state;
};

/**
 * Maestra Entity
 */
class MaestraEntity {
public:
    MaestraEntity(class MaestraClient* client, const char* slug);

    const char* slug() const { return _slug; }
    MaestraEntityState& state() { return _state; }

    // Update state (merge)
    void updateState(JsonObject updates);
    void updateState(const char* key, JsonVariant value);

    // Set complete state
    void setState(JsonObject newState);

    // Subscribe to state changes
    void onStateChange(StateChangeCallback callback);

    // Internal: Handle incoming message
    void _handleMessage(JsonObject payload);

private:
    class MaestraClient* _client;
    char _slug[64];
    MaestraEntityState _state;
    StateChangeCallback _callback;
};

/**
 * Maestra Client
 * Main entry point for Arduino SDK
 */
class MaestraClient {
public:
    MaestraClient(Client& networkClient);

    // Configuration
    void setBroker(const char* host, uint16_t port = 1883);
    void setClientId(const char* clientId);
    void setCredentials(const char* username, const char* password);

    // Connection
    bool connect();
    void disconnect();
    bool isConnected();
    void loop();

    // Entity management
    MaestraEntity* getEntity(const char* slug);
    void subscribeEntity(const char* slug);

    // State updates
    void updateEntityState(const char* slug, JsonObject state, const char* source = nullptr);
    void setEntityState(const char* slug, JsonObject state, const char* source = nullptr);

    // Internal: MQTT callback
    void _handleMessage(char* topic, byte* payload, unsigned int length);

private:
    PubSubClient _mqtt;
    char _broker[64];
    uint16_t _port;
    char _clientId[32];
    char _username[32];
    char _password[64];
    bool _hasCredentials;

    // Entity registry
    static const int MAX_ENTITIES = 10;
    MaestraEntity* _entities[MAX_ENTITIES];
    int _entityCount;

    void _publishState(const char* slug, JsonObject state, const char* source, bool replace);
};

#endif // MAESTRA_CLIENT_H
