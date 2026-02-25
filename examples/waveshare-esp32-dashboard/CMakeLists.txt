# Maestra Dashboard for Waveshare ESP32-P4-WIFI6-Touch-LCD-3.4C
cmake_minimum_required(VERSION 3.5)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)

# BSP component from the Waveshare example repo
# Copy the bsp_extra and esp32_p4_wifi6_touch_lcd_x components into ./components/
set(EXTRA_COMPONENT_DIRS
    ./components/bsp_extra
)

add_compile_options(-Wno-format)
project(maestra_dashboard)
