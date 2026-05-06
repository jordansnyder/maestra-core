using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using Newtonsoft.Json;

namespace Maestra
{
    /// <summary>
    /// Show phase enum matching Maestra show control phases
    /// </summary>
    public enum ShowPhase
    {
        Idle,
        PreShow,
        Active,
        Paused,
        PostShow,
        Shutdown,
        Unknown
    }

    /// <summary>
    /// Show state response from the API
    /// </summary>
    [Serializable]
    public class ShowState
    {
        [JsonProperty("phase")]
        public string Phase { get; set; }

        [JsonProperty("previous_phase")]
        public string PreviousPhase { get; set; }

        [JsonProperty("transition_time")]
        public string TransitionTime { get; set; }

        [JsonProperty("source")]
        public string Source { get; set; }

        [JsonProperty("context")]
        public object Context { get; set; }
    }

    /// <summary>
    /// Manages show control state and transitions for the Maestra platform.
    /// Attach to a GameObject alongside MaestraClient for show lifecycle management.
    /// </summary>
    public class MaestraShowControl : MonoBehaviour
    {
        [Header("References")]
        [Tooltip("MaestraClient to use for API URL. Auto-finds on this GameObject if not set.")]
        public MaestraClient client;

        [Header("Polling")]
        [Tooltip("Poll interval in seconds for show state updates (0 = disabled)")]
        public float pollInterval = 0f;

        [Header("Events")]
        public event Action<ShowState> OnShowStateReceived;
        public event Action<ShowPhase, ShowPhase> OnShowPhaseChanged;
        public event Action<string> OnShowError;

        private ShowPhase _currentPhase = ShowPhase.Unknown;
        private ShowState _lastState;
        private Coroutine _pollCoroutine;

        /// <summary>
        /// Current show phase
        /// </summary>
        public ShowPhase CurrentPhase => _currentPhase;

        /// <summary>
        /// Last received show state
        /// </summary>
        public ShowState LastState => _lastState;

        /// <summary>
        /// API base URL (from attached MaestraClient)
        /// </summary>
        private string ApiUrl => client != null ? client.apiUrl : "http://localhost:8080";

        private void Start()
        {
            if (client == null)
            {
                client = GetComponent<MaestraClient>();
            }

            if (pollInterval > 0f)
            {
                StartPolling();
            }
        }

        private void OnDestroy()
        {
            StopPolling();
        }

        // ===== Polling =====

        /// <summary>
        /// Start polling for show state changes
        /// </summary>
        public void StartPolling()
        {
            StopPolling();
            _pollCoroutine = StartCoroutine(PollShowState());
        }

        /// <summary>
        /// Stop polling for show state changes
        /// </summary>
        public void StopPolling()
        {
            if (_pollCoroutine != null)
            {
                StopCoroutine(_pollCoroutine);
                _pollCoroutine = null;
            }
        }

        private IEnumerator PollShowState()
        {
            while (true)
            {
                yield return FetchShowStateCoroutine(null);
                yield return new WaitForSeconds(pollInterval > 0f ? pollInterval : 2f);
            }
        }

        // ===== Show State =====

        /// <summary>
        /// Get the current show state from the API
        /// </summary>
        public void GetShowState(Action<ShowState> callback = null)
        {
            StartCoroutine(FetchShowStateCoroutine(callback));
        }

        private IEnumerator FetchShowStateCoroutine(Action<ShowState> callback)
        {
            string url = $"{ApiUrl}/show/state";

            using (UnityWebRequest request = UnityWebRequest.Get(url))
            {
                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string error = $"Failed to get show state: {request.error}";
                    Debug.LogError($"[Maestra] {error}");
                    OnShowError?.Invoke(error);
                    yield break;
                }

                try
                {
                    ShowState state = JsonConvert.DeserializeObject<ShowState>(request.downloadHandler.text);
                    ProcessShowState(state);
                    OnShowStateReceived?.Invoke(state);
                    callback?.Invoke(state);
                }
                catch (Exception e)
                {
                    string error = $"Failed to parse show state: {e.Message}";
                    Debug.LogError($"[Maestra] {error}");
                    OnShowError?.Invoke(error);
                }
            }
        }

        private void ProcessShowState(ShowState state)
        {
            _lastState = state;
            ShowPhase newPhase = ParsePhase(state.Phase);

            if (newPhase != _currentPhase)
            {
                ShowPhase previousPhase = _currentPhase;
                _currentPhase = newPhase;
                Debug.Log($"[Maestra] Show phase changed: {previousPhase} -> {_currentPhase}");
                OnShowPhaseChanged?.Invoke(_currentPhase, previousPhase);
            }
        }

