/**
 * Spectrum stream receiver for Maestra SDRF binary UDP packets.
 *
 * Listens for real-time FFT power spectrum data from an RTL-SDR (or any
 * publisher using the SDRF binary format) and makes it available to the
 * dashboard UI.  Stream metadata is populated via MQTT advertisement
 * parsing in maestra_mqtt.c.
 */

#ifndef SPECTRUM_STREAM_H
#define SPECTRUM_STREAM_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ── Limits ─────────────────────────────────────────────────────────────── */

#define SPECTRUM_MAX_BINS   1024
#define SPECTRUM_ID_LEN     48
#define SPECTRUM_NAME_LEN   64
#define SPECTRUM_ADDR_LEN   46   /* fits IPv4 and IPv6 */

/* ── SDRF packet constants ──────────────────────────────────────────────── */

#define SDRF_MAGIC          0x53445246  /* "SDRF" little-endian */
#define SDRF_HEADER_SIZE    36          /* bytes before the float32 array */

/* ── Types ──────────────────────────────────────────────────────────────── */

/** Latest parsed spectrum snapshot. */
typedef struct {
    double   center_freq;               /**< Hz */
    double   sample_rate;               /**< Hz */
    uint32_t fft_size;                  /**< Number of bins (<=1024) */
    float    power_db[SPECTRUM_MAX_BINS]; /**< dBFS per bin */
    uint32_t seq;                       /**< Packet sequence number */
    int64_t  timestamp;                 /**< esp_timer_get_time() when received */
    bool     valid;                     /**< true after first good packet */
} spectrum_data_t;

/** Discovered stream metadata (populated from MQTT advertisement). */
typedef struct {
    char     stream_id[SPECTRUM_ID_LEN];
    char     name[SPECTRUM_NAME_LEN];
    char     publisher_address[SPECTRUM_ADDR_LEN];
    uint16_t publisher_port;
    double   center_freq_hz;
    double   sample_rate_hz;
    uint32_t fft_size;
    bool     discovered;                /**< true after advert received */
} spectrum_stream_info_t;

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * Start the UDP listener task.
 *
 * @param udp_port  Local UDP port to bind (e.g. 9900).
 */
void spectrum_stream_init(uint16_t udp_port);

/**
 * Get a read-only pointer to the latest spectrum data.
 * The caller must NOT hold the pointer across yield points; copy what you
 * need while the LVGL display lock is held.
 */
const spectrum_data_t *spectrum_get_data(void);

/**
 * Get a pointer to the discovered stream info.
 */
spectrum_stream_info_t *spectrum_get_info(void);

/**
 * Update the stream info from an MQTT advertisement.
 * Called by maestra_mqtt.c when a stream advertisement arrives.
 */
void spectrum_set_info(const spectrum_stream_info_t *info);

/**
 * @return true if a valid SDRF packet was received within the last 5 s.
 */
bool spectrum_is_receiving(void);

#ifdef __cplusplus
}
#endif

#endif /* SPECTRUM_STREAM_H */
