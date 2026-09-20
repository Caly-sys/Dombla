#ifndef CONFIG_H
#define CONFIG_H

// ============================================================
//  Dombla — ESP32 Sensor Monitor Configuration
// ============================================================

// --- Credentials (loaded from secrets.h — see that file) ---
#include "secrets.h"

// --- Device Identity ---
#define DEVICE_NAME "Dombla-01"
#define MDNS_HOSTNAME "dombla" // Reachable at dombla.local

// --- MQTT Settings ---
// Device ID used in MQTT topics: dombla/<MQTT_DEVICE_ID>/sensors/...
#define MQTT_DEVICE_ID "greenhouse1"
#define MQTT_PUBLISH_INTERVAL 10000  // Publish sensor data every 10 seconds
#define MQTT_RECONNECT_INTERVAL 5000 // Wait 5s between reconnect attempts
#ifdef MQTT_KEEPALIVE
#undef MQTT_KEEPALIVE
#endif
#define MQTT_KEEPALIVE 60 // MQTT keepalive in seconds

// --- NTP Clock & Timezone (WIB / UTC+7 Asia/Jakarta) ---
#define NTP_SERVER_1 "pool.ntp.org"
#define NTP_SERVER_2 "time.google.com"
#define NTP_SERVER_3 "time.nist.gov"
#define NTP_TIMEZONE_OFFSET (7 * 3600) // UTC+7 hours in seconds (WIB)
#define NTP_DAYLIGHT_OFFSET 0          // No daylight saving time
#define NTP_TZ_POSIX "WIB-7" // Standard POSIX timezone string for UTC+7
#define NTP_RESYNC_INTERVAL (3600 * 1000) // Resync every 1 hour

// --- Automation Schedules ---
#define MAX_SCHEDULES 16
#define SCHEDULES_NVS_NAMESPACE "dombla_sch"
#define SCHEDULES_NVS_KEY "rules"

// --- Pin Definitions ---
// 🌡️ DHT11 Temperature & Humidity Sensor
#define DHT_PIN 4
#define DHT_TYPE DHT11

// 🌱 Soil Moisture Sensors (Analog)
#define SOIL_PIN 34   // Soil sensor 1 — GPIO 34 (ADC1_CH6)
#define SOIL_PIN_2 35 // Soil sensor 2 — GPIO 35 (ADC1_CH7)

// 🔌 Relay Outputs
#define RELAY_GROWLIGHT_PIN 14          // GPIO 14 — Grow Light relay
#define RELAY_PUMP_PIN 27               // GPIO 27 — Water Pump relay
#define RELAY_ACTIVE_LOW true           // Most relay modules trigger on LOW
#define RELAY_PUMP_DEFAULT_ON false     // Water pump OFF at boot
#define RELAY_GROWLIGHT_DEFAULT_ON true // Grow light ON at boot

// 🔘 Physical Push-Button Inputs (3-pin modules: VCC→3.3V, GND→GND, OUT→GPIO)
#define BTN_PUMP_PIN 25      // GPIO 25 — Water Pump toggle button
#define BTN_GROWLIGHT_PIN 26 // GPIO 26 — Grow Light toggle button
#define BTN_DEBOUNCE_MS 40   // Debounce window in milliseconds
#define BTN_BOOT_LOCKOUT_MS                                                    \
  1000 // Ignore button transitions during first 1s after boot

// 📺 LCD I2C (16x2)
#define LCD_ADDR 0x27 // Common I2C address; try 0x3F if not working
#define LCD_COLS 16
#define LCD_ROWS 2
#define LCD_SDA 21
#define LCD_SCL 22

// --- Sensor Reading Intervals (ms) ---
#define DHT_READ_INTERVAL 2000 // DHT11 needs ≥2s between reads
#define SOIL_READ_INTERVAL 1000
#define LCD_CYCLE_INTERVAL 3000 // Cycle LCD display pages every 3s

// --- Soil Moisture Calibration ---
// Raw ADC values: 0 (wet) to 4095 (dry) — adjust for your sensor
#define SOIL_DRY_VALUE 3200 // ADC reading when soil is dry
#define SOIL_WET_VALUE 1200 // ADC reading when soil is wet

// --- Alert Thresholds ---
#define TEMP_HIGH_THRESHOLD 35.0    // °C — too hot
#define TEMP_LOW_THRESHOLD 10.0     // °C — too cold
#define HUMIDITY_LOW_THRESHOLD 30.0 // % — too dry air
#define SOIL_DRY_THRESHOLD 25.0     // % — soil needs water
#define SOIL_WET_THRESHOLD 85.0     // % — overwatered

// --- History Buffer ---
#define HISTORY_SIZE 60 // Store last 60 readings (~1 hour at 1/min)

#endif // CONFIG_H
