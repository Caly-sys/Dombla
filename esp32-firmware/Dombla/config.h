#ifndef CONFIG_H
#define CONFIG_H

// ============================================================
//  Dombla — ESP32 Sensor Monitor Configuration
// ============================================================

// --- WiFi Credentials ---
// ⚠️  Change these to your network credentials before flashing!
#define WIFI_SSID "1"
#define WIFI_PASSWORD "12345678"

// --- Device Identity ---
#define DEVICE_NAME "Dombla-01"
#define MDNS_HOSTNAME "dombla" // Reachable at dombla.local

// --- Pin Definitions ---
// 🌡️ DHT11 Temperature & Humidity Sensor
#define DHT_PIN 4
#define DHT_TYPE DHT11

// 🌱 Soil Moisture Sensor (Analog)
#define SOIL_PIN 34

// 🔌 Relay Outputs
#define RELAY_GROWLIGHT_PIN 14  // GPIO 14 — Grow Light relay
#define RELAY_PUMP_PIN      27  // GPIO 27 — Water Pump relay
#define RELAY_ACTIVE_LOW    true // Most relay modules trigger on LOW

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
