/**
 * Maestra Dashboard — Waveshare ESP32-P4-WIFI6-Touch-LCD-3.4C
 *
 * Connects to WiFi (via the onboard ESP32-C6 coprocessor), subscribes to
 * Maestra entity state over MQTT, and renders three swipeable dashboard
 * views on the 800×800 round MIPI-DSI touch display using LVGL v9.
 *
 * Build with ESP-IDF v5.5+:
 *   idf.py set-target esp32p4
 *   idf.py menuconfig   (set WiFi SSID/password, MQTT broker, entity slugs)
 *   idf.py build flash monitor
 */

#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "nvs_flash.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_timer.h"
#include "lvgl.h"

/* Waveshare BSP — handles MIPI-DSI display + GT911 touch init */
#include "bsp/esp-bsp.h"
#include "bsp/display.h"

#include "maestra_mqtt.h"
#include "dashboard_ui.h"
#include "spectrum_stream.h"

static const char *TAG = "maestra_dash";

/* ── WiFi configuration (set via menuconfig) ─────────────────────────────── */

#define WIFI_SSID          CONFIG_MAESTRA_WIFI_SSID
#define WIFI_PASSWORD      CONFIG_MAESTRA_WIFI_PASSWORD
#define WIFI_MAX_RETRY     CONFIG_MAESTRA_WIFI_MAX_RETRY

/* ── MQTT / entity configuration (set via menuconfig) ────────────────────── */

#define MQTT_BROKER_URI    CONFIG_MAESTRA_MQTT_BROKER_URI
#define STREAM_UDP_PORT    CONFIG_MAESTRA_STREAM_UDP_PORT

/* Entity slugs — up to 4 */
static const char *entity_slugs[] = {
    CONFIG_MAESTRA_ENTITY_SLUG_1,
#ifdef CONFIG_MAESTRA_ENTITY_SLUG_2
    CONFIG_MAESTRA_ENTITY_SLUG_2,
#endif
#ifdef CONFIG_MAESTRA_ENTITY_SLUG_3
    CONFIG_MAESTRA_ENTITY_SLUG_3,
#endif
#ifdef CONFIG_MAESTRA_ENTITY_SLUG_4
    CONFIG_MAESTRA_ENTITY_SLUG_4,
#endif
};
#define ENTITY_COUNT  (sizeof(entity_slugs) / sizeof(entity_slugs[0]))

/* ── WiFi ────────────────────────────────────────────────────────────────── */

static EventGroupHandle_t s_wifi_events;
#define WIFI_CONNECTED_BIT  BIT0
#define WIFI_FAIL_BIT       BIT1
static int s_retry_num = 0;

static void wifi_event_handler(void *arg, esp_event_base_t base,
                               int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        if (s_retry_num < WIFI_MAX_RETRY) {
            esp_wifi_connect();
            s_retry_num++;
            ESP_LOGI(TAG, "WiFi retry %d/%d", s_retry_num, WIFI_MAX_RETRY);
        } else {
            xEventGroupSetBits(s_wifi_events, WIFI_FAIL_BIT);
        }
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)data;
        ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&event->ip_info.ip));
        s_retry_num = 0;
        xEventGroupSetBits(s_wifi_events, WIFI_CONNECTED_BIT);
    }
}

static bool wifi_init_sta(void)
{
    s_wifi_events = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, NULL));

    wifi_config_t wifi_cfg = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASSWORD,
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
        },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG, "WiFi STA started, waiting for connection...");

    EventBits_t bits = xEventGroupWaitBits(s_wifi_events,
        WIFI_CONNECTED_BIT | WIFI_FAIL_BIT, pdFALSE, pdFALSE,
        pdMS_TO_TICKS(15000));

    if (bits & WIFI_CONNECTED_BIT) {
        ESP_LOGI(TAG, "WiFi connected");
        return true;
    }
    ESP_LOGW(TAG, "WiFi connection failed — dashboard will show offline");
    return false;
}

/* ── LVGL refresh timer callback ─────────────────────────────────────────── */

static void ui_refresh_cb(lv_timer_t *timer)
{
    (void)timer;
    dashboard_ui_refresh();
}

/* ── Main ────────────────────────────────────────────────────────────────── */

void app_main(void)
{
    /* NVS (required by WiFi) */
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES ||
        ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    /* ── Display + touch via Waveshare BSP ────────────────────────────── */
    bsp_display_cfg_t disp_cfg = {
        .lv_adapter_cfg = ESP_LV_ADAPTER_DEFAULT_CONFIG(),
        .rotation = ESP_LV_ADAPTER_ROTATE_0,
        .tear_avoid_mode = ESP_LV_ADAPTER_TEAR_AVOID_MODE_TRIPLE_PARTIAL,
        .touch_flags = {
            .swap_xy  = 0,
            .mirror_x = 0,
            .mirror_y = 0,
        },
    };
    bsp_display_start_with_config(&disp_cfg);
    bsp_display_backlight_on();
    ESP_LOGI(TAG, "Display ready (800x800 MIPI-DSI)");

    /* ── Build the LVGL UI ────────────────────────────────────────────── */
    bsp_display_lock(-1);
    dashboard_ui_create();
    bsp_display_unlock();

    /* ── WiFi (via ESP32-C6 coprocessor over SDIO) ────────────────────── */
    wifi_init_sta();

    /* ── Spectrum stream receiver ─────────────────────────────────────── */
    spectrum_stream_init(STREAM_UDP_PORT);

    /* Pass local IP + stream port to MQTT module for consumer registration */
    {
        esp_netif_t *netif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
        esp_netif_ip_info_t ip_info;
        if (netif && esp_netif_get_ip_info(netif, &ip_info) == ESP_OK) {
            char ip_str[16];
            snprintf(ip_str, sizeof(ip_str), IPSTR, IP2STR(&ip_info.ip));
            maestra_mqtt_set_local_ip(ip_str);
        }
        maestra_mqtt_set_stream_udp_port(STREAM_UDP_PORT);
    }

    /* ── Maestra MQTT ─────────────────────────────────────────────────── */
    maestra_mqtt_init(MQTT_BROKER_URI, entity_slugs, ENTITY_COUNT);

    /* ── Periodic UI refresh (every 2 s) ──────────────────────────────── */
    bsp_display_lock(-1);
    lv_timer_create(ui_refresh_cb, 2000, NULL);
    bsp_display_unlock();

    ESP_LOGI(TAG, "Maestra dashboard running");

    /* The LVGL adapter task handles rendering; we just idle. */
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
