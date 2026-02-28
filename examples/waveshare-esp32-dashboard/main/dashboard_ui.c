/**
 * LVGL v9 dashboard UI for the Waveshare ESP32-P4 3.4" round display.
 *
 * Uses an lv_tileview for the three swipeable pages, laid out inside a
 * circular background that matches the physical round bezel.
 */

#include "dashboard_ui.h"
#include "maestra_mqtt.h"
#include "spectrum_stream.h"

#include <stdio.h>
#include <string.h>
#include <math.h>
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

/* Spectrum */
static lv_obj_t *spectrum_chart;
static lv_chart_series_t *spectrum_series;
static lv_obj_t *lbl_spec_freq;
static lv_obj_t *lbl_spec_peak;
static lv_obj_t *lbl_spec_noise;
static lv_obj_t *lbl_spec_snr;
static lv_obj_t *lbl_spec_source;
static lv_obj_t *lbl_spec_status;

#define SPECTRUM_CHART_POINTS  256

/* ── Visualization modes ──────────────────────────────────────────────── */

typedef enum { VIZ_LINE = 0, VIZ_WATERFALL, VIZ_RADIAL, VIZ_MODE_COUNT } viz_mode_t;
static viz_mode_t       s_viz_mode = VIZ_LINE;
static lv_obj_t        *lbl_viz_mode;

/* Waterfall spectrogram canvas */
#define WF_W   256
#define WF_H   200
static lv_obj_t        *waterfall_canvas;
static lv_draw_buf_t   *waterfall_buf;

/* Radial / polar canvas */
#define RAD_W  400
#define RAD_H  400
static lv_obj_t        *radial_canvas;
static lv_draw_buf_t   *radial_buf;

/* Inferno-style colormap: 256 entries stored as RGB565 */
static uint16_t s_colormap[256];

/* Nav indicators */
#define NUM_TILES  4
static lv_obj_t *nav_dots[NUM_TILES];
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
    lv_obj_set_style_pad_column(left, 8, 0);

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
    lv_obj_set_style_pad_row(card, 4, 0);

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
    lv_obj_set_style_pad_row(card, 4, 0);
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
    lv_obj_set_style_pad_row(activity_list, 2, 0);
    lv_obj_set_style_pad_all(activity_list, 12, 0);
}

/* ── Inferno-style colormap initialisation ────────────────────────────── */

