package maestra;

import processing.data.JSONObject;
import processing.data.JSONArray;

/**
 * Callback interfaces for Maestra state changes and stream events.
 */

/** Called when a specific entity's state changes. */
public interface StateChangeCallback {
    void stateChanged(String entitySlug, JSONObject state, JSONArray changedKeys);
}

/** Called for wildcard entity subscriptions (all entities or by type). */
interface WildcardEntityCallback {
    void stateChanged(String entityType, String entitySlug, JSONObject state, JSONArray changedKeys);
}

/** Called when a stream is advertised. */
interface StreamAdvertisedCallback {
    void streamAdvertised(String streamId, String name, String streamType, String address, int port);
}

/** Called when the show phase changes. */
interface ShowPhaseChangeCallback {
    void showPhaseChanged(String phase, String previousPhase);
}

/** Internal: queued MQTT message for thread-safe processing. */
class QueuedMessage {
    final String topic;
    final String payload;

    QueuedMessage(String topic, String payload) {
        this.topic = topic;
        this.payload = payload;
    }
}
