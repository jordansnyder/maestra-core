package maestra;

import processing.data.JSONObject;
import processing.data.JSONArray;

/**
 * Represents a single Maestra entity with state management and change callbacks.
 */
public class MaestraEntity {
    private MaestraClient client;
    private String slug;
    private MaestraEntityState state;
    private StateChangeCallback callback;

    public MaestraEntity(MaestraClient client, String slug) {
        this.client = client;
        this.slug = slug;
        this.state = new MaestraEntityState();
        this.callback = null;
    }

    /** Get the entity slug. */
    public String slug() {
        return slug;
    }

    /** Get the cached entity state. */
    public MaestraEntityState state() {
        return state;
    }

    /** Update state (merge). Publishes to maestra/entity/state/update/<slug>. */
    public void updateState(JSONObject updates) {
        client.updateEntityState(slug, updates, null);
    }

    /** Update a single state key (merge). */
    public void updateState(String key, Object value) {
        JSONObject updates = new JSONObject();
        updates.put(key, value);
        client.updateEntityState(slug, updates, null);
    }

    /** Replace the entire state. Publishes to maestra/entity/state/set/<slug>. */
    public void setState(JSONObject newState) {
        client.setEntityState(slug, newState, null);
    }

    /** Register a callback for state changes. Set before calling subscribeEntity(). */
    public void onStateChange(StateChangeCallback callback) {
        this.callback = callback;
    }

    /** Internal: handle an incoming state change message on the main thread. */
    void _handleMessage(JSONObject payload) {
        if (!payload.hasKey("current_state")) return;

        JSONObject currentState = payload.getJSONObject("current_state");
        state._update(currentState);

        if (callback != null) {
            JSONArray changedKeys = payload.hasKey("changed_keys")
                ? payload.getJSONArray("changed_keys") : new JSONArray();
            callback.stateChanged(slug, currentState, changedKeys);
        }
    }
}
