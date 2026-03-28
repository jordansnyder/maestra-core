package maestra;

import processing.core.PApplet;
import processing.data.JSONObject;
import processing.data.JSONArray;
import mqtt.MQTTClient;
import java.util.ArrayList;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * Maestra Client for Processing
 *
 * MQTT-based state management for creative coding with Processing.
 * Requires the processing-mqtt library by 256dpi.
 *
 * Usage:
 *   MaestraClient maestra;
 *
 *   void setup() {
 *       maestra = new MaestraClient(this);
 *       maestra.setBroker("192.168.1.100");
 *       maestra.setClientId("my-sketch");
 *       maestra.connect();
 *   }
 *
 *   void draw() {
 *       maestra.update();  // Required - processes incoming messages
 *   }
 */
public class MaestraClient {
    private PApplet parent;
    private MQTTClient mqtt;
    private String broker = "localhost";
    private int port = 1883;
    private String clientId = "maestra-processing";
    private String username;
    private String password;
    private boolean hasCredentials = false;
    private boolean connected = false;

    // Entity registry
    private ArrayList<MaestraEntity> entities = new ArrayList<MaestraEntity>();

    // Wildcard entity subscriptions
    private WildcardEntityCallback wildcardAllCallback;
    private ArrayList<String> wildcardTypes = new ArrayList<String>();
    private ArrayList<WildcardEntityCallback> wildcardTypeCallbacks = new ArrayList<WildcardEntityCallback>();

    // Stream subscriptions
    private StreamAdvertisedCallback streamCallback;

    // Thread-safe message queue (MQTT callbacks arrive on Paho thread)
    private ConcurrentLinkedQueue<QueuedMessage> messageQueue = new ConcurrentLinkedQueue<QueuedMessage>();

    /**
     * Create a new MaestraClient.
     * @param parent  The Processing PApplet (pass 'this' from your sketch)
     */
    public MaestraClient(PApplet parent) {
        this.parent = parent;
        // Register dispose callback for cleanup on sketch exit
        parent.registerMethod("dispose", this);
    }

    // ========================================================================
    // Configuration
    // ========================================================================

    /** Set the MQTT broker host and port. */
    public void setBroker(String host, int port) {
        this.broker = host;
        this.port = port;
    }

    /** Set the MQTT broker host (default port 1883). */
    public void setBroker(String host) {
        setBroker(host, 1883);
    }

    /** Set the MQTT client ID. */
    public void setClientId(String clientId) {
        this.clientId = clientId;
    }

    /** Set MQTT credentials for authenticated brokers. */
    public void setCredentials(String username, String password) {
        this.username = username;
        this.password = password;
        this.hasCredentials = true;
    }

    // ========================================================================
    // Connection
    // ========================================================================

    /** Connect to the MQTT broker. */
    public boolean connect() {
        try {
            mqtt = new MQTTClient(parent);
            if (hasCredentials) {
                mqtt.connect("mqtt://" + broker + ":" + port, clientId, username, password);
            } else {
                mqtt.connect("mqtt://" + broker + ":" + port, clientId);
            }
            connected = true;
            PApplet.println("[Maestra] Connected to MQTT broker at " + broker + ":" + port);
            return true;
        } catch (Exception e) {
            PApplet.println("[Maestra] Connection failed: " + e.getMessage());
            connected = false;
            return false;
        }
    }

    /** Disconnect from the MQTT broker. */
    public void disconnect() {
        if (mqtt != null) {
            mqtt.disconnect();
            connected = false;
        }
    }

    /** Check if connected to the MQTT broker. */
    public boolean isConnected() {
        return connected;
    }

    /**
     * Process incoming MQTT messages. MUST be called in draw().
     * Drains the message queue and dispatches to entity callbacks on the main thread.
     */
    public void update() {
        QueuedMessage msg;
        while ((msg = messageQueue.poll()) != null) {
            _processMessage(msg.topic, msg.payload);
        }
    }

    /** Called by Processing on sketch exit. */
    public void dispose() {
        disconnect();
    }

    // ========================================================================
    // Entity Management
    // ========================================================================

    /** Get or create an entity reference by slug. */
    public MaestraEntity getEntity(String slug) {
        for (MaestraEntity entity : entities) {
            if (entity.slug().equals(slug)) {
                return entity;
            }
        }
        MaestraEntity entity = new MaestraEntity(this, slug);
        entities.add(entity);
        return entity;
    }

    /** Subscribe to state changes for a specific entity. */
    public void subscribeEntity(String slug) {
        if (mqtt == null) return;
        String topic = "maestra/entity/state/+/" + slug;
        mqtt.subscribe(topic);
        PApplet.println("[Maestra] Subscribed to: " + topic);
    }

    /** Subscribe to state changes for ALL entities. */
    public void subscribeAllEntities(WildcardEntityCallback callback) {
        this.wildcardAllCallback = callback;
        if (mqtt == null) return;
        mqtt.subscribe("maestra/entity/state/#");
        PApplet.println("[Maestra] Subscribed to all entity state changes");
    }

    /** Subscribe to state changes for a specific entity type. */
    public void subscribeEntityType(String type, WildcardEntityCallback callback) {
        wildcardTypes.add(type);
        wildcardTypeCallbacks.add(callback);
        if (mqtt == null) return;
        String topic = "maestra/entity/state/" + type + "/+";
        mqtt.subscribe(topic);
        PApplet.println("[Maestra] Subscribed to entity type: " + type);
    }

    // ========================================================================
    // State Publishing
    // ========================================================================

    /** Publish a state update (merge) for an entity. */
    public void updateEntityState(String slug, JSONObject state, String source) {
        _publishState(slug, state, source, false);
    }

