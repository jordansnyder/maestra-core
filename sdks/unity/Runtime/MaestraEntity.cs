using System;
using System.Collections.Generic;
using UnityEngine;
using Newtonsoft.Json.Linq;

namespace Maestra
{
    /// <summary>
    /// Represents an entity in the Maestra platform.
    /// Provides access to entity metadata and state management.
    /// </summary>
    public class MaestraEntity : MonoBehaviour
    {
        [Header("Entity Info")]
        [SerializeField] private string _id;
        [SerializeField] private string _name;
        [SerializeField] private string _slug;
        [SerializeField] private string _entityType;
        [SerializeField] private string _parentId;
        [SerializeField] private string _status;

        private Dictionary<string, object> _state = new Dictionary<string, object>();
        private MaestraClient _client;

        // Properties
        public string Id => _id;
        public string Name => _name;
        public string Slug => _slug;
        public string EntityType => _entityType;
        public string ParentId => _parentId;
        public string Status => _status;

        /// <summary>
        /// Event fired when state changes
        /// </summary>
        public event Action<MaestraEntity, List<string>> OnStateChanged;

        /// <summary>
        /// Initialize entity from API data
        /// </summary>
        internal void Initialize(EntityData data, MaestraClient client)
        {
            _client = client;
            _id = data.Id;
            _name = data.Name;
            _slug = data.Slug;
            _entityType = data.EntityType;
            _parentId = data.ParentId;
            _status = data.Status;
            _state = data.State ?? new Dictionary<string, object>();

            gameObject.name = $"MaestraEntity_{_slug}";
        }

        /// <summary>
        /// Update state from API response
        /// </summary>
        internal void UpdateStateFromResponse(StateResponse response)
        {
            var changedKeys = new List<string>();

            foreach (var kvp in response.State)
            {
                if (!_state.ContainsKey(kvp.Key) || !Equals(_state[kvp.Key], kvp.Value))
                {
                    changedKeys.Add(kvp.Key);
                }
            }

            _state = response.State;
            OnStateChanged?.Invoke(this, changedKeys);
        }

        /// <summary>
        /// Get state value as string
        /// </summary>
        public string GetString(string key, string defaultValue = "")
        {
            if (_state.TryGetValue(key, out var value))
            {
                return value?.ToString() ?? defaultValue;
            }
            return defaultValue;
        }

        /// <summary>
        /// Get state value as int
        /// </summary>
        public int GetInt(string key, int defaultValue = 0)
        {
            if (_state.TryGetValue(key, out var value))
            {
                if (value is int i) return i;
                if (value is long l) return (int)l;
                if (value is double d) return (int)d;
                if (value is float f) return (int)f;
                if (int.TryParse(value?.ToString(), out int parsed)) return parsed;
            }
            return defaultValue;
        }

        /// <summary>
        /// Get state value as float
        /// </summary>
        public float GetFloat(string key, float defaultValue = 0f)
        {
            if (_state.TryGetValue(key, out var value))
            {
                if (value is float f) return f;
                if (value is double d) return (float)d;
                if (value is int i) return i;
                if (value is long l) return l;
                if (float.TryParse(value?.ToString(), out float parsed)) return parsed;
            }
            return defaultValue;
        }

        /// <summary>
        /// Get state value as bool
        /// </summary>
        public bool GetBool(string key, bool defaultValue = false)
        {
            if (_state.TryGetValue(key, out var value))
            {
                if (value is bool b) return b;
                if (bool.TryParse(value?.ToString(), out bool parsed)) return parsed;
            }
            return defaultValue;
        }

        /// <summary>
        /// Get state value as Vector3 (from object with x, y, z)
        /// </summary>
        public Vector3 GetVector3(string key, Vector3 defaultValue = default)
        {
            if (_state.TryGetValue(key, out var value))
            {
                if (value is JObject jobj)
                {
                    return new Vector3(
                        jobj.Value<float>("x"),
                        jobj.Value<float>("y"),
                        jobj.Value<float>("z")
                    );
                }
                if (value is Dictionary<string, object> dict)
                {
                    float x = dict.TryGetValue("x", out var xv) ? Convert.ToSingle(xv) : 0;
                    float y = dict.TryGetValue("y", out var yv) ? Convert.ToSingle(yv) : 0;
                    float z = dict.TryGetValue("z", out var zv) ? Convert.ToSingle(zv) : 0;
                    return new Vector3(x, y, z);
                }
            }
            return defaultValue;
        }

        /// <summary>
        /// Get state value as Color (from hex string or object)
        /// </summary>
        public Color GetColor(string key, Color defaultValue = default)
        {
            if (_state.TryGetValue(key, out var value))
            {
                if (value is string hex)
                {
                    if (ColorUtility.TryParseHtmlString(hex, out Color color))
                    {
                        return color;
                    }
                }
            }
            return defaultValue;
        }

        /// <summary>
        /// Check if state has a specific key
        /// </summary>
        public bool HasKey(string key)
        {
            return _state.ContainsKey(key);
        }

        /// <summary>
        /// Get all state keys
        /// </summary>
        public IEnumerable<string> GetKeys()
        {
            return _state.Keys;
        }

        /// <summary>
        /// Get full state dictionary
        /// </summary>
        public Dictionary<string, object> GetState()
        {
            return new Dictionary<string, object>(_state);
        }

        /// <summary>
        /// Update state with new values (merge)
        /// </summary>
        public void UpdateState(Dictionary<string, object> updates, Action<StateResponse> callback = null)
        {
            _client?.SendEntityStateUpdate(_id, updates, false, callback);
        }

        /// <summary>
        /// Replace entire state
        /// </summary>
        public void SetState(Dictionary<string, object> newState, Action<StateResponse> callback = null)
        {
            _client?.SendEntityStateUpdate(_id, newState, true, callback);
        }

        /// <summary>
        /// Set a single string value
        /// </summary>
        public void SetValue(string key, string value, Action<StateResponse> callback = null)
        {
            UpdateState(new Dictionary<string, object> { { key, value } }, callback);
        }

        /// <summary>
        /// Set a single int value
        /// </summary>
        public void SetValue(string key, int value, Action<StateResponse> callback = null)
        {
            UpdateState(new Dictionary<string, object> { { key, value } }, callback);
        }

        /// <summary>
        /// Set a single float value
        /// </summary>
        public void SetValue(string key, float value, Action<StateResponse> callback = null)
        {
            UpdateState(new Dictionary<string, object> { { key, value } }, callback);
        }

        /// <summary>
        /// Set a single bool value
        /// </summary>
        public void SetValue(string key, bool value, Action<StateResponse> callback = null)
        {
            UpdateState(new Dictionary<string, object> { { key, value } }, callback);
        }

        /// <summary>
        /// Set a Vector3 value
        /// </summary>
        public void SetValue(string key, Vector3 value, Action<StateResponse> callback = null)
        {
            var dict = new Dictionary<string, object>
            {
                { "x", value.x },
                { "y", value.y },
                { "z", value.z }
            };
            UpdateState(new Dictionary<string, object> { { key, dict } }, callback);
        }

        /// <summary>
        /// Set a Color value (as hex string)
        /// </summary>
        public void SetValue(string key, Color value, Action<StateResponse> callback = null)
        {
            string hex = ColorUtility.ToHtmlStringRGB(value);
            UpdateState(new Dictionary<string, object> { { key, $"#{hex}" } }, callback);
        }
    }
}
