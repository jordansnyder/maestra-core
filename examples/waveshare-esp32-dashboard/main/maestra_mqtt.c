/**
 * Maestra MQTT client — ESP-IDF implementation.
 *
 * Connects to the Mosquitto broker in the Maestra stack and subscribes
 * to entity state-change events.  Incoming JSON envelopes are parsed
 * and cached so the LVGL UI can read them without blocking.
 */

#include "maestra_mqtt.h"
#include "spectrum_stream.h"

#include <string.h>
#include "esp_log.h"
#include "esp_timer.h"
#include "mqtt_client.h"
#include "cJSON.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

static const char *TAG = "maestra_mqtt";

/* ── State ──────────────────────────────────────────────────────────────── */

static esp_mqtt_client_handle_t s_client = NULL;
static bool s_connected = false;

static maestra_entity_t   s_entities[MAESTRA_MAX_ENTITIES];
static int                s_entity_count = 0;
static const char        *s_slugs[MAESTRA_MAX_ENTITIES];
static int                s_slug_count = 0;

static maestra_log_entry_t s_log[MAESTRA_LOG_MAX];
static int                 s_log_head  = 0;
static int                 s_log_count = 0;

static SemaphoreHandle_t s_mutex;

/* Stream consumer registration state */
static char     s_local_ip[46]  = "";
static uint16_t s_stream_port   = 0;

/* ── Helpers ────────────────────────────────────────────────────────────── */

static void log_activity(const char *slug, const char *summary)
{
    maestra_log_entry_t *e = &s_log[s_log_head];
    snprintf(e->slug, sizeof(e->slug), "%s", slug);
    snprintf(e->summary, sizeof(e->summary), "%s", summary);
    e->timestamp = esp_timer_get_time();
    s_log_head = (s_log_head + 1) % MAESTRA_LOG_MAX;
    if (s_log_count < MAESTRA_LOG_MAX) {
        s_log_count++;
    }
}

/**
 * Extract a display-friendly value string from a cJSON node.
 */
static void json_value_to_str(cJSON *item, char *buf, size_t len)
{
    if (cJSON_IsBool(item)) {
        snprintf(buf, len, "%s", cJSON_IsTrue(item) ? "true" : "false");
    } else if (cJSON_IsNumber(item)) {
        double v = item->valuedouble;
        /* Use integer format when there's no fractional part */
        if (v == (int)v && v >= -99999 && v <= 99999) {
            snprintf(buf, len, "%d", (int)v);
        } else {
            snprintf(buf, len, "%.2f", v);
        }
    } else if (cJSON_IsString(item)) {
        snprintf(buf, len, "%s", item->valuestring);
    } else {
        snprintf(buf, len, "...");
    }
}

/* ── MQTT message handler ───────────────────────────────────────────────── */

/**
 * Parse an incoming Maestra state-change envelope and update the cache.
 *
 * Expected topic:  maestra/entity/state/<type>/<slug>
 * Expected payload (JSON):
 *   { "type": "state_changed",
 *     "entity_slug": "...",
 *     "current_state": { ... },
 *     "changed_keys": ["k1", "k2"] }
 */