    /** Publish a complete state replacement for an entity. */
    public void setEntityState(String slug, JSONObject state, String source) {
        _publishState(slug, state, source, true);
    }

    private void _publishState(String slug, JSONObject state, String source, boolean replace) {
        if (mqtt == null) return;

        String action = replace ? "set" : "update";
        String topic = "maestra/entity/state/" + action + "/" + slug;

        JSONObject payload = new JSONObject();
        payload.put("state", state);
        if (source != null) {
            payload.put("source", source);
        } else {
            payload.put("source", clientId);
        }

        mqtt.publish(topic, payload.toString());
    }

    // ========================================================================
    // Stream Support
    // ========================================================================

    /** Subscribe to all stream advertisement events. */
    public void subscribeStreamEvents(StreamAdvertisedCallback callback) {
        this.streamCallback = callback;
        if (mqtt == null) return;
        mqtt.subscribe("maestra/stream/advertise");
        PApplet.println("[Maestra] Subscribed to stream events");
    }

    /** Subscribe to stream advertisements of a specific type. */
    public void subscribeStreamType(String streamType, StreamAdvertisedCallback callback) {
        this.streamCallback = callback;
        if (mqtt == null) return;
        String topic = "maestra/stream/advertise/" + streamType;
        mqtt.subscribe(topic);
        PApplet.println("[Maestra] Subscribed to stream type: " + streamType);
    }

    /** Advertise a stream. */
    public void advertiseStream(String name, String streamType, String protocol,
                                 String address, int port) {
        advertiseStream(name, streamType, protocol, address, port, null);
    }

    /** Advertise a stream with a custom publisher ID. */
    public void advertiseStream(String name, String streamType, String protocol,
                                 String address, int port, String publisherId) {
        if (mqtt == null) return;

        JSONObject payload = new JSONObject();
        payload.put("name", name);
        payload.put("stream_type", streamType);
        payload.put("publisher_id", publisherId != null ? publisherId : clientId);
        payload.put("protocol", protocol);
        payload.put("address", address);
        payload.put("port", port);

        mqtt.publish("maestra/stream/advertise", payload.toString());
        PApplet.println("[Maestra] Advertised stream: " + name);
    }

    /** Withdraw (remove) a stream advertisement. */
    public void withdrawStream(String streamId) {
        if (mqtt == null) return;
        mqtt.publish("maestra/stream/withdraw/" + streamId, "{}");
    }

    /** Send a heartbeat for a stream to keep it alive. */
    public void streamHeartbeat(String streamId) {
        if (mqtt == null) return;
        mqtt.publish("maestra/stream/heartbeat/" + streamId, "{}");
    }

    // ========================================================================
    // MQTT Message Handling
    // ========================================================================

    /**
     * Called by processing-mqtt on the Paho thread.
     * The processing-mqtt library calls messageReceived() on the PApplet,
     * but we use clientReceived() pattern to route through this client.
     * Users should add this to their sketch:
     *
     *   void clientConnected() { }
     *   void messageReceived(String topic, byte[] payload) {
     *       maestra.messageReceived(topic, new String(payload));
     *   }
     *   void connectionLost() { maestra.connectionLost(); }
     */
    public void messageReceived(String topic, String payload) {
        // Queue for processing on the main thread
        messageQueue.add(new QueuedMessage(topic, payload));
    }

    /** Called when the MQTT connection is lost. */
    public void connectionLost() {
        connected = false;
        PApplet.println("[Maestra] Connection lost");
    }

    /** Internal: process a message on the main thread (called from update()). */
    private void _processMessage(String topic, String payloadStr) {
        String[] parts = topic.split("/");
        if (parts.length < 3) return;

        JSONObject payload;
        try {
            payload = JSONObject.parse(payloadStr);
        } catch (Exception e) {
            return;
        }
        if (payload == null) return;

        // Route stream messages: maestra/stream/advertise[/type]
        if (parts.length >= 3 && parts[1].equals("stream") && parts[2].equals("advertise")) {
            _handleStreamMessage(payload);
            return;
        }

        // Route entity messages: maestra/entity/state/<type>/<slug>
        if (parts.length >= 5 && parts[1].equals("entity") && parts[2].equals("state")) {
            String entityType = parts[3];
            String entitySlug = parts[4];

            // Dispatch to specific MaestraEntity if registered
            for (MaestraEntity entity : entities) {
                if (entity.slug().equals(entitySlug)) {
                    entity._handleMessage(payload);
                    break;
                }
            }

            // Extract state and changed_keys for wildcard callbacks
            JSONObject currentState = payload.hasKey("current_state")
                ? payload.getJSONObject("current_state") : new JSONObject();
            JSONArray changedKeys = payload.hasKey("changed_keys")
                ? payload.getJSONArray("changed_keys") : new JSONArray();

            // Fire wildcard all-entities callback
            if (wildcardAllCallback != null) {
                wildcardAllCallback.stateChanged(entityType, entitySlug, currentState, changedKeys);
            }

            // Fire matching per-type wildcard callbacks
            for (int i = 0; i < wildcardTypes.size(); i++) {
                if (wildcardTypes.get(i).equals(entityType)) {
                    wildcardTypeCallbacks.get(i).stateChanged(entityType, entitySlug, currentState, changedKeys);
                }
            }
        }
    }

    private void _handleStreamMessage(JSONObject payload) {
        if (streamCallback == null) return;

        String streamId = payload.getString("id", "");
        String name = payload.getString("name", "");
        String streamType = payload.getString("stream_type", "");
        String address = payload.getString("address", "");
        int port = payload.getInt("port", 0);

        streamCallback.streamAdvertised(streamId, name, streamType, address, port);
    }
}
