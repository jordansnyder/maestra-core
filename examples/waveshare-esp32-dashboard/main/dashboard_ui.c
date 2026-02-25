/**
 * LVGL v9 dashboard UI for the Waveshare ESP32-P4 3.4" round display.
 *
 * Uses an lv_tileview for the three swipeable pages, laid out inside a
 * circular background that matches the physical round bezel.
 */

#include "dashboard_ui.h"
#include "maestra_mqtt.h"

#include <stdio.h>
#include <string.h>
#include "esp_timer.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "esp_log.h"

static const char *TAG = "dashboard_ui";

/* ── Colours (LVGL uses 0xRRGGBB in v9) ────────────────────────────────── */

#define COL_BG          lv_color_hex(0x18191C)
#define COL_CARD        lv_color_hex(0x23252B)
#define COL_TEXT        lv_color_hex(0xE6E6E6)
#define COL_TEXT_DIM    lv_color_hex(0x7C7E83)
#define COL_ACCENT      lv_color_hex(0x00BFFF)
#define COL_GREEN       lv_color_hex(0x2ECC71)
#define COL_RED         lv_color_hex(0xE74C3C)
#define COL_YELLOW      lv_color_hex(0xF1C40F)

/* ── Layout (800 × 800 round) ──────────────────────────────────────────── */

#define DISP_W  800
#define DISP_H  800

/* ── Persistent LVGL objects we update on refresh ───────────────────────── */

/* Overview */
static lv_obj_t *lbl_wifi_val;
static lv_obj_t *lbl_mqtt_val;
static lv_obj_t *led_wifi;
static lv_obj_t *led_mqtt;
static lv_obj_t *lbl_entities_val;
static lv_obj_t *lbl_uptime_val;
static lv_obj_t *lbl_heap_val;
static lv_obj_t *lbl_activity_count;

/* Entities */
static lv_obj_t *entity_cards[MAESTRA_MAX_ENTITIES];
static lv_obj_t *entity_slug_labels[MAESTRA_MAX_ENTITIES];
static lv_obj_t *entity_kv_labels[MAESTRA_MAX_ENTITIES]; /* multiline label */

/* Activity */
static lv_obj_t *activity_list;

/* Nav indicators */
static lv_obj_t *nav_dots[3];
static lv_obj_t *tileview;

/* Boot timestamp */
static int64_t s_boot_us;

/* ── Styling helpers ────────────────────────────────────────────────────── */

static lv_style_t style_bg;
static lv_style_t style_card;
static lv_style_t style_title;
static bool styles_ready = false;