static void handle_state_message(const char *topic, int topic_len,
                                 const char *data,  int data_len)
{
    /* Extract slug from topic: 5th segment (0-indexed = 4) */
    char topic_buf[128];
    int copy_len = topic_len < (int)sizeof(topic_buf) - 1 ? topic_len : (int)sizeof(topic_buf) - 1;
    memcpy(topic_buf, topic, copy_len);
    topic_buf[copy_len] = '\0';

    /* Walk to the 5th slash-separated token */
    const char *slug = NULL;
    char *saveptr = NULL;
    char *tok = strtok_r(topic_buf, "/", &saveptr);
    for (int i = 0; tok != NULL && i < 4; i++) {
        tok = strtok_r(NULL, "/", &saveptr);
    }
    slug = tok;
    if (!slug) return;

    /* Find matching entity */
    xSemaphoreTake(s_mutex, portMAX_DELAY);

    maestra_entity_t *ent = NULL;
    for (int i = 0; i < s_entity_count; i++) {
        if (strcmp(s_entities[i].slug, slug) == 0) {
            ent = &s_entities[i];
            break;
        }
    }
    if (!ent) {
        xSemaphoreGive(s_mutex);
        return;
    }

    /* Parse JSON */
    cJSON *root = cJSON_ParseWithLength(data, data_len);
    if (!root) {
        xSemaphoreGive(s_mutex);
        return;
    }

    cJSON *current_state = cJSON_GetObjectItem(root, "current_state");
    if (!current_state) {
        cJSON_Delete(root);
        xSemaphoreGive(s_mutex);
        return;
    }

    /* Merge key-value pairs into entity cache */
    cJSON *item = NULL;
    cJSON_ArrayForEach(item, current_state) {
        if (!item->string) continue;

        /* Skip internal keys */
        if (strcmp(item->string, "device_id") == 0 ||
            strcmp(item->string, "hardware_id") == 0) {
            continue;
        }

        /* Find existing key or add new */
        int found = -1;
        for (int k = 0; k < ent->kv_count; k++) {
            if (strcmp(ent->kv[k].key, item->string) == 0) {
                found = k;
                break;
            }
        }

        int idx = found >= 0 ? found : ent->kv_count;
        if (idx >= MAESTRA_MAX_STATE_KEYS) continue;

        snprintf(ent->kv[idx].key, MAESTRA_KEY_LEN, "%s", item->string);
        json_value_to_str(item, ent->kv[idx].value, MAESTRA_VAL_LEN);

        if (found < 0) ent->kv_count++;
    }

    ent->has_data = true;
    ent->last_update = esp_timer_get_time();

    /* Build summary for activity log from changed_keys */
    char summary[48] = "";
    cJSON *changed = cJSON_GetObjectItem(root, "changed_keys");
    if (changed && cJSON_IsArray(changed)) {
        int written = 0;
        cJSON *key_item = NULL;
        cJSON_ArrayForEach(key_item, changed) {
            if (!cJSON_IsString(key_item)) continue;
            int n = snprintf(summary + written, sizeof(summary) - written,
                             "%s%s", written > 0 ? ", " : "", key_item->valuestring);
            if (n < 0 || written + n >= (int)sizeof(summary) - 1) break;
            written += n;
        }
    }
    log_activity(slug, summary);

    cJSON_Delete(root);
    xSemaphoreGive(s_mutex);

    ESP_LOGD(TAG, "State update: %s", slug);
}

/* ── Stream advertisement handler ──────────────────────────────────────── */

/**
 * Parse an MQTT stream advertisement and update spectrum_stream_info.
 *
 * Expected topic:  maestra/stream/advertise/sensor
 * Expected payload (JSON):
 *   { "id": "...", "name": "...", "stream_type": "sensor",
 *     "address": "...", "port": 9900,
 *     "config": { "fft_size": 1024, "center_frequency_hz": 1e8,
 *                 "sample_rate_hz": 2.048e6 } }
 */
static void handle_stream_advertise(const char *data, int data_len)
{
    cJSON *root = cJSON_ParseWithLength(data, data_len);
    if (!root) return;

    spectrum_stream_info_t info;
    memset(&info, 0, sizeof(info));

    cJSON *jid   = cJSON_GetObjectItem(root, "id");
    cJSON *jname = cJSON_GetObjectItem(root, "name");
    cJSON *jaddr = cJSON_GetObjectItem(root, "address");
    cJSON *jport = cJSON_GetObjectItem(root, "port");

    if (!cJSON_IsString(jid) || !cJSON_IsString(jaddr)) {
        cJSON_Delete(root);
        return;
    }

    snprintf(info.stream_id, sizeof(info.stream_id), "%s",
             jid->valuestring);
    if (cJSON_IsString(jname)) {
        snprintf(info.name, sizeof(info.name), "%s", jname->valuestring);
    }
    snprintf(info.publisher_address, sizeof(info.publisher_address), "%s",
             jaddr->valuestring);
    info.publisher_port = cJSON_IsNumber(jport) ? (uint16_t)jport->valuedouble : 0;

    /* Extract stream config */
    cJSON *cfg = cJSON_GetObjectItem(root, "config");
    if (cfg) {
        cJSON *jfft  = cJSON_GetObjectItem(cfg, "fft_size");
        cJSON *jcf   = cJSON_GetObjectItem(cfg, "center_frequency_hz");
        cJSON *jsr   = cJSON_GetObjectItem(cfg, "sample_rate_hz");
        if (cJSON_IsNumber(jfft)) info.fft_size       = (uint32_t)jfft->valuedouble;
        if (cJSON_IsNumber(jcf))  info.center_freq_hz = jcf->valuedouble;
        if (cJSON_IsNumber(jsr))  info.sample_rate_hz = jsr->valuedouble;
    }

    info.discovered = true;
    spectrum_set_info(&info);

    ESP_LOGI(TAG, "Stream discovered: %s (%s:%u)",
             info.name, info.publisher_address, info.publisher_port);

    /* Publish consumer registration so the publisher sends us data */
    if (s_local_ip[0] != '\0' && s_stream_port > 0 && s_client) {
        char reg_topic[128];
        snprintf(reg_topic, sizeof(reg_topic),
                 "maestra/stream/%s/subscribe", info.stream_id);

        char reg_payload[128];
        snprintf(reg_payload, sizeof(reg_payload),
                 "{\"address\":\"%s\",\"port\":%u}",
                 s_local_ip, s_stream_port);

        esp_mqtt_client_publish(s_client, reg_topic, reg_payload,
                                strlen(reg_payload), 1, 0);
        ESP_LOGI(TAG, "Consumer registered: %s → %s:%u",
                 info.stream_id, s_local_ip, s_stream_port);
    }

    cJSON_Delete(root);
}

