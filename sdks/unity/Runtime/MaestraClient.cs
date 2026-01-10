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
    }
}
