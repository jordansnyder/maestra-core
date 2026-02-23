using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using Newtonsoft.Json;

namespace Maestra
{
    /// <summary>
    /// Main client for connecting to the Maestra platform.
    /// Provides entity management and state synchronization.
    /// </summary>
    public class MaestraClient : MonoBehaviour
    {
        [Header("Connection Settings")]
        [Tooltip("Base URL for the Maestra Fleet Manager API")]
        public string apiUrl = "http://localhost:8080";

        [Header("Events")]
        public event Action OnConnected;
        public event Action<string> OnError;
        public event Action<MaestraEntity> OnEntityReceived;
        public event Action<List<EntityData>> OnEntitiesReceived;

        private Dictionary<string, MaestraEntity> _entityCache = new Dictionary<string, MaestraEntity>();
        private bool _isInitialized = false;

        /// <summary>
        /// Whether the client has been initialized
        /// </summary>
        public bool IsInitialized => _isInitialized;

        /// <summary>
        /// Initialize the client (call after setting apiUrl)
        /// </summary>
        public void Initialize()
        {
            _isInitialized = true;
            Debug.Log($"[Maestra] Client initialized with URL: {apiUrl}");
            OnConnected?.Invoke();
        }

        /// <summary>
        /// Get an entity by slug
        /// </summary>
        public void GetEntityBySlug(string slug, Action<MaestraEntity> callback = null)
        {
            StartCoroutine(FetchEntity(slug, callback));
        }

        /// <summary>
        /// Get all entities, optionally filtered by type
        /// </summary>
        public void GetEntities(string entityType = null, Action<List<EntityData>> callback = null)
        {
            StartCoroutine(FetchEntities(entityType, callback));
        }

        /// <summary>
        /// Get a cached entity by slug (returns null if not loaded)
        /// </summary>
        public MaestraEntity GetCachedEntity(string slug)
        {
            _entityCache.TryGetValue(slug, out var entity);
            return entity;
        }

        /// <summary>
        /// Update entity state (merge with existing)
        /// </summary>
        public void UpdateEntityState(string entityId, Dictionary<string, object> state, Action<StateResponse> callback = null)
        {
            StartCoroutine(SendStateUpdate(entityId, state, "PATCH", callback));
        }

        /// <summary>
        /// Replace entire entity state
        /// </summary>
        public void SetEntityState(string entityId, Dictionary<string, object> state, Action<StateResponse> callback = null)
        {
            StartCoroutine(SendStateUpdate(entityId, state, "PUT", callback));
        }

        private IEnumerator FetchEntity(string slug, Action<MaestraEntity> callback)
        {
            string url = $"{apiUrl}/entities/by-slug/{slug}";

            using (UnityWebRequest request = UnityWebRequest.Get(url))
            {
                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string error = $"Failed to get entity: {request.error}";
                    Debug.LogError($"[Maestra] {error}");
                    OnError?.Invoke(error);
                    yield break;
                }

                try
                {
                    EntityData data = JsonConvert.DeserializeObject<EntityData>(request.downloadHandler.text);

                    // Create or update entity in cache
                    if (!_entityCache.TryGetValue(slug, out var entity))
                    {
                        GameObject entityObj = new GameObject($"MaestraEntity_{slug}");
                        entityObj.transform.SetParent(transform);
                        entity = entityObj.AddComponent<MaestraEntity>();
                        _entityCache[slug] = entity;
                    }

                    entity.Initialize(data, this);

                    OnEntityReceived?.Invoke(entity);
                    callback?.Invoke(entity);
                }
                catch (Exception e)
                {
                    string error = $"Failed to parse entity: {e.Message}";
                    Debug.LogError($"[Maestra] {error}");
                    OnError?.Invoke(error);
                }
            }
        }