/* ── MQTT event handler ─────────────────────────────────────────────────── */

static void mqtt_event_handler(void *arg, esp_event_base_t base,
                               int32_t event_id, void *event_data)
{
    esp_mqtt_event_handle_t event = event_data;

    switch ((esp_mqtt_event_id_t)event_id) {
    case MQTT_EVENT_CONNECTED:
        ESP_LOGI(TAG, "MQTT connected");
        s_connected = true;

        /* Subscribe to all configured entity slugs */
        for (int i = 0; i < s_slug_count; i++) {
            char topic[128];
            snprintf(topic, sizeof(topic), "maestra/entity/state/+/%s", s_slugs[i]);
            esp_mqtt_client_subscribe(s_client, topic, 1);
            ESP_LOGI(TAG, "Subscribed: %s", topic);
        }

        /* Subscribe to sensor stream advertisements */
        esp_mqtt_client_subscribe(s_client, "maestra/stream/advertise/sensor", 1);
        ESP_LOGI(TAG, "Subscribed: maestra/stream/advertise/sensor");
        break;

    case MQTT_EVENT_DISCONNECTED:
        ESP_LOGW(TAG, "MQTT disconnected");
        s_connected = false;
        break;

    case MQTT_EVENT_DATA:
        /* Route based on topic prefix */
        if (event->topic_len > 30 &&
            memcmp(event->topic, "maestra/stream/advertise/", 25) == 0) {
            handle_stream_advertise(event->data, event->data_len);
        } else {
            handle_state_message(event->topic, event->topic_len,
                                 event->data, event->data_len);
        }
        break;

    case MQTT_EVENT_ERROR:
        ESP_LOGE(TAG, "MQTT error");
        break;

    default:
        break;
    }
}

/* ── Public API ─────────────────────────────────────────────────────────── */

void maestra_mqtt_init(const char *broker_uri,
                       const char *slugs[],
                       int slug_count)
{
    s_mutex = xSemaphoreCreateMutex();

    s_slug_count = slug_count > MAESTRA_MAX_ENTITIES ? MAESTRA_MAX_ENTITIES : slug_count;
    s_entity_count = s_slug_count;

    for (int i = 0; i < s_slug_count; i++) {
        s_slugs[i] = slugs[i];
        memset(&s_entities[i], 0, sizeof(maestra_entity_t));
        snprintf(s_entities[i].slug, MAESTRA_SLUG_LEN, "%s", slugs[i]);
    }

    esp_mqtt_client_config_t cfg = {
        .broker.address.uri = broker_uri,
        .network.reconnect_timeout_ms = 5000,
        .buffer.size = 2048,
    };

    s_client = esp_mqtt_client_init(&cfg);
    esp_mqtt_client_register_event(s_client, ESP_EVENT_ANY_ID,
                                   mqtt_event_handler, NULL);
    esp_mqtt_client_start(s_client);
    ESP_LOGI(TAG, "MQTT client started → %s", broker_uri);
}

bool maestra_mqtt_connected(void)
{
    return s_connected;
}

const maestra_entity_t *maestra_get_entities(int *out_count)
{
    if (out_count) *out_count = s_entity_count;
    return s_entities;
}

const maestra_log_entry_t *maestra_get_log(int *out_count, int *out_head)
{
    if (out_count) *out_count = s_log_count;
    if (out_head)  *out_head  = s_log_head;
    return s_log;
}

void maestra_mqtt_set_local_ip(const char *ip)
{
    if (ip) {
        snprintf(s_local_ip, sizeof(s_local_ip), "%s", ip);
    }
}

void maestra_mqtt_set_stream_udp_port(uint16_t port)
{
    s_stream_port = port;
}
