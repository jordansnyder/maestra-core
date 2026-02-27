/**
 * Spectrum stream receiver — SDRF binary UDP packets.
 *
 * A FreeRTOS task binds a UDP socket and continuously receives SDRF
 * packets sent by the RTL-SDR (or any compatible publisher).  The latest
 * spectrum is stored in a mutex-protected buffer for the UI to read.
 */

#include "spectrum_stream.h"

#include <string.h>
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "lwip/sockets.h"

static const char *TAG = "spectrum_stream";

/* ── State ──────────────────────────────────────────────────────────────── */

static spectrum_data_t        s_data;
static spectrum_stream_info_t s_info;
static SemaphoreHandle_t      s_mutex;
static uint16_t               s_udp_port;

/* Staleness threshold: 5 seconds in microseconds */
#define STALE_THRESHOLD_US  (5 * 1000 * 1000)

/* ── SDRF parser ────────────────────────────────────────────────────────── */

/**
 * Parse an SDRF binary packet into the spectrum data buffer.
 *
 * Packet layout (little-endian):
 *   [0:4]   uint32  magic       0x53445246
 *   [4:8]   uint32  seq
 *   [8:16]  float64 center_freq
 *   [16:24] float64 sample_rate
 *   [24:32] float64 reserved
 *   [32:36] uint32  fft_size
 *   [36:]   float32[] power_db
 *
 * @return true if the packet was valid and stored.
 */
static bool parse_sdrf_packet(const uint8_t *buf, int len)
{
    if (len < SDRF_HEADER_SIZE) return false;

    uint32_t magic;
    memcpy(&magic, buf + 0, 4);
    if (magic != SDRF_MAGIC) return false;

    uint32_t seq, fft_size;
    double center_freq, sample_rate;

    memcpy(&seq,         buf + 4,  4);
    memcpy(&center_freq, buf + 8,  8);
    memcpy(&sample_rate, buf + 16, 8);
    /* skip reserved at 24 */
    memcpy(&fft_size,    buf + 32, 4);

    if (fft_size == 0 || fft_size > SPECTRUM_MAX_BINS) return false;

    int expected_len = SDRF_HEADER_SIZE + (int)(fft_size * sizeof(float));
    if (len < expected_len) return false;

    xSemaphoreTake(s_mutex, portMAX_DELAY);

    s_data.center_freq = center_freq;
    s_data.sample_rate = sample_rate;
    s_data.fft_size    = fft_size;
    s_data.seq         = seq;
    s_data.timestamp   = esp_timer_get_time();
    s_data.valid       = true;
    memcpy(s_data.power_db, buf + SDRF_HEADER_SIZE, fft_size * sizeof(float));

    xSemaphoreGive(s_mutex);

    return true;
}

/* ── UDP listener task ──────────────────────────────────────────────────── */

#define UDP_BUF_SIZE  (SDRF_HEADER_SIZE + SPECTRUM_MAX_BINS * sizeof(float))

static void spectrum_udp_task(void *arg)
{
    (void)arg;

    int sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (sock < 0) {
        ESP_LOGE(TAG, "Failed to create UDP socket: errno %d", errno);
        vTaskDelete(NULL);
        return;
    }

    struct sockaddr_in addr = {
        .sin_family      = AF_INET,
        .sin_port        = htons(s_udp_port),
        .sin_addr.s_addr = htonl(INADDR_ANY),
    };

    if (bind(sock, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        ESP_LOGE(TAG, "UDP bind to port %u failed: errno %d", s_udp_port, errno);
        close(sock);
        vTaskDelete(NULL);
        return;
    }

    ESP_LOGI(TAG, "Listening for SDRF packets on UDP port %u", s_udp_port);

    /* Static buffer — lives for the lifetime of the task */
    static uint8_t rx_buf[UDP_BUF_SIZE];

    bool first_packet = true;

    while (1) {
        struct sockaddr_in src_addr;
        socklen_t src_len = sizeof(src_addr);

        int n = recvfrom(sock, rx_buf, sizeof(rx_buf), 0,
                         (struct sockaddr *)&src_addr, &src_len);
        if (n < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) continue;
            ESP_LOGW(TAG, "recvfrom error: errno %d", errno);
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }

        if (first_packet) {
            char addr_str[INET_ADDRSTRLEN];
            inet_ntoa_r(src_addr.sin_addr, addr_str, sizeof(addr_str));
            ESP_LOGI(TAG, "First UDP packet received: %d bytes from %s:%d",
                     n, addr_str, ntohs(src_addr.sin_port));
            first_packet = false;
        }

        if (parse_sdrf_packet(rx_buf, n)) {
            if (s_data.seq % 100 == 1) {
                ESP_LOGI(TAG, "SDRF seq=%lu fft=%lu cf=%.1fMHz",
                         (unsigned long)s_data.seq,
                         (unsigned long)s_data.fft_size,
                         s_data.center_freq / 1e6);
            }
        } else {
            /* Log why parsing failed for the first few bad packets */
            uint32_t magic = 0;
            if (n >= 4) memcpy(&magic, rx_buf, 4);
            ESP_LOGW(TAG, "SDRF parse failed: %d bytes, magic=0x%08lX "
                     "(expected 0x%08X, hdr=%d)",
                     n, (unsigned long)magic, SDRF_MAGIC, SDRF_HEADER_SIZE);
        }
    }

    /* Unreachable, but tidy */
    close(sock);
    vTaskDelete(NULL);
}

/* ── Public API ─────────────────────────────────────────────────────────── */

void spectrum_stream_init(uint16_t udp_port)
{
    s_mutex   = xSemaphoreCreateMutex();
    s_udp_port = udp_port;
    memset(&s_data, 0, sizeof(s_data));
    memset(&s_info, 0, sizeof(s_info));

    xTaskCreate(spectrum_udp_task, "spectrum_udp", 6144, NULL, 5, NULL);
    ESP_LOGI(TAG, "Spectrum stream receiver initialised (port %u)", udp_port);
}

const spectrum_data_t *spectrum_get_data(void)
{
    return &s_data;
}

spectrum_stream_info_t *spectrum_get_info(void)
{
    return &s_info;
}

void spectrum_set_info(const spectrum_stream_info_t *info)
{
    xSemaphoreTake(s_mutex, portMAX_DELAY);
    memcpy(&s_info, info, sizeof(s_info));
    xSemaphoreGive(s_mutex);
}

bool spectrum_is_receiving(void)
{
    if (!s_data.valid) return false;
    int64_t age = esp_timer_get_time() - s_data.timestamp;
    return age < STALE_THRESHOLD_US;
}
