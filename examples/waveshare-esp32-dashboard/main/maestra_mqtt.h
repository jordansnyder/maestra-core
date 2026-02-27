/**
 * Maestra MQTT client for ESP-IDF.
 *
 * Subscribes to Maestra entity state changes via MQTT and keeps a local
 * cache of entity state.  Designed for the dashboard UI to read from.
 */

#ifndef MAESTRA_MQTT_H
#define MAESTRA_MQTT_H

#include <stdint.h>
#include <stdbool.h>
#include "cJSON.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ── Limits ─────────────────────────────────────────────────────────────── */

#define MAESTRA_MAX_ENTITIES   4
#define MAESTRA_MAX_STATE_KEYS 8
#define MAESTRA_SLUG_LEN       32
#define MAESTRA_KEY_LEN        24
#define MAESTRA_VAL_LEN        32

/* ── Types ──────────────────────────────────────────────────────────────── */

/** Single key-value pair in an entity's state. */
typedef struct {
    char key[MAESTRA_KEY_LEN];
    char value[MAESTRA_VAL_LEN];
} maestra_state_kv_t;

/** Cached snapshot of one entity's state. */
typedef struct {
    char slug[MAESTRA_SLUG_LEN];
    maestra_state_kv_t kv[MAESTRA_MAX_STATE_KEYS];
    int  kv_count;
    bool has_data;       /**< true after the first state message arrives */
    int64_t last_update; /**< esp_timer_get_time() of last update (us)  */
} maestra_entity_t;

/** Activity log entry. */
typedef struct {
    char slug[MAESTRA_SLUG_LEN];
    char summary[48];
    int64_t timestamp;   /**< esp_timer_get_time() (us) */
} maestra_log_entry_t;

#define MAESTRA_LOG_MAX 16

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * Initialise the MQTT client and connect to the Maestra broker.
 *
 * @param broker_uri   e.g. "mqtt://192.168.1.100:1883"
 * @param slugs        Array of entity slugs to subscribe to.
 * @param slug_count   Number of slugs (max MAESTRA_MAX_ENTITIES).
 */
void maestra_mqtt_init(const char *broker_uri,
                       const char *slugs[],
                       int slug_count);

/** @return true when the MQTT transport is connected. */
bool maestra_mqtt_connected(void);

/** Get a read-only pointer to the entity cache (length = slug_count). */
const maestra_entity_t *maestra_get_entities(int *out_count);

/** Get the activity log (circular buffer, most recent first). */
const maestra_log_entry_t *maestra_get_log(int *out_count, int *out_head);

/**
 * Set the local IP address used when publishing stream consumer
 * registration messages.  Call before maestra_mqtt_init().
 */
void maestra_mqtt_set_local_ip(const char *ip);

/**
 * Set the local UDP port used for spectrum stream reception.
 * This is included in consumer registration messages so the publisher
 * knows where to send data.  Call before maestra_mqtt_init().
 */
void maestra_mqtt_set_stream_udp_port(uint16_t port);

#ifdef __cplusplus
}
#endif

#endif /* MAESTRA_MQTT_H */
