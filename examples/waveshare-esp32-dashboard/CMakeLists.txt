# Maestra Dashboard for Waveshare ESP32-P4-WIFI6-Touch-LCD-3.4C
cmake_minimum_required(VERSION 3.5)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)

# BSP component from the Waveshare example repo (auto-discovered from components/)
# See README for setup instructions.

add_compile_options(-Wno-format)
project(maestra_dashboard)
