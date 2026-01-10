using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace Maestra
{
    /// <summary>
    /// Entity type data
    /// </summary>
    [Serializable]
    public class EntityType
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("display_name")]
        public string DisplayName { get; set; }

        [JsonProperty("icon")]
        public string Icon { get; set; }

        [JsonProperty("default_state")]
        public Dictionary<string, object> DefaultState { get; set; }
    }

    /// <summary>
    /// Entity data from API
    /// </summary>
    [Serializable]
    public class EntityData
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("slug")]
        public string Slug { get; set; }

        [JsonProperty("entity_type")]
        public string EntityType { get; set; }

        [JsonProperty("entity_type_id")]
        public string EntityTypeId { get; set; }

        [JsonProperty("parent_id")]
        public string ParentId { get; set; }

        [JsonProperty("path")]
        public string Path { get; set; }

        [JsonProperty("state")]
        public Dictionary<string, object> State { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; }

        [JsonProperty("tags")]
        public List<string> Tags { get; set; }

        [JsonProperty("metadata")]
        public Dictionary<string, object> Metadata { get; set; }

        [JsonProperty("created_at")]
        public DateTime CreatedAt { get; set; }

        [JsonProperty("updated_at")]
        public DateTime UpdatedAt { get; set; }

        [JsonProperty("state_updated_at")]
        public DateTime StateUpdatedAt { get; set; }
    }

    /// <summary>
    /// State change event data
    /// </summary>
    [Serializable]
    public class StateChangeEvent
    {
        [JsonProperty("type")]
        public string Type { get; set; }

        [JsonProperty("entity_id")]
        public string EntityId { get; set; }

        [JsonProperty("entity_slug")]
        public string EntitySlug { get; set; }

        [JsonProperty("entity_type")]
        public string EntityType { get; set; }

        [JsonProperty("previous_state")]
        public Dictionary<string, object> PreviousState { get; set; }

        [JsonProperty("current_state")]
        public Dictionary<string, object> CurrentState { get; set; }

        [JsonProperty("changed_keys")]
        public List<string> ChangedKeys { get; set; }

        [JsonProperty("source")]
        public string Source { get; set; }

        [JsonProperty("timestamp")]
        public DateTime Timestamp { get; set; }
    }

    /// <summary>
    /// Request body for state updates
    /// </summary>
    [Serializable]
    internal class StateUpdateRequest
    {
        [JsonProperty("state")]
        public Dictionary<string, object> State { get; set; }

        [JsonProperty("source")]
        public string Source { get; set; } = "unity";
    }

    /// <summary>
    /// Response from state endpoints
    /// </summary>
    [Serializable]
    public class StateResponse
    {
        [JsonProperty("entity_id")]
        public string EntityId { get; set; }

        [JsonProperty("slug")]
        public string Slug { get; set; }

        [JsonProperty("state")]
        public Dictionary<string, object> State { get; set; }

        [JsonProperty("state_updated_at")]
        public DateTime StateUpdatedAt { get; set; }
    }
}