        private IEnumerator FetchEntities(string entityType, Action<List<EntityData>> callback)
        {
            string url = $"{apiUrl}/entities";
            if (!string.IsNullOrEmpty(entityType))
            {
                url += $"?type={entityType}";
            }

            using (UnityWebRequest request = UnityWebRequest.Get(url))
            {
                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string error = $"Failed to get entities: {request.error}";
                    Debug.LogError($"[Maestra] {error}");
                    OnError?.Invoke(error);
                    yield break;
                }

                try
                {
                    List<EntityData> entities = JsonConvert.DeserializeObject<List<EntityData>>(request.downloadHandler.text);
                    OnEntitiesReceived?.Invoke(entities);
                    callback?.Invoke(entities);
                }
                catch (Exception e)
                {
                    string error = $"Failed to parse entities: {e.Message}";
                    Debug.LogError($"[Maestra] {error}");
                    OnError?.Invoke(error);
                }
            }
        }

        private IEnumerator SendStateUpdate(string entityId, Dictionary<string, object> state, string method, Action<StateResponse> callback)
        {
            string url = $"{apiUrl}/entities/{entityId}/state";

            var requestBody = new StateUpdateRequest
            {
                State = state,
                Source = "unity"
            };

            string json = JsonConvert.SerializeObject(requestBody);
            byte[] bodyRaw = Encoding.UTF8.GetBytes(json);

            using (UnityWebRequest request = new UnityWebRequest(url, method))
            {
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");

                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string error = $"Failed to update state: {request.error}";
                    Debug.LogError($"[Maestra] {error}");
                    OnError?.Invoke(error);
                    yield break;
                }

                try
                {
                    StateResponse response = JsonConvert.DeserializeObject<StateResponse>(request.downloadHandler.text);

                    // Update cached entity if exists
                    if (_entityCache.TryGetValue(response.Slug, out var entity))
                    {
                        entity.UpdateStateFromResponse(response);
                    }

                    callback?.Invoke(response);
                }
                catch (Exception e)
                {
                    string error = $"Failed to parse state response: {e.Message}";
                    Debug.LogError($"[Maestra] {error}");
                    OnError?.Invoke(error);
                }
            }
        }

        /// <summary>
        /// Internal method for entities to send state updates
        /// </summary>
        internal void SendEntityStateUpdate(string entityId, Dictionary<string, object> state, bool replace, Action<StateResponse> callback)
        {
            if (replace)
            {
                SetEntityState(entityId, state, callback);
            }
            else
            {
                UpdateEntityState(entityId, state, callback);
            }
        }

        // ===== Stream Events =====

        public event Action<List<StreamInfo>> OnStreamsReceived;
        public event Action<StreamInfo> OnStreamAdvertised;
        public event Action<StreamOffer> OnStreamOfferReceived;
        public event Action<List<StreamSession>> OnSessionsReceived;

        // ===== Stream Methods =====

        /// <summary>
        /// List active streams, optionally filtered by type
        /// </summary>
        public void GetStreams(string streamType = null, Action<List<StreamInfo>> callback = null)
        {
            StartCoroutine(FetchStreams(streamType, callback));
        }

        /// <summary>
        /// Advertise a new stream
        /// </summary>
        public void AdvertiseStream(StreamAdvertiseRequest request, Action<StreamInfo> callback = null)
        {
            StartCoroutine(SendAdvertiseStream(request, callback));
        }

        /// <summary>
        /// Withdraw a stream from the registry
        /// </summary>
        public void WithdrawStream(string streamId, Action callback = null)
        {
            StartCoroutine(SendWithdrawStream(streamId, callback));
        }

        /// <summary>
        /// Send stream heartbeat to refresh TTL
        /// </summary>
        public void StreamHeartbeat(string streamId, Action callback = null)
        {
            StartCoroutine(SendStreamHeartbeat(streamId, callback));
        }

        /// <summary>
        /// Request to consume a stream
        /// </summary>
        public void RequestStream(string streamId, StreamRequestBody request, Action<StreamOffer> callback = null)
        {
            StartCoroutine(SendStreamRequest(streamId, request, callback));
        }

        /// <summary>
        /// List active sessions
        /// </summary>
        public void GetSessions(string streamId = null, Action<List<StreamSession>> callback = null)
        {
            StartCoroutine(FetchSessions(streamId, callback));
        }

        /// <summary>
        /// Stop an active session
        /// </summary>
        public void StopSession(string sessionId, Action callback = null)
        {
            StartCoroutine(SendStopSession(sessionId, callback));
        }

        /// <summary>
        /// Send session heartbeat to refresh TTL
        /// </summary>
        public void SessionHeartbeat(string sessionId, Action callback = null)
        {
            StartCoroutine(SendSessionHeartbeat(sessionId, callback));
        }

        // ===== Stream Coroutines =====

        private IEnumerator FetchStreams(string streamType, Action<List<StreamInfo>> callback)
        {
            string url = $"{apiUrl}/streams";
            if (!string.IsNullOrEmpty(streamType))
                url += $"?stream_type={streamType}";

            using (UnityWebRequest request = UnityWebRequest.Get(url))
            {
                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string error = $"Failed to get streams: {request.error}";
                    Debug.LogError($"[Maestra] {error}");
                    OnError?.Invoke(error);
                    yield break;
                }

                try
                {
                    List<StreamInfo> streams = JsonConvert.DeserializeObject<List<StreamInfo>>(request.downloadHandler.text);
                    OnStreamsReceived?.Invoke(streams);
                    callback?.Invoke(streams);
                }
                catch (Exception e)
                {
                    string error = $"Failed to parse streams: {e.Message}";
                    Debug.LogError($"[Maestra] {error}");
                    OnError?.Invoke(error);
                }
            }
        }

        private IEnumerator SendAdvertiseStream(StreamAdvertiseRequest advertise, Action<StreamInfo> callback)
        {
            string url = $"{apiUrl}/streams/advertise";
            string json = JsonConvert.SerializeObject(advertise);
            byte[] bodyRaw = Encoding.UTF8.GetBytes(json);

            using (UnityWebRequest request = new UnityWebRequest(url, "POST"))
            {
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");

                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string error = $"Failed to advertise stream: {request.error}";
                    Debug.LogError($"[Maestra] {error}");
                    OnError?.Invoke(error);
                    yield break;
                }

                try
                {
                    StreamInfo stream = JsonConvert.DeserializeObject<StreamInfo>(request.downloadHandler.text);
                    OnStreamAdvertised?.Invoke(stream);
                    callback?.Invoke(stream);
                }
                catch (Exception e)
                {
                    string error = $"Failed to parse stream: {e.Message}";
                    Debug.LogError($"[Maestra] {error}");
                    OnError?.Invoke(error);
                }
            }
        }

        private IEnumerator SendWithdrawStream(string streamId, Action callback)
        {
            string url = $"{apiUrl}/streams/{streamId}";

            using (UnityWebRequest request = UnityWebRequest.Delete(url))
            {
                request.downloadHandler = new DownloadHandlerBuffer();
                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string error = $"Failed to withdraw stream: {request.error}";
                    Debug.LogError($"[Maestra] {error}");
                    OnError?.Invoke(error);
                    yield break;
                }

                callback?.Invoke();
            }
        }

        private IEnumerator SendStreamHeartbeat(string streamId, Action callback)
        {
            string url = $"{apiUrl}/streams/{streamId}/heartbeat";

            using (UnityWebRequest request = new UnityWebRequest(url, "POST"))
            {
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes("{}"));
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");

                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string error = $"Stream heartbeat failed: {request.error}";
                    Debug.LogWarning($"[Maestra] {error}");
                    yield break;
                }

                callback?.Invoke();
            }
        }

        private IEnumerator SendStreamRequest(string streamId, StreamRequestBody requestBody, Action<StreamOffer> callback)
        {
            string url = $"{apiUrl}/streams/{streamId}/request";
            string json = JsonConvert.SerializeObject(requestBody);
            byte[] bodyRaw = Encoding.UTF8.GetBytes(json);

            using (UnityWebRequest request = new UnityWebRequest(url, "POST"))
            {
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");

                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string error = $"Failed to request stream: {request.error}";
                    Debug.LogError($"[Maestra] {error}");
                    OnError?.Invoke(error);
                    yield break;
                }

                try
                {
                    StreamOffer offer = JsonConvert.DeserializeObject<StreamOffer>(request.downloadHandler.text);
                    OnStreamOfferReceived?.Invoke(offer);
                    callback?.Invoke(offer);
                }
                catch (Exception e)
                {
                    string error = $"Failed to parse stream offer: {e.Message}";
                    Debug.LogError($"[Maestra] {error}");
                    OnError?.Invoke(error);
                }
            }
        }

        private IEnumerator FetchSessions(string streamId, Action<List<StreamSession>> callback)
        {
            string url = $"{apiUrl}/streams/sessions";
            if (!string.IsNullOrEmpty(streamId))
                url += $"?stream_id={streamId}";

            using (UnityWebRequest request = UnityWebRequest.Get(url))
            {
                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string error = $"Failed to get sessions: {request.error}";
                    Debug.LogError($"[Maestra] {error}");
                    OnError?.Invoke(error);
                    yield break;
                }

                try
                {
                    List<StreamSession> sessions = JsonConvert.DeserializeObject<List<StreamSession>>(request.downloadHandler.text);
                    OnSessionsReceived?.Invoke(sessions);
                    callback?.Invoke(sessions);
                }
                catch (Exception e)
                {
                    string error = $"Failed to parse sessions: {e.Message}";
                    Debug.LogError($"[Maestra] {error}");
                    OnError?.Invoke(error);
                }
            }
        }

        private IEnumerator SendStopSession(string sessionId, Action callback)
        {
            string url = $"{apiUrl}/streams/sessions/{sessionId}";

            using (UnityWebRequest request = UnityWebRequest.Delete(url))
            {
                request.downloadHandler = new DownloadHandlerBuffer();
                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string error = $"Failed to stop session: {request.error}";
                    Debug.LogError($"[Maestra] {error}");
                    OnError?.Invoke(error);
                    yield break;
                }

                callback?.Invoke();
            }
        }

        private IEnumerator SendSessionHeartbeat(string sessionId, Action callback)
        {
            string url = $"{apiUrl}/streams/sessions/{sessionId}/heartbeat";

            using (UnityWebRequest request = new UnityWebRequest(url, "POST"))
            {
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes("{}"));
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");

                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string error = $"Session heartbeat failed: {request.error}";
                    Debug.LogWarning($"[Maestra] {error}");
                    yield break;
                }

                callback?.Invoke();
            }
        }
    }
}
