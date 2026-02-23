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

    // ===== Stream Types =====

    /// <summary>
    /// Stream type definition
    /// </summary>
    [Serializable]
    public class StreamTypeInfo
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("display_name")]
        public string DisplayName { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("icon")]
        public string Icon { get; set; }

        [JsonProperty("default_config")]
        public Dictionary<string, object> DefaultConfig { get; set; }

        [JsonProperty("metadata")]
        public Dictionary<string, object> Metadata { get; set; }
    }

    /// <summary>
    /// Stream information from the registry
    /// </summary>
    [Serializable]
    public class StreamInfo
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("stream_type")]
        public string StreamType { get; set; }

        [JsonProperty("publisher_id")]
        public string PublisherId { get; set; }

        [JsonProperty("protocol")]
        public string Protocol { get; set; }

        [JsonProperty("address")]
        public string Address { get; set; }

        [JsonProperty("port")]
        public int Port { get; set; }

        [JsonProperty("entity_id")]
        public string EntityId { get; set; }

        [JsonProperty("device_id")]
        public string DeviceId { get; set; }

        [JsonProperty("config")]
        public Dictionary<string, object> Config { get; set; }

        [JsonProperty("metadata")]
        public Dictionary<string, object> Metadata { get; set; }

        [JsonProperty("advertised_at")]
        public string AdvertisedAt { get; set; }

        [JsonProperty("last_heartbeat")]
        public string LastHeartbeat { get; set; }

        [JsonProperty("active_sessions")]
        public int ActiveSessions { get; set; }
    }

    /// <summary>
    /// Request body for advertising a stream
    /// </summary>
    [Serializable]
    public class StreamAdvertiseRequest
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("stream_type")]
        public string StreamType { get; set; }

        [JsonProperty("publisher_id")]
        public string PublisherId { get; set; }

        [JsonProperty("protocol")]
        public string Protocol { get; set; }

        [JsonProperty("address")]
        public string Address { get; set; }

        [JsonProperty("port")]
        public int Port { get; set; }

        [JsonProperty("entity_id")]
        public string EntityId { get; set; }

        [JsonProperty("device_id")]
        public string DeviceId { get; set; }

        [JsonProperty("config")]
        public Dictionary<string, object> Config { get; set; }

        [JsonProperty("metadata")]
        public Dictionary<string, object> Metadata { get; set; }
    }

    /// <summary>
    /// Request body for consuming a stream
    /// </summary>
    [Serializable]
    public class StreamRequestBody
    {
        [JsonProperty("consumer_id")]
        public string ConsumerId { get; set; }

        [JsonProperty("consumer_address")]
        public string ConsumerAddress { get; set; }

        [JsonProperty("consumer_port")]
        public int? ConsumerPort { get; set; }

        [JsonProperty("config")]
        public Dictionary<string, object> Config { get; set; }
    }

    /// <summary>
    /// Publisher's response with connection details
    /// </summary>
    [Serializable]
    public class StreamOffer
    {
        [JsonProperty("session_id")]
        public string SessionId { get; set; }

        [JsonProperty("stream_id")]
        public string StreamId { get; set; }

        [JsonProperty("stream_name")]
        public string StreamName { get; set; }

        [JsonProperty("stream_type")]
        public string StreamType { get; set; }

        [JsonProperty("protocol")]
        public string Protocol { get; set; }

        [JsonProperty("publisher_address")]
        public string PublisherAddress { get; set; }

        [JsonProperty("publisher_port")]
        public int PublisherPort { get; set; }

        [JsonProperty("transport_config")]
        public Dictionary<string, object> TransportConfig { get; set; }
    }

    /// <summary>
    /// Active streaming session
    /// </summary>
    [Serializable]
    public class StreamSession
    {
        [JsonProperty("session_id")]
        public string SessionId { get; set; }

        [JsonProperty("stream_id")]
        public string StreamId { get; set; }

        [JsonProperty("stream_name")]
        public string StreamName { get; set; }

        [JsonProperty("stream_type")]
        public string StreamType { get; set; }

        [JsonProperty("publisher_id")]
        public string PublisherId { get; set; }

        [JsonProperty("publisher_address")]
        public string PublisherAddress { get; set; }

        [JsonProperty("consumer_id")]
        public string ConsumerId { get; set; }

        [JsonProperty("consumer_address")]
        public string ConsumerAddress { get; set; }

        [JsonProperty("protocol")]
        public string Protocol { get; set; }

        [JsonProperty("transport_config")]
        public Dictionary<string, object> TransportConfig { get; set; }

        [JsonProperty("started_at")]
        public string StartedAt { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; }
    }
}
