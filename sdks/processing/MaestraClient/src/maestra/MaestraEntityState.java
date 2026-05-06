package maestra;

import processing.data.JSONObject;

/**
 * Entity state container with typed getters.
 * Maintains a cached copy of the entity's current state.
 */
public class MaestraEntityState {
    private JSONObject state;

    public MaestraEntityState() {
        this.state = new JSONObject();
    }

    /** Get a string value, or defaultValue if the key is missing. */
    public String getString(String key, String defaultValue) {
        if (state.hasKey(key) && !state.isNull(key)) {
            return state.getString(key, defaultValue);
        }
        return defaultValue;
    }

    /** Get a string value, or empty string if missing. */
    public String getString(String key) {
        return getString(key, "");
    }

    /** Get an int value, or defaultValue if the key is missing. */
    public int getInt(String key, int defaultValue) {
        if (state.hasKey(key) && !state.isNull(key)) {
            return state.getInt(key, defaultValue);
        }
        return defaultValue;
    }

    /** Get an int value, or 0 if missing. */
    public int getInt(String key) {
        return getInt(key, 0);
    }

    /** Get a float value, or defaultValue if the key is missing. */
    public float getFloat(String key, float defaultValue) {
        if (state.hasKey(key) && !state.isNull(key)) {
            return state.getFloat(key, defaultValue);
        }
        return defaultValue;
    }

    /** Get a float value, or 0.0 if missing. */
    public float getFloat(String key) {
        return getFloat(key, 0.0f);
    }

    /** Get a boolean value, or defaultValue if the key is missing. */
    public boolean getBoolean(String key, boolean defaultValue) {
        if (state.hasKey(key) && !state.isNull(key)) {
            return state.getBoolean(key, defaultValue);
        }
        return defaultValue;
    }

    /** Get a boolean value, or false if missing. */
    public boolean getBoolean(String key) {
        return getBoolean(key, false);
    }

    /** Get a nested JSONObject, or null if missing. */
    public JSONObject getJSONObject(String key) {
        if (state.hasKey(key) && !state.isNull(key)) {
            return state.getJSONObject(key);
        }
        return null;
    }

    /** Check if a key exists in the state. */
    public boolean has(String key) {
        return state.hasKey(key);
    }

    /** Get the full state as a JSONObject (copy). */
    public JSONObject data() {
        return state;
    }

    /** Internal: merge incoming state keys into the cached state. */
    void _update(JSONObject newState) {
        for (Object keyObj : newState.keys()) {
            String key = (String) keyObj;
            Object value = newState.get(key);
            state.put(key, value);
        }
    }

    /** Internal: replace the entire state. */
    void _replace(JSONObject newState) {
        this.state = newState;
    }
}