static inline uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b)
{
    return (uint16_t)(((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3));
}

static uint8_t lerp8(uint8_t a, uint8_t b, float t)
{
    return (uint8_t)(a + t * (b - a));
}

static void init_colormap(void)
{
    /* 4-stop Inferno-inspired gradient:
     *   0 : black        (0, 0, 0)
     *  64 : deep purple  (50, 0, 130)
     * 128 : red/magenta  (190, 20, 60)
     * 192 : orange/amber (255, 170, 0)
     * 255 : bright white (255, 255, 220)
     */
    static const uint8_t stops[][3] = {
        {  0,   0,   0},
        { 50,   0, 130},
        {190,  20,  60},
        {255, 170,   0},
        {255, 255, 220},
    };
    for (int i = 0; i < 256; i++) {
        int seg  = i / 64;
        if (seg > 3) seg = 3;
        float t  = (float)(i - seg * 64) / 64.0f;
        uint8_t r = lerp8(stops[seg][0], stops[seg + 1][0], t);
        uint8_t g = lerp8(stops[seg][1], stops[seg + 1][1], t);
        uint8_t b = lerp8(stops[seg][2], stops[seg + 1][2], t);
        s_colormap[i] = rgb565(r, g, b);
    }
}

/* ── Viz mode tap handler ─────────────────────────────────────────────── */

static void on_viz_mode_tap(lv_event_t *e)
{
    (void)e;
    s_viz_mode = (viz_mode_t)((s_viz_mode + 1) % VIZ_MODE_COUNT);

    /* Hide all visualisation widgets */
    lv_obj_add_flag(spectrum_chart,    LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(waterfall_canvas,  LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(radial_canvas,     LV_OBJ_FLAG_HIDDEN);

    /* Show the active one */
    switch (s_viz_mode) {
        case VIZ_LINE:      lv_obj_remove_flag(spectrum_chart,   LV_OBJ_FLAG_HIDDEN); break;
        case VIZ_WATERFALL: lv_obj_remove_flag(waterfall_canvas, LV_OBJ_FLAG_HIDDEN); break;
        case VIZ_RADIAL:    lv_obj_remove_flag(radial_canvas,    LV_OBJ_FLAG_HIDDEN); break;
        default: break;
    }

    static const char *names[] = {"LINE", "WATERFALL", "RADIAL"};
    lv_label_set_text(lbl_viz_mode, names[s_viz_mode]);
}

/* ── Spectrum page ─────────────────────────────────────────────────────── */

static void create_spectrum(lv_obj_t *page)
{
    lv_obj_t *title = make_label(page, &lv_font_montserrat_26, COL_ACCENT, "SPECTRUM");
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 60);

    /* Chart card */
    lv_obj_t *chart_card = lv_obj_create(page);
    lv_obj_add_style(chart_card, &style_card, 0);
    lv_obj_set_size(chart_card, 620, 340);
    lv_obj_align(chart_card, LV_ALIGN_TOP_MID, 0, 100);
    lv_obj_set_style_pad_all(chart_card, 8, 0);

    /* LVGL chart */
    spectrum_chart = lv_chart_create(chart_card);
    lv_obj_set_size(spectrum_chart, 596, 300);
    lv_obj_center(spectrum_chart);
    lv_chart_set_type(spectrum_chart, LV_CHART_TYPE_LINE);
    lv_chart_set_point_count(spectrum_chart, SPECTRUM_CHART_POINTS);
    lv_chart_set_range(spectrum_chart, LV_CHART_AXIS_PRIMARY_Y, -80, 0);
    lv_chart_set_div_line_count(spectrum_chart, 4, 0);
    lv_chart_set_update_mode(spectrum_chart, LV_CHART_UPDATE_MODE_SHIFT);

    /* Chart styling */
    lv_obj_set_style_bg_color(spectrum_chart, COL_BG, 0);
    lv_obj_set_style_bg_opa(spectrum_chart, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(spectrum_chart, COL_TEXT_DIM, 0);
    lv_obj_set_style_border_width(spectrum_chart, 1, 0);
    lv_obj_set_style_line_color(spectrum_chart, lv_color_hex(0x2A2C32),
                                LV_PART_MAIN);

    /* Series */
    spectrum_series = lv_chart_add_series(spectrum_chart, COL_ACCENT,
                                          LV_CHART_AXIS_PRIMARY_Y);
    lv_obj_set_style_line_width(spectrum_chart, 2, LV_PART_ITEMS);
    lv_obj_set_style_size(spectrum_chart, 0, 0, LV_PART_INDICATOR);

    /* Initialise with zeros */
    for (int i = 0; i < SPECTRUM_CHART_POINTS; i++) {
        lv_chart_set_series_value_by_id(spectrum_chart, spectrum_series, i, -80);
    }

    /* Y-axis labels */
    make_label(chart_card, &lv_font_montserrat_14, COL_TEXT_DIM, "0 dB");
    lv_obj_t *lbl_min = make_label(chart_card, &lv_font_montserrat_14,
                                    COL_TEXT_DIM, "-80 dB");
    lv_obj_align(lbl_min, LV_ALIGN_BOTTOM_LEFT, 0, 0);

    /* ── Waterfall canvas (hidden by default) ──────────────────────── */
    init_colormap();
    waterfall_buf = lv_draw_buf_create(WF_W, WF_H, LV_COLOR_FORMAT_RGB565, 0);
    waterfall_canvas = lv_canvas_create(chart_card);
    lv_canvas_set_draw_buf(waterfall_canvas, waterfall_buf);
    lv_canvas_fill_bg(waterfall_canvas, lv_color_hex(0x000000), LV_OPA_COVER);
    lv_obj_set_size(waterfall_canvas, 596, 300);
    lv_image_set_inner_align(waterfall_canvas, LV_IMAGE_ALIGN_STRETCH);
    lv_obj_center(waterfall_canvas);
    lv_obj_add_flag(waterfall_canvas, LV_OBJ_FLAG_HIDDEN);

    /* ── Radial canvas (hidden by default) ─────────────────────────── */
    radial_buf = lv_draw_buf_create(RAD_W, RAD_H, LV_COLOR_FORMAT_RGB565, 0);
    radial_canvas = lv_canvas_create(chart_card);
    lv_canvas_set_draw_buf(radial_canvas, radial_buf);
    lv_canvas_fill_bg(radial_canvas, lv_color_hex(0x000000), LV_OPA_COVER);
    lv_obj_set_size(radial_canvas, 300, 300);
    lv_image_set_inner_align(radial_canvas, LV_IMAGE_ALIGN_STRETCH);
    lv_obj_center(radial_canvas);
    lv_obj_add_flag(radial_canvas, LV_OBJ_FLAG_HIDDEN);

    /* ── Mode label + tap-to-cycle ─────────────────────────────────── */
    lbl_viz_mode = make_label(chart_card, &lv_font_montserrat_14,
                              COL_TEXT_DIM, "LINE");
    lv_obj_align(lbl_viz_mode, LV_ALIGN_TOP_RIGHT, -8, 4);

    lv_obj_add_flag(chart_card, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(chart_card, on_viz_mode_tap, LV_EVENT_CLICKED, NULL);

    /* Info row below chart */
    lv_obj_t *info = lv_obj_create(page);
    lv_obj_add_style(info, &style_card, 0);
    lv_obj_set_size(info, 620, 80);
    lv_obj_align(info, LV_ALIGN_TOP_MID, 0, 452);
    lv_obj_set_flex_flow(info, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(info, LV_FLEX_ALIGN_SPACE_EVENLY,
                          LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_all(info, 8, 0);

    /* Metric columns */
    const char *labels[] = {"FREQ", "PEAK", "NOISE", "SNR"};
    lv_obj_t **val_ptrs[] = {&lbl_spec_freq, &lbl_spec_peak,
                             &lbl_spec_noise, &lbl_spec_snr};

    for (int i = 0; i < 4; i++) {
        lv_obj_t *col = lv_obj_create(info);
        lv_obj_set_size(col, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
        lv_obj_set_style_bg_opa(col, LV_OPA_TRANSP, 0);
        lv_obj_set_style_border_width(col, 0, 0);
        lv_obj_set_style_pad_all(col, 0, 0);
        lv_obj_set_flex_flow(col, LV_FLEX_FLOW_COLUMN);
        lv_obj_set_flex_align(col, LV_FLEX_ALIGN_CENTER,
                              LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

        make_label(col, &lv_font_montserrat_14, COL_TEXT_DIM, labels[i]);
        *val_ptrs[i] = make_label(col, &lv_font_montserrat_18, COL_TEXT, "--");
    }

    /* Stream source / status bar */
    lv_obj_t *status_row = lv_obj_create(page);
    lv_obj_set_size(status_row, 620, LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(status_row, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(status_row, 0, 0);
    lv_obj_set_style_pad_all(status_row, 0, 0);
    lv_obj_align(status_row, LV_ALIGN_TOP_MID, 0, 544);
    lv_obj_set_flex_flow(status_row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(status_row, LV_FLEX_ALIGN_SPACE_BETWEEN,
                          LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    lbl_spec_source = make_label(status_row, &lv_font_montserrat_14,
                                  COL_TEXT_DIM, "Scanning for streams...");
    lbl_spec_status = make_label(status_row, &lv_font_montserrat_14,
                                  COL_TEXT_DIM, "");
}

/* ── Navigation dots ────────────────────────────────────────────────────── */

static void update_nav_dots(int active)
{
    for (int i = 0; i < NUM_TILES; i++) {
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
    lv_obj_set_size(cont, 120, 20);
    lv_obj_set_style_bg_opa(cont, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(cont, 0, 0);
    lv_obj_set_style_pad_all(cont, 0, 0);
    lv_obj_align(cont, LV_ALIGN_BOTTOM_MID, 0, -50);
    lv_obj_set_flex_flow(cont, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(cont, LV_FLEX_ALIGN_CENTER,
                          LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(cont, 12, 0);

    for (int i = 0; i < NUM_TILES; i++) {
        nav_dots[i] = lv_obj_create(cont);
        lv_obj_set_size(nav_dots[i], 10, 10);
        lv_obj_set_style_radius(nav_dots[i], LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_bg_color(nav_dots[i], COL_TEXT_DIM, 0);
        lv_obj_set_style_bg_opa(nav_dots[i], LV_OPA_COVER, 0);
        lv_obj_set_style_border_width(nav_dots[i], 0, 0);
    }
    update_nav_dots(0);
}

/* ── Spectrum visualisation update helpers ──────────────────────────────── */

/**
 * Compute common spectrum metrics from the raw power_db array.
 * Writes back peak_power, noise_floor, snr, peak_freq.
 */
static void compute_spectrum_metrics(const spectrum_data_t *spec,
                                     float *out_peak, float *out_noise,
                                     float *out_snr,  float *out_peak_freq)
{
    float noise_sum  = 0.0f;
    float peak_power = -200.0f;
    float peak_freq  = 0.0f;

    for (uint32_t b = 0; b < spec->fft_size; b++) {
        noise_sum += spec->power_db[b];
        if (spec->power_db[b] > peak_power) {
            peak_power = spec->power_db[b];
            float freq_res = (float)(spec->sample_rate / spec->fft_size);
            peak_freq = (float)(spec->center_freq
                        - spec->sample_rate / 2.0
                        + b * freq_res);
        }
    }

    *out_peak      = peak_power;
    *out_noise     = (spec->fft_size > 0) ? noise_sum / (float)spec->fft_size : -80.0f;
    *out_snr       = peak_power - *out_noise;
    *out_peak_freq = peak_freq;
}

/* ── LINE chart update ──────────────────────────────────────────────────── */

static void update_line_chart(const spectrum_data_t *spec)
{
    uint32_t fft = spec->fft_size;
    int bins_per_point = (int)(fft / SPECTRUM_CHART_POINTS);
    if (bins_per_point < 1) bins_per_point = 1;

    for (int p = 0; p < SPECTRUM_CHART_POINTS; p++) {
        int start = p * bins_per_point;
        int end   = start + bins_per_point;
        if (end > (int)fft) end = (int)fft;

        float max_val = -200.0f;
        for (int b = start; b < end; b++) {
            if (spec->power_db[b] > max_val)
                max_val = spec->power_db[b];
        }
        int32_t val = (int32_t)max_val;
        if (val < -80) val = -80;
        if (val > 0)   val = 0;
        lv_chart_set_series_value_by_id(spectrum_chart, spectrum_series, p, val);
    }
    lv_chart_refresh(spectrum_chart);
}

/* ── WATERFALL spectrogram update ───────────────────────────────────────── */

static void update_waterfall(const spectrum_data_t *spec)
{
    uint16_t *px = (uint16_t *)waterfall_buf->data;

    /* Scroll all existing rows down by one (newest row at top) */
    memmove(px + WF_W, px, (size_t)WF_W * (WF_H - 1) * sizeof(uint16_t));

    /* Draw new top row from spectrum data */
    int bins_per_col = (int)(spec->fft_size / WF_W);
    if (bins_per_col < 1) bins_per_col = 1;

    for (int x = 0; x < WF_W; x++) {
        int start = x * bins_per_col;
        float max_val = -200.0f;
        for (int b = start; b < start + bins_per_col && b < (int)spec->fft_size; b++) {
            if (spec->power_db[b] > max_val)
                max_val = spec->power_db[b];
        }
        /* Map -80 … 0 dB  →  colormap index 0 … 255 */
        int idx = (int)((max_val + 80.0f) * (255.0f / 80.0f));
        if (idx < 0)   idx = 0;
        if (idx > 255) idx = 255;
        px[x] = s_colormap[idx];
    }

    lv_obj_invalidate(waterfall_canvas);
}

/* ── RADIAL / polar spectrum update ─────────────────────────────────────── */

static void update_radial(const spectrum_data_t *spec)
{
    /* Clear to black */
    lv_canvas_fill_bg(radial_canvas, lv_color_hex(0x000000), LV_OPA_COVER);

    lv_layer_t layer;
    lv_canvas_init_layer(radial_canvas, &layer);

    const float cx = RAD_W / 2.0f;
    const float cy = RAD_H / 2.0f;
    const float inner_r = 30.0f;
    const float max_r   = cx - 10.0f;

    int num_lines = 180;  /* one radial line every 2° */
    int bins_per_line = (int)(spec->fft_size / num_lines);
    if (bins_per_line < 1) bins_per_line = 1;

    for (int i = 0; i < num_lines; i++) {
        float angle = (float)i * (2.0f * 3.14159265f / (float)num_lines);

        /* Peak-hold for this angular segment */
        int start = i * bins_per_line;
        float max_val = -200.0f;
        for (int b = start; b < start + bins_per_line && b < (int)spec->fft_size; b++) {
            if (spec->power_db[b] > max_val)
                max_val = spec->power_db[b];
        }

        /* Normalise 0 … 1 */
        float norm = (max_val + 80.0f) / 80.0f;
        if (norm < 0.0f) norm = 0.0f;
        if (norm > 1.0f) norm = 1.0f;

        float outer_r = inner_r + norm * (max_r - inner_r);

        /* Colour from the colormap */
        int cidx = (int)(norm * 255.0f);
        if (cidx > 255) cidx = 255;
        uint16_t c565 = s_colormap[cidx];
        uint8_t r = (uint8_t)((c565 >> 11) << 3);
        uint8_t g = (uint8_t)(((c565 >> 5) & 0x3F) << 2);
        uint8_t b = (uint8_t)((c565 & 0x1F) << 3);

        float cos_a = cosf(angle);
        float sin_a = sinf(angle);

        lv_draw_line_dsc_t dsc;
        lv_draw_line_dsc_init(&dsc);
        dsc.color     = lv_color_make(r, g, b);
        dsc.width     = 3;
        dsc.opa       = LV_OPA_COVER;
        dsc.round_end = 1;
        dsc.p1 = (lv_point_precise_t){ (int32_t)(cx + inner_r * cos_a),
                                       (int32_t)(cy + inner_r * sin_a) };
        dsc.p2 = (lv_point_precise_t){ (int32_t)(cx + outer_r * cos_a),
                                       (int32_t)(cy + outer_r * sin_a) };
        lv_draw_line(&layer, &dsc);
    }

    lv_canvas_finish_layer(radial_canvas, &layer);
}

/* ── Public: spectrum fast-path refresh (10 Hz) ────────────────────────── */

void dashboard_spectrum_refresh(void)
{
    char buf[64];
    const spectrum_data_t *spec        = spectrum_get_data();
    const spectrum_stream_info_t *sinfo = spectrum_get_info();

    /* Stream source info */
    if (sinfo->discovered) {
        snprintf(buf, sizeof(buf), "%s  %s:%u",
                 sinfo->name, sinfo->publisher_address, sinfo->publisher_port);
        lv_label_set_text(lbl_spec_source, buf);
        lv_obj_set_style_text_color(lbl_spec_source, COL_TEXT_DIM, 0);
    } else {
        lv_label_set_text(lbl_spec_source, "Scanning for streams...");
        lv_obj_set_style_text_color(lbl_spec_source, COL_TEXT_DIM, 0);
    }

    if (!spec->valid) {
        lv_label_set_text(lbl_spec_status, "");
        lv_label_set_text(lbl_spec_freq,  "--");
        lv_label_set_text(lbl_spec_peak,  "--");
        lv_label_set_text(lbl_spec_noise, "--");
        lv_label_set_text(lbl_spec_snr,   "--");
        return;
    }

    bool receiving = spectrum_is_receiving();
    if (receiving) {
        snprintf(buf, sizeof(buf), "LIVE  seq %lu", (unsigned long)spec->seq);
        lv_label_set_text(lbl_spec_status, buf);
        lv_obj_set_style_text_color(lbl_spec_status, COL_GREEN, 0);
    } else {
        lv_label_set_text(lbl_spec_status, "SIGNAL LOST");
        lv_obj_set_style_text_color(lbl_spec_status, COL_RED, 0);
    }

    /* Dispatch to active visualisation */
    switch (s_viz_mode) {
        case VIZ_LINE:      update_line_chart(spec); break;
        case VIZ_WATERFALL: update_waterfall(spec);  break;
        case VIZ_RADIAL:    update_radial(spec);     break;
        default: break;
    }

    /* Metric labels */
    float peak, noise, snr, peak_freq;
    compute_spectrum_metrics(spec, &peak, &noise, &snr, &peak_freq);

    snprintf(buf, sizeof(buf), "%.3f MHz", spec->center_freq / 1e6);
    lv_label_set_text(lbl_spec_freq, buf);

    snprintf(buf, sizeof(buf), "%.1f dB", peak);
    lv_label_set_text(lbl_spec_peak, buf);
    lv_obj_set_style_text_color(lbl_spec_peak,
        peak > -20.0f ? COL_GREEN : COL_TEXT, 0);

    snprintf(buf, sizeof(buf), "%.1f dB", noise);
    lv_label_set_text(lbl_spec_noise, buf);

    snprintf(buf, sizeof(buf), "%.1f dB", snr);
    lv_label_set_text(lbl_spec_snr, buf);
    lv_obj_set_style_text_color(lbl_spec_snr,
        snr > 20.0f ? COL_GREEN : snr > 10.0f ? COL_YELLOW : COL_TEXT, 0);
}

/* ── Public: create ─────────────────────────────────────────────────────── */

void dashboard_ui_create(void)
{
    s_boot_us = esp_timer_get_time();
    init_styles();

    /* Root screen */
    lv_obj_t *scr = lv_screen_active();
    lv_obj_add_style(scr, &style_bg, 0);

    /* Tileview for horizontal swipe between 4 pages */
    tileview = lv_tileview_create(scr);
    lv_obj_set_size(tileview, DISP_W, DISP_H);
    lv_obj_set_style_bg_color(tileview, COL_BG, 0);
    lv_obj_set_style_bg_opa(tileview, LV_OPA_COVER, 0);
    lv_obj_add_event_cb(tileview, on_tile_changed, LV_EVENT_VALUE_CHANGED, NULL);

    lv_obj_t *t0 = lv_tileview_add_tile(tileview, 0, 0, LV_DIR_RIGHT);
    lv_obj_t *t1 = lv_tileview_add_tile(tileview, 1, 0, LV_DIR_LEFT | LV_DIR_RIGHT);
    lv_obj_t *t2 = lv_tileview_add_tile(tileview, 2, 0, LV_DIR_LEFT | LV_DIR_RIGHT);
    lv_obj_t *t3 = lv_tileview_add_tile(tileview, 3, 0, LV_DIR_LEFT);

    create_overview(t0);
    create_entities(t1);
    create_activity(t2);
    create_spectrum(t3);

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
        lv_obj_set_style_pad_column(row, 12, 0);

        /* Time ago */
        char time_buf[16];
        format_time_ago(time_buf, sizeof(time_buf), entry->timestamp);
        make_label(row, &lv_font_montserrat_14, COL_TEXT_DIM, time_buf);

        /* Slug */
        make_label(row, &lv_font_montserrat_14, COL_ACCENT, entry->slug);

        /* Changed keys */
        make_label(row, &lv_font_montserrat_14, COL_TEXT, entry->summary);
    }

    /* Spectrum is handled by the fast-path dashboard_spectrum_refresh() */
}
