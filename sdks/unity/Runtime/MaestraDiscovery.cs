using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using Newtonsoft.Json;

namespace Maestra
{
    // =========================================================================
    // Data Classes
    // =========================================================================

    /// <summary>
    /// Connection configuration returned by the Maestra Fleet Manager.
    /// Contains all endpoints needed to connect to the platform.
    /// </summary>
    [Serializable]
    public class MaestraConnectionConfig
    {
        [JsonProperty("api_url")]
        public string ApiUrl { get; set; }

        [JsonProperty("nats_url")]
        public string NatsUrl { get; set; }

        [JsonProperty("mqtt_broker")]
        public string MqttBroker { get; set; }

        [JsonProperty("mqtt_port")]
        public int MqttPort { get; set; }

        [JsonProperty("ws_url")]
        public string WsUrl { get; set; }
    }

    /// <summary>
    /// Device registration response from POST /devices/discover.
    /// </summary>
    [Serializable]
    public class DeviceRegistration
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("device_type")]
        public string DeviceType { get; set; }

        [JsonProperty("hardware_id")]
        public string HardwareId { get; set; }

        [JsonProperty("firmware_version")]
        public string FirmwareVersion { get; set; }

        [JsonProperty("ip_address")]
        public string IpAddress { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; }

        [JsonProperty("metadata")]
        public Dictionary<string, object> Metadata { get; set; }

        [JsonProperty("created_at")]
        public string CreatedAt { get; set; }

        [JsonProperty("updated_at")]
        public string UpdatedAt { get; set; }
    }

    /// <summary>
    /// Provisioning configuration returned after device approval.
    /// Contains connection details and optional entity binding.
    /// </summary>
    [Serializable]
    public class ProvisionConfig
    {
        [JsonProperty("device_id")]
        public string DeviceId { get; set; }

        [JsonProperty("provision_status")]
        public string ProvisionStatus { get; set; }

        [JsonProperty("api_url")]
        public string ApiUrl { get; set; }

        [JsonProperty("nats_url")]
        public string NatsUrl { get; set; }

        [JsonProperty("mqtt_broker")]
        public string MqttBroker { get; set; }

        [JsonProperty("mqtt_port")]
        public int MqttPort { get; set; }

        [JsonProperty("ws_url")]
        public string WsUrl { get; set; }

        [JsonProperty("entity_id")]
        public string EntityId { get; set; }

        [JsonProperty("env_vars")]
        public Dictionary<string, object> EnvVars { get; set; }

        /// <summary>
        /// Convert provision config to MaestraConnectionConfig
        /// </summary>
        public MaestraConnectionConfig ToConnectionConfig()
        {
            return new MaestraConnectionConfig
            {
                ApiUrl = ApiUrl,
                NatsUrl = NatsUrl,
                MqttBroker = MqttBroker,
                MqttPort = MqttPort,
                WsUrl = WsUrl,
            };
        }
    }

    // =========================================================================
    // Discovery Helper
    // =========================================================================

    /// <summary>
    /// Static helper class for Maestra device discovery and provisioning.
    /// Provides coroutine-based methods for advertising devices, polling
    /// for provisioning approval, and fetching connection configuration.
    /// </summary>
    public static class MaestraDiscovery
    {
        /// <summary>
        /// Fetch the Maestra connection configuration from a known API URL.
        /// Polls the health endpoint to confirm the server is reachable,
        /// then returns a connection config built from the API URL.
        /// </summary>
        /// <param name="apiUrl">Base URL of the Fleet Manager API (e.g., http://192.168.1.10:8080)</param>
        /// <param name="timeout">Maximum time in seconds to wait for a response</param>
        /// <param name="onSuccess">Called with the connection config on success</param>
        /// <param name="onError">Called with an error message on failure</param>
        public static IEnumerator DiscoverMaestra(
            string apiUrl,
            float timeout,
            Action<MaestraConnectionConfig> onSuccess,
            Action<string> onError)
        {
            string url = $"{apiUrl.TrimEnd('/')}/health";
            float elapsed = 0f;
            float pollInterval = 1f;

            while (elapsed < timeout)
            {
                using (UnityWebRequest request = UnityWebRequest.Get(url))
                {
                    request.timeout = Mathf.CeilToInt(Mathf.Min(5f, timeout - elapsed));
                    yield return request.SendWebRequest();

                    if (request.result == UnityWebRequest.Result.Success)
                    {
                        // Server is reachable — build connection config from the API URL
                        var uri = new System.Uri(apiUrl.TrimEnd('/'));
                        string host = uri.Host;

                        var config = new MaestraConnectionConfig
                        {
                            ApiUrl = apiUrl.TrimEnd('/'),
                            NatsUrl = $"nats://{host}:4222",
                            MqttBroker = host,
                            MqttPort = 1883,
                            WsUrl = $"ws://{host}:8765",
                        };

                        Debug.Log($"[Maestra] Discovered server at {apiUrl}");
                        onSuccess?.Invoke(config);
                        yield break;
                    }
                }

                elapsed += pollInterval;
                if (elapsed < timeout)
                {
                    yield return new WaitForSeconds(pollInterval);
                    elapsed += pollInterval;
                }
            }

            string error = $"Timed out discovering Maestra server at {apiUrl} after {timeout}s";
            Debug.LogError($"[Maestra] {error}");
            onError?.Invoke(error);
        }

        /// <summary>
        /// Advertise this device to the Maestra Fleet Manager via POST /devices/discover.
        /// The device will be registered as "pending" until approved by an admin.
        /// </summary>
        /// <param name="apiUrl">Base URL of the Fleet Manager API</param>
        /// <param name="hardwareId">Unique hardware identifier for this device</param>
        /// <param name="deviceType">Device type string (e.g., "unity", "unreal", "arduino")</param>
        /// <param name="name">Human-readable display name for the device</param>
        /// <param name="onSuccess">Called with the device registration on success</param>
        /// <param name="onError">Called with an error message on failure</param>
        public static IEnumerator AdvertiseDevice(
            string apiUrl,
            string hardwareId,
            string deviceType,
            string name,
            Action<DeviceRegistration> onSuccess,
            Action<string> onError)
        {
            string url = $"{apiUrl.TrimEnd('/')}/devices/discover";

            var body = new Dictionary<string, object>
            {
                { "hardware_id", hardwareId },
                { "device_type", deviceType },
                { "name", name },
                { "metadata", new Dictionary<string, object>
                    {
                        { "platform", Application.platform.ToString() },
                        { "unity_version", Application.unityVersion },
                    }
                },
            };

            string json = JsonConvert.SerializeObject(body);
            byte[] bodyRaw = Encoding.UTF8.GetBytes(json);

            using (UnityWebRequest request = new UnityWebRequest(url, "POST"))
            {
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");

                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string error = $"Failed to advertise device: {request.error} (HTTP {request.responseCode})";
                    Debug.LogError($"[Maestra] {error}");
                    onError?.Invoke(error);
                    yield break;
                }

                try
                {
                    DeviceRegistration registration = JsonConvert.DeserializeObject<DeviceRegistration>(
                        request.downloadHandler.text);
                    Debug.Log($"[Maestra] Device advertised: {registration.Id} (status: {registration.Status})");
                    onSuccess?.Invoke(registration);
                }
                catch (Exception e)
                {
                    string error = $"Failed to parse device registration: {e.Message}";
                    Debug.LogError($"[Maestra] {error}");
                    onError?.Invoke(error);
                }
            }
        }

        /// <summary>
        /// Poll GET /devices/{deviceId}/provision until the device is approved and
        /// provisioning config is available. Returns a 403 while still pending.
        /// </summary>
        /// <param name="apiUrl">Base URL of the Fleet Manager API</param>
        /// <param name="deviceId">Device UUID returned from AdvertiseDevice</param>
        /// <param name="pollInterval">Seconds between polling attempts</param>
        /// <param name="timeout">Maximum total time in seconds to wait for provisioning</param>
        /// <param name="onSuccess">Called with the provision config once approved</param>
        /// <param name="onError">Called with an error message on timeout or unrecoverable failure</param>
        public static IEnumerator WaitForProvisioning(
            string apiUrl,
            string deviceId,
            float pollInterval,
            float timeout,
            Action<ProvisionConfig> onSuccess,
            Action<string> onError)
        {
            string url = $"{apiUrl.TrimEnd('/')}/devices/{deviceId}/provision";
            float elapsed = 0f;

            Debug.Log($"[Maestra] Waiting for provisioning approval (device: {deviceId})...");

            while (elapsed < timeout)
            {
                using (UnityWebRequest request = UnityWebRequest.Get(url))
                {
                    request.timeout = Mathf.CeilToInt(Mathf.Min(10f, timeout - elapsed));
                    yield return request.SendWebRequest();

                    if (request.result == UnityWebRequest.Result.Success)
                    {
                        try
                        {
                            ProvisionConfig config = JsonConvert.DeserializeObject<ProvisionConfig>(
                                request.downloadHandler.text);
                            Debug.Log($"[Maestra] Device provisioned (status: {config.ProvisionStatus})");
                            onSuccess?.Invoke(config);
                            yield break;
                        }
                        catch (Exception e)
                        {
                            string error = $"Failed to parse provision config: {e.Message}";
                            Debug.LogError($"[Maestra] {error}");
                            onError?.Invoke(error);
                            yield break;
                        }
                    }

                    // 403 means device is still pending — keep polling
                    if (request.responseCode == 403)
                    {
                        // Still pending, continue polling
                    }
                    else if (request.responseCode == 404)
                    {
                        string error = "No provisioning record found. Device may have been rejected.";
                        Debug.LogError($"[Maestra] {error}");
                        onError?.Invoke(error);
                        yield break;
                    }
                    else if (request.result != UnityWebRequest.Result.Success)
                    {
                        // Network error or unexpected status — log but keep trying
                        Debug.LogWarning($"[Maestra] Provision poll error: {request.error} (HTTP {request.responseCode})");
                    }
                }

                yield return new WaitForSeconds(pollInterval);
                elapsed += pollInterval;
            }

            string timeoutError = $"Provisioning timed out after {timeout}s (device: {deviceId})";
            Debug.LogError($"[Maestra] {timeoutError}");
            onError?.Invoke(timeoutError);
        }
    }
}
