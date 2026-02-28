/**
 * LVGL dashboard UI for the round 800×800 display.
 *
 * Three views navigated by swiping or tapping the bottom indicator:
 *   0 — Overview   (WiFi, MQTT, uptime, heap)
 *   1 — Entities   (live state cards)
 *   2 — Activity   (recent state-change log)
 */

#ifndef DASHBOARD_UI_H
#define DASHBOARD_UI_H

#include "lvgl.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Create the entire dashboard UI.  Call once after LVGL is initialised. */
void dashboard_ui_create(void);

/** Refresh data-driven content (call periodically from a timer). */
void dashboard_ui_refresh(void);

/** Fast-path spectrum-only refresh (call at ~100 ms for smooth animation). */
void dashboard_spectrum_refresh(void);

#ifdef __cplusplus
}
#endif

#endif /* DASHBOARD_UI_H */
