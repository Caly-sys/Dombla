# 🌱 Dombla — ESP32 Plant Monitoring System

A complete plant monitoring system using an ESP32 microcontroller with temperature, humidity, and soil moisture sensors — plus a sleek web dashboard for real-time monitoring.

## Features

- **🌡️ DHT11** — Temperature & humidity sensing
- **🌱 Soil moisture sensor** — Accurate real-time soil hydration monitoring
- **📺 LCD display** — Real-time readings cycling on a 16x2 I2C LCD
- **📡 WiFi web server** — JSON API served directly from the ESP32
- **🖥️ Web dashboard** — Modern dark-themed dashboard with live charts
- **🔔 Threshold alerts** — Visual warnings when values go out of range
- **📊 Rolling history** — 1 hour of data stored in memory for charting

## Quick Start

### 1. Flash the ESP32

1. Install [PlatformIO](https://platformio.org/) (VS Code extension or CLI)
2. Edit `esp32-firmware/src/config.h` — set your WiFi SSID and password
3. Connect your ESP32 via USB
4. Build and upload:

```bash
cd esp32-firmware
pio run --target upload
pio device monitor   # Watch serial output
```

### 2. Wire the sensors

See [WIRING.md](WIRING.md) for the complete pin table and diagram.

### 3. Open the dashboard

1. Open `web-dashboard/index.html` in your browser
2. Enter your ESP32's IP address (shown on the LCD or in serial output)
3. Click **Add Device** — data will start streaming in!

## API Endpoints

| Endpoint         | Method | Description                        |
| ---------------- | ------ | ---------------------------------- |
| `/`              | GET    | Mini status page (HTML)            |
| `/api/status`    | GET    | Full device info + sensor data     |
| `/api/sensors`   | GET    | Current sensor readings only       |
| `/api/history`   | GET    | Last 60 readings (~1 per minute)   |

### Example: `/api/sensors`

```json
{
    "temperature": 26.5,
    "humidity": 62.3,
    "soil": 45.2,
    "soil_raw": 2100,
    "timestamp": 123456
}
```

## Project Structure

```
Dombla/
├── esp32-firmware/
│   ├── platformio.ini       # PlatformIO project config
│   └── src/
│       ├── config.h         # Pin definitions & WiFi credentials
│       └── main.cpp         # Main firmware
├── web-dashboard/
│   ├── index.html           # Dashboard page
│   ├── style.css            # Dark theme styles
│   └── app.js               # Dashboard logic
├── WIRING.md                # Pin wiring reference
└── README.md                # This file
```

## Calibration

The soil moisture sensors need calibration for accurate readings. Edit `config.h`:

```cpp
#define SOIL_DRY_VALUE   3200   // ADC reading in dry air
#define SOIL_WET_VALUE   1200   // ADC reading submerged in water
```

**To calibrate:**
1. Read the raw value with the sensor in dry air → `SOIL_DRY_VALUE`
2. Read the raw value with the sensor in water → `SOIL_WET_VALUE`
3. Raw values are shown in the API response (`soil_raw`)

## License

MIT