        // ===== Show Commands =====

        /// <summary>
        /// Transition to warmup / pre-show phase
        /// </summary>
        public void Warmup(Action<ShowState> callback = null)
        {
            StartCoroutine(SendShowCommand("/show/warmup", callback));
        }

        /// <summary>
        /// Start the show (transition to active phase)
        /// </summary>
        public void Go(Action<ShowState> callback = null)
        {
            StartCoroutine(SendShowCommand("/show/go", callback));
        }

        /// <summary>
        /// Pause the show
        /// </summary>
        public void Pause(Action<ShowState> callback = null)
        {
            StartCoroutine(SendShowCommand("/show/pause", callback));
        }

        /// <summary>
        /// Resume the show from paused state
        /// </summary>
        public void Resume(Action<ShowState> callback = null)
        {
            StartCoroutine(SendShowCommand("/show/resume", callback));
        }

        /// <summary>
        /// Stop the show (transition to post-show phase)
        /// </summary>
        public void Stop(Action<ShowState> callback = null)
        {
            StartCoroutine(SendShowCommand("/show/stop", callback));
        }

        /// <summary>
        /// Shutdown the show
        /// </summary>
        public void Shutdown(Action<ShowState> callback = null)
        {
            StartCoroutine(SendShowCommand("/show/shutdown", callback));
        }

        /// <summary>
        /// Reset the show back to idle
        /// </summary>
        public void Reset(Action<ShowState> callback = null)
        {
            StartCoroutine(SendShowCommand("/show/reset", callback));
        }

        /// <summary>
        /// Transition to an arbitrary phase
        /// </summary>
        /// <param name="toPhase">Target phase name (idle, pre_show, active, paused, post_show, shutdown)</param>
        /// <param name="source">Optional source identifier</param>
        public void Transition(string toPhase, string source = "unity", Action<ShowState> callback = null)
        {
            StartCoroutine(SendTransitionCommand(toPhase, source, callback));
        }

        private IEnumerator SendShowCommand(string endpoint, Action<ShowState> callback)
        {
            string url = $"{ApiUrl}{endpoint}";

            using (UnityWebRequest request = new UnityWebRequest(url, "POST"))
            {
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes("{}"));
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");

                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string error = $"Show command failed ({endpoint}): {request.error}";
                    Debug.LogError($"[Maestra] {error}");
                    OnShowError?.Invoke(error);
                    yield break;
                }

                try
                {
                    ShowState state = JsonConvert.DeserializeObject<ShowState>(request.downloadHandler.text);
                    ProcessShowState(state);
                    OnShowStateReceived?.Invoke(state);
                    callback?.Invoke(state);
                }
                catch (Exception e)
                {
                    string error = $"Failed to parse show command response: {e.Message}";
                    Debug.LogError($"[Maestra] {error}");
                    OnShowError?.Invoke(error);
                }
            }
        }

        private IEnumerator SendTransitionCommand(string toPhase, string source, Action<ShowState> callback)
        {
            string url = $"{ApiUrl}/show/transition";

            var body = new { to = toPhase, source = source };
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
                    string error = $"Show transition failed: {request.error}";
                    Debug.LogError($"[Maestra] {error}");
                    OnShowError?.Invoke(error);
                    yield break;
                }

                try
                {
                    ShowState state = JsonConvert.DeserializeObject<ShowState>(request.downloadHandler.text);
                    ProcessShowState(state);
                    OnShowStateReceived?.Invoke(state);
                    callback?.Invoke(state);
                }
                catch (Exception e)
                {
                    string error = $"Failed to parse transition response: {e.Message}";
                    Debug.LogError($"[Maestra] {error}");
                    OnShowError?.Invoke(error);
                }
            }
        }

        // ===== Helpers =====

        /// <summary>
        /// Parse a phase string from the API into the ShowPhase enum
        /// </summary>
        public static ShowPhase ParsePhase(string phase)
        {
            if (string.IsNullOrEmpty(phase)) return ShowPhase.Unknown;

            switch (phase.ToLowerInvariant())
            {
                case "idle": return ShowPhase.Idle;
                case "pre_show": return ShowPhase.PreShow;
                case "active": return ShowPhase.Active;
                case "paused": return ShowPhase.Paused;
                case "post_show": return ShowPhase.PostShow;
                case "shutdown": return ShowPhase.Shutdown;
                default: return ShowPhase.Unknown;
            }
        }
    }
}