static void init_styles(void)
{
    if (styles_ready) return;
    styles_ready = true;

    lv_style_init(&style_bg);
    lv_style_set_bg_color(&style_bg, COL_BG);
    lv_style_set_bg_opa(&style_bg, LV_OPA_COVER);
    lv_style_set_radius(&style_bg, 0);
    lv_style_set_border_width(&style_bg, 0);
    lv_style_set_pad_all(&style_bg, 0);

    lv_style_init(&style_card);
    lv_style_set_bg_color(&style_card, COL_CARD);
    lv_style_set_bg_opa(&style_card, LV_OPA_COVER);
    lv_style_set_radius(&style_card, 16);
    lv_style_set_pad_all(&style_card, 16);
    lv_style_set_border_width(&style_card, 0);

    lv_style_init(&style_title);
    lv_style_set_text_color(&style_title, COL_ACCENT);
    lv_style_set_text_font(&style_title, &lv_font_montserrat_22);
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

static lv_obj_t *make_label(lv_obj_t *parent, const lv_font_t *font,
                            lv_color_t color, const char *text)
{
    lv_obj_t *lbl = lv_label_create(parent);
    lv_obj_set_style_text_font(lbl, font, 0);
    lv_obj_set_style_text_color(lbl, color, 0);
    lv_label_set_text(lbl, text);
    return lbl;
}

static void format_uptime(char *buf, size_t len, int64_t boot_us)
{
    int64_t elapsed_s = (esp_timer_get_time() - boot_us) / 1000000;
    int h = (int)(elapsed_s / 3600);
    int m = (int)((elapsed_s % 3600) / 60);
    int s = (int)(elapsed_s % 60);
    if (h > 0) {
        snprintf(buf, len, "%dh %dm", h, m);
    } else if (m > 0) {
        snprintf(buf, len, "%dm %ds", m, s);
    } else {
        snprintf(buf, len, "%ds", s);
    }
}

static void format_time_ago(char *buf, size_t len, int64_t ts_us)
{
    int64_t ago_s = (esp_timer_get_time() - ts_us) / 1000000;
    if (ago_s < 60) {
        snprintf(buf, len, "%ds ago", (int)ago_s);
    } else if (ago_s < 3600) {
        snprintf(buf, len, "%dm ago", (int)(ago_s / 60));
    } else {
        snprintf(buf, len, "%dh ago", (int)(ago_s / 3600));
    }
}

/* ── Overview page ──────────────────────────────────────────────────────── */

static void create_overview_row(lv_obj_t *parent, const char *label_text,
                                lv_obj_t **out_led, lv_obj_t **out_val)
{
    lv_obj_t *row = lv_obj_create(parent);
    lv_obj_set_size(row, lv_pct(100), LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(row, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(row, 0, 0);
    lv_obj_set_style_pad_ver(row, 6, 0);
    lv_obj_set_style_pad_hor(row, 0, 0);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(row, LV_FLEX_ALIGN_SPACE_BETWEEN,
                          LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    /* Left: label + optional LED */
    lv_obj_t *left = lv_obj_create(row);
    lv_obj_set_size(left, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(left, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(left, 0, 0);
    lv_obj_set_style_pad_all(left, 0, 0);
    lv_obj_set_flex_flow(left, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_flex_gap(left, 8, 0);

    if (out_led) {
        lv_obj_t *led = lv_led_create(left);
        lv_led_set_color(led, COL_TEXT_DIM);
        lv_obj_set_size(led, 14, 14);
        lv_led_off(led);
        *out_led = led;
    }
    make_label(left, &lv_font_montserrat_20, COL_TEXT_DIM, label_text);

    /* Right: value */
    lv_obj_t *val = make_label(row, &lv_font_montserrat_20, COL_TEXT, "--");
    *out_val = val;
}

static void create_overview(lv_obj_t *page)
{
    /* Title */
    lv_obj_t *title = make_label(page, &lv_font_montserrat_26, COL_ACCENT, "OVERVIEW");
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 60);

    /* Card container */
    lv_obj_t *card = lv_obj_create(page);
    lv_obj_add_style(card, &style_card, 0);
    lv_obj_set_size(card, 560, 380);
    lv_obj_align(card, LV_ALIGN_CENTER, 0, 20);
    lv_obj_set_flex_flow(card, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_flex_gap(card, 4, 0);

    create_overview_row(card, "WiFi",       &led_wifi, &lbl_wifi_val);
    create_overview_row(card, "MQTT",       &led_mqtt, &lbl_mqtt_val);
    create_overview_row(card, "Entities",   NULL,      &lbl_entities_val);
    create_overview_row(card, "Uptime",     NULL,      &lbl_uptime_val);
    create_overview_row(card, "Free RAM",   NULL,      &lbl_heap_val);
    create_overview_row(card, "Activity",   NULL,      &lbl_activity_count);
}

/* ── Entities page ──────────────────────────────────────────────────────── */

static void create_entity_card(lv_obj_t *parent, int idx, int x, int y)
{
    lv_obj_t *card = lv_obj_create(parent);
    lv_obj_add_style(card, &style_card, 0);
    lv_obj_set_size(card, 260, 240);
    lv_obj_set_pos(card, x, y);
    lv_obj_set_flex_flow(card, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_flex_gap(card, 4, 0);
    entity_cards[idx] = card;

    entity_slug_labels[idx] = make_label(card, &lv_font_montserrat_18,
                                         COL_ACCENT, "...");

    /* Separator line */
    lv_obj_t *line = lv_obj_create(card);
    lv_obj_set_size(line, lv_pct(100), 1);
    lv_obj_set_style_bg_color(line, COL_TEXT_DIM, 0);
    lv_obj_set_style_bg_opa(line, LV_OPA_40, 0);
    lv_obj_set_style_border_width(line, 0, 0);
    lv_obj_set_style_pad_all(line, 0, 0);

    entity_kv_labels[idx] = make_label(card, &lv_font_montserrat_16,
                                       COL_TEXT, "awaiting data");
}

static void create_entities(lv_obj_t *page)
{
    lv_obj_t *title = make_label(page, &lv_font_montserrat_26, COL_ACCENT, "ENTITIES");
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 60);

    /* 2×2 card grid, centered */
    int start_x = (DISP_W - 260 * 2 - 20) / 2;
    int start_y = 120;
    int gap = 20;

    create_entity_card(page, 0, start_x,               start_y);
    create_entity_card(page, 1, start_x + 260 + gap,   start_y);
    create_entity_card(page, 2, start_x,               start_y + 240 + gap);
    create_entity_card(page, 3, start_x + 260 + gap,   start_y + 240 + gap);
}

/* ── Activity page ──────────────────────────────────────────────────────── */

static void create_activity(lv_obj_t *page)
{
    lv_obj_t *title = make_label(page, &lv_font_montserrat_26, COL_ACCENT, "ACTIVITY");
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 60);

    activity_list = lv_obj_create(page);
    lv_obj_add_style(activity_list, &style_card, 0);
    lv_obj_set_size(activity_list, 600, 500);
    lv_obj_align(activity_list, LV_ALIGN_CENTER, 0, 30);
    lv_obj_set_flex_flow(activity_list, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_flex_gap(activity_list, 2, 0);
    lv_obj_set_style_pad_all(activity_list, 12, 0);
}

/* ── Navigation dots ────────────────────────────────────────────────────── */

static void update_nav_dots(int active)
{
    for (int i = 0; i < 3; i++) {
        lv_obj_set_style_bg_color(nav_dots[i],
            i == active ? COL_ACCENT : COL_TEXT_DIM, 0);
        lv_obj_set_size(nav_dots[i], i == active ? 14 : 10,
                                     i == active ? 14 : 10);
    }
}

static void on_tile_changed(lv_event_t *e)
{
    lv_obj_t *tv = lv_event_get_target(e);
    lv_obj_t *tile = lv_tileview_get_tile_active(tv);
    int col = lv_obj_get_x(tile) / DISP_W;
    update_nav_dots(col);
}

static void create_nav_dots(lv_obj_t *parent)
{
    lv_obj_t *cont = lv_obj_create(parent);
    lv_obj_set_size(cont, 80, 20);
    lv_obj_set_style_bg_opa(cont, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(cont, 0, 0);
    lv_obj_set_style_pad_all(cont, 0, 0);
    lv_obj_align(cont, LV_ALIGN_BOTTOM_MID, 0, -50);
    lv_obj_set_flex_flow(cont, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(cont, LV_FLEX_ALIGN_CENTER,
                          LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_flex_gap(cont, 12, 0);

    for (int i = 0; i < 3; i++) {
        nav_dots[i] = lv_obj_create(cont);
        lv_obj_set_size(nav_dots[i], 10, 10);
        lv_obj_set_style_radius(nav_dots[i], LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_bg_color(nav_dots[i], COL_TEXT_DIM, 0);
        lv_obj_set_style_bg_opa(nav_dots[i], LV_OPA_COVER, 0);
        lv_obj_set_style_border_width(nav_dots[i], 0, 0);
    }
    update_nav_dots(0);
}

/* ── Public: create ─────────────────────────────────────────────────────── */

void dashboard_ui_create(void)
{
    s_boot_us = esp_timer_get_time();
    init_styles();

    /* Root screen */
    lv_obj_t *scr = lv_screen_active();
    lv_obj_add_style(scr, &style_bg, 0);

    /* Tileview for horizontal swipe between 3 pages */
    tileview = lv_tileview_create(scr);
    lv_obj_set_size(tileview, DISP_W, DISP_H);
    lv_obj_set_style_bg_color(tileview, COL_BG, 0);
    lv_obj_set_style_bg_opa(tileview, LV_OPA_COVER, 0);
    lv_obj_add_event_cb(tileview, on_tile_changed, LV_EVENT_VALUE_CHANGED, NULL);

    lv_obj_t *t0 = lv_tileview_add_tile(tileview, 0, 0, LV_DIR_RIGHT);
    lv_obj_t *t1 = lv_tileview_add_tile(tileview, 1, 0, LV_DIR_LEFT | LV_DIR_RIGHT);
    lv_obj_t *t2 = lv_tileview_add_tile(tileview, 2, 0, LV_DIR_LEFT);

    create_overview(t0);
    create_entities(t1);
    create_activity(t2);

    /* Nav dots overlay on top of tileview */
    create_nav_dots(scr);

    ESP_LOGI(TAG, "Dashboard UI created");
}

/* ── Public: refresh ────────────────────────────────────────────────────── */

void dashboard_ui_refresh(void)
{
    char buf[64];

    /* ── Overview ──────────────────────────────────────────────────────── */

    /* WiFi */
    wifi_ap_record_t ap;
    esp_err_t err = esp_wifi_sta_get_ap_info(&ap);
    if (err == ESP_OK) {
        esp_netif_t *netif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
        esp_netif_ip_info_t ip_info;
        if (netif && esp_netif_get_ip_info(netif, &ip_info) == ESP_OK) {
            snprintf(buf, sizeof(buf), IPSTR " (%d dBm)",
                     IP2STR(&ip_info.ip), ap.rssi);
        } else {
            snprintf(buf, sizeof(buf), "Connected (%d dBm)", ap.rssi);
        }
        lv_label_set_text(lbl_wifi_val, buf);
        lv_obj_set_style_text_color(lbl_wifi_val, COL_GREEN, 0);
        lv_led_set_color(led_wifi, COL_GREEN);
        lv_led_on(led_wifi);
    } else {
        lv_label_set_text(lbl_wifi_val, "Disconnected");
        lv_obj_set_style_text_color(lbl_wifi_val, COL_RED, 0);
        lv_led_set_color(led_wifi, COL_RED);
        lv_led_on(led_wifi);
    }

    /* MQTT */
    bool mqtt_ok = maestra_mqtt_connected();
    lv_label_set_text(lbl_mqtt_val, mqtt_ok ? "Connected" : "Disconnected");
    lv_obj_set_style_text_color(lbl_mqtt_val, mqtt_ok ? COL_GREEN : COL_RED, 0);
    lv_led_set_color(led_mqtt, mqtt_ok ? COL_GREEN : COL_RED);
    lv_led_on(led_mqtt);

    /* Entities */
    int ent_count = 0;
    maestra_get_entities(&ent_count);
    snprintf(buf, sizeof(buf), "%d", ent_count);
    lv_label_set_text(lbl_entities_val, buf);
    lv_obj_set_style_text_color(lbl_entities_val, COL_ACCENT, 0);

    /* Uptime */
    format_uptime(buf, sizeof(buf), s_boot_us);
    lv_label_set_text(lbl_uptime_val, buf);

    /* Free heap */
    uint32_t free_heap = esp_get_free_heap_size();
    snprintf(buf, sizeof(buf), "%lu KB", (unsigned long)(free_heap / 1024));
    lv_label_set_text(lbl_heap_val, buf);
    lv_obj_set_style_text_color(lbl_heap_val,
        free_heap < 100000 ? COL_YELLOW : COL_TEXT, 0);

    /* Activity count */
    int log_count = 0;
    maestra_get_log(&log_count, NULL);
    snprintf(buf, sizeof(buf), "%d events", log_count);
    lv_label_set_text(lbl_activity_count, buf);

    /* ── Entities ──────────────────────────────────────────────────────── */

    const maestra_entity_t *ents = maestra_get_entities(&ent_count);
    for (int i = 0; i < MAESTRA_MAX_ENTITIES; i++) {
        if (i >= ent_count) {
            lv_label_set_text(entity_slug_labels[i], "--");
            lv_label_set_text(entity_kv_labels[i], "");
            continue;
        }

        const maestra_entity_t *e = &ents[i];
        lv_label_set_text(entity_slug_labels[i], e->slug);

        if (!e->has_data) {
            lv_label_set_text(entity_kv_labels[i], "awaiting data");
            lv_obj_set_style_text_color(entity_kv_labels[i], COL_TEXT_DIM, 0);
            continue;
        }

        /* Build a multiline string of key = value pairs */
        char content[256] = "";
        int written = 0;
        int max_rows = 6;
        for (int k = 0; k < e->kv_count && k < max_rows; k++) {
            int n = snprintf(content + written, sizeof(content) - written,
                             "%s  %s\n", e->kv[k].key, e->kv[k].value);
            if (n < 0 || written + n >= (int)sizeof(content) - 1) break;
            written += n;
        }
        /* Trim trailing newline */
        if (written > 0 && content[written - 1] == '\n') {
            content[written - 1] = '\0';
        }

        lv_label_set_text(entity_kv_labels[i], content);
        lv_obj_set_style_text_color(entity_kv_labels[i], COL_TEXT, 0);
    }

    /* ── Activity ──────────────────────────────────────────────────────── */

    int head = 0;
    const maestra_log_entry_t *log = maestra_get_log(&log_count, &head);

    /* Rebuild the list on each refresh (simple approach for now) */
    lv_obj_clean(activity_list);

    if (log_count == 0) {
        lv_obj_t *lbl = make_label(activity_list, &lv_font_montserrat_18,
                                   COL_TEXT_DIM, "No activity yet");
        lv_obj_set_width(lbl, lv_pct(100));
        lv_obj_set_style_text_align(lbl, LV_TEXT_ALIGN_CENTER, 0);
        return;
    }

    int max_visible = 12;
    for (int i = 0; i < log_count && i < max_visible; i++) {
        int idx = (head - 1 - i + MAESTRA_LOG_MAX) % MAESTRA_LOG_MAX;
        const maestra_log_entry_t *entry = &log[idx];

        lv_obj_t *row = lv_obj_create(activity_list);
        lv_obj_set_size(row, lv_pct(100), LV_SIZE_CONTENT);
        lv_obj_set_style_bg_color(row, i % 2 == 0 ? COL_BG : COL_CARD, 0);
        lv_obj_set_style_bg_opa(row, LV_OPA_COVER, 0);
        lv_obj_set_style_border_width(row, 0, 0);
        lv_obj_set_style_pad_ver(row, 6, 0);
        lv_obj_set_style_pad_hor(row, 4, 0);
        lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
        lv_obj_set_style_flex_gap(row, 12, 0);

        /* Time ago */
        char time_buf[16];
        format_time_ago(time_buf, sizeof(time_buf), entry->timestamp);
        make_label(row, &lv_font_montserrat_14, COL_TEXT_DIM, time_buf);

        /* Slug */
        make_label(row, &lv_font_montserrat_14, COL_ACCENT, entry->slug);

        /* Changed keys */
        make_label(row, &lv_font_montserrat_14, COL_TEXT, entry->summary);
    }
}
