# 🌱 Dombla — Smart Greenhouse & Plant Monitoring System

Dombla is a plant monitoring and greenhouse automation system built on the ESP32 microcontroller. It supports **local Wi-Fi monitoring** (direct HTTP JSON API) as well as **worldwide remote access** via secure MQTT over TLS with HiveMQ Cloud. Monitor climate and soil conditions, track historical trends, and trigger actuators (such as water pumps and grow lights) from across the room or anywhere in the world.

---

## 🏛️ Architecture

```
                                  ┌───────────────────────────────┐
                                  │      Local Wi-Fi Network      │
                                  │                               │
                                  │  Web Browser / Desktop App    │
                                  │            ▲     ▲            │
                                  │       HTTP │     │ HTTP       │
                                  │            ▼     ▼            │
                                  │         [ ESP32 ]             │
                                  └────────────┬──────────────────┘
                                               │
                                    TLS / MQTTS (Port 8883)
                                               │
                                               ▼
                                    ┌─────────────────────┐
                                    │    HiveMQ Cloud     │
                                    │   (MQTT Broker)     │
                                    └──────────┬──────────┘
                                               │
                                    WSS / TLS (Port 8883/8884)
                                               │
                                               ▼
                                  ┌─────────────────────────┐
                                  │   Node.js MQTT Bridge   │
                                  │    & Web Dashboard      │
                                  │   (Runs anywhere with   │
                                  │     Internet access)    │
                                  └────────────┬────────────┘
                                               │ WebSocket
                                               ▼
                                  ┌─────────────────────────┐
                                  │  Remote Web Dashboard   │
                                  │    & Desktop Client     │
                                  └─────────────────────────┘
```

- **Local Mode:** Connect directly to the ESP32's IP address when on the same Wi-Fi network.
- **Remote MQTT Mode:** Access real-time sensor streams and control relays from anywhere over the Internet without opening router ports or exposing your local network.

---

## ✨ Features

- **🌡️ Climate Monitoring** — DHT11 temperature and relative humidity sensor.
- **🌱 Dual Soil Moisture Sensors** — Two independent analog capacitive/resistive soil channels (Left: GPIO 34, Right: GPIO 35).
- **💧 Actuator & Relay Controls** — Remote and local control for water pumps (GPIO 27) and grow lights (GPIO 14).
- **📺 16x2 I2C LCD Display** — Automatic 4-page cycling display showing Climate, Soil, IP Address, and MQTT connection status.
- **🚨 Fault Detection & Diagnostics** — Built-in failsafes for maximum pump runtime, sensor jump detection, and automated watering effectiveness verification.
- **☁️ HiveMQ Cloud Integration** — Secure TLS connection with MQTT Last Will and Testament (LWT) for online/offline presence detection.
- **🖥️ Dual Client Interfaces**:
  - **Web Dashboard** with real-time Chart.js graphs, relay toggles, multi-device switcher, and a dedicated **System Health & Diagnostics** pane.
  - **Desktop App** built with Electron, featuring Discord dark mode styling.
- **🛡️ Security First** — Wi-Fi and MQTT credentials stored exclusively in gitignored `secrets.h` and `.env` files.

---

## 📋 Hardware Specifications

| Component | Pin / Signal | ESP32 Pin | Voltage | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **DHT11 Sensor** | DATA | **GPIO 4** | 3.3V | Includes pull-up resistor |
| **Soil Sensor 1 (Left)** | AO | **GPIO 34** | 3.3V | ADC1 Channel 6 |
| **Soil Sensor 2 (Right)** | AO | **GPIO 35** | 3.3V | ADC1 Channel 7 |
| **Water Pump Relay** | IN | **GPIO 27** | 5V (VIN) | Active-LOW relay module |
| **Grow Light Relay** | IN | **GPIO 14** | 5V (VIN) | Active-LOW relay module |
| **16x2 I2C LCD** | SDA / SCL | **GPIO 21 / 22** | 5V (VIN) | Default I2C address: `0x27` |

*Refer to [WIRING.md](WIRING.md) for full schematics and ASCII diagrams.*

---

## 🚀 Quick Setup Guide

### 1. Configure HiveMQ Cloud (Free MQTT Broker)
1. Register for a free account at [HiveMQ Cloud Console](https://console.hivemq.cloud/).
2. Create a free **Serverless Cluster**.
3. Note your **Cluster URL** (e.g., `xxxxxx.s1.eu.hivemq.cloud`).
4. In the **Access Management** tab, create an MQTT user and password.

---

### 2. Configure & Flash ESP32 Firmware

1. Install [PlatformIO](https://platformio.org/) (via VS Code or CLI).
2. Copy or edit `esp32-firmware/src/secrets.h`:
   ```cpp
   #define WIFI_SSID     "YOUR_WIFI_NAME"
   #define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

   #define MQTT_BROKER   "xxxxxx.s1.eu.hivemq.cloud"
   #define MQTT_PORT     8883
   #define MQTT_USER     "YOUR_MQTT_USERNAME"
   #define MQTT_PASSWORD "YOUR_MQTT_PASSWORD"
   ```
3. Connect your ESP32 via USB and upload:
   ```bash
   cd esp32-firmware
   pio run --target upload
   pio device monitor
   ```

---

### 3. Launch Web Dashboard & MQTT Bridge

1. Open `web-dashboard`:
   ```bash
   cd web-dashboard
   ```
2. Copy `.env.example` to `.env`:
   ```bash
   copy .env.example .env
   ```
3. Edit `.env` with your HiveMQ credentials:
   ```ini
   PORT=8000
   MQTT_BROKER=mqtts://xxxxxx.s1.eu.hivemq.cloud:8883
   MQTT_USER=YOUR_MQTT_USERNAME
   MQTT_PASSWORD=YOUR_MQTT_PASSWORD
   MQTT_DEVICE_ID=greenhouse1
   ```
4. Run the server:
   - On Windows: double-click **`start-server.bat`**
   - Or run via terminal:
     ```bash
     npm install
     npm start
     ```
5. Open **`http://localhost:8000`** in your browser. The dashboard will automatically connect via WebSocket and display live data streamed from MQTT and local devices!

---

### 4. Launch Desktop App

To run the standalone Electron application:
- On Windows: double-click **`desktop-app/start-desktop.bat`**
- Or run via terminal:
  ```bash
  cd desktop-app
  npm install
  npm start
  ```

---

## 📡 MQTT Topic Reference

All MQTT messages use QoS 1 with clean topic separation:

| Topic | Direction | Payload Example | Description |
| :--- | :--- | :--- | :--- |
| `dombla/<device>/sensors/temperature` | ESP32 → Broker | `26.5` | Ambient temperature in °C |
| `dombla/<device>/sensors/humidity` | ESP32 → Broker | `62.3` | Air humidity in % |
| `dombla/<device>/sensors/soil1` | ESP32 → Broker | `45.2` | Left soil moisture % |
| `dombla/<device>/sensors/soil2` | ESP32 → Broker | `38.7` | Right soil moisture % |
| `dombla/<device>/status` | ESP32 → Broker | `online` / `offline` | Device presence (retained / LWT) |
| `dombla/<device>/pump/state` | ESP32 → Broker | `ON` / `OFF` | Confirmed water pump state |
| `dombla/<device>/pump/set` | Client → ESP32 | `ON` / `OFF` | Control command for water pump |
| `dombla/<device>/growlight/state` | ESP32 → Broker | `ON` / `OFF` | Confirmed grow light state |
| `dombla/<device>/growlight/set` | Client → ESP32 | `ON` / `OFF` | Control command for grow light |
| `dombla/<device>/diagnostics/severity` | ESP32 → Broker | `0`, `1`, or `2` | Overall health severity (0=Normal, 2=Error) |
| `dombla/<device>/diagnostics/active_fault` | ESP32 → Broker | `String` | Current active fault message |
| `dombla/<device>/diagnostics/fault_count` | ESP32 → Broker | `2` | Number of active faults |

*Default device identifier is `greenhouse1` (configurable in `config.h` and `.env`).*

---

## 🌐 Local HTTP REST API

When connected to the same local Wi-Fi network, the ESP32 serves a direct REST API on port 80:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/` | GET | Mini HTML status diagnostics page |
| `/api/status` | GET | Comprehensive JSON status, sensor telemetry, alerts, diagnostic details, and relay states |
| `/api/sensors` | GET | Current sensor readings only |
| `/api/history` | GET | 60-point rolling history buffer (~1 hour at 1 reading/min) |
| `/api/relay` | POST / GET | Toggle actuators: `/api/relay?relay=pump&state=1` |

---

## 📁 Repository Structure

```
Dombla/
├── esp32-firmware/
│   ├── platformio.ini         # PlatformIO build configuration & libraries
│   └── src/
│       ├── secrets.h          # Private credentials (gitignored)
│       ├── config.h           # Hardware pins, timings, thresholds
│       └── main.cpp           # Firmware logic (Sensors, LCD, HTTP, MQTT TLS)
├── web-dashboard/
│   ├── package.json           # Node.js dependencies (mqtt, ws, express, dotenv)
│   ├── .env.example           # Environment template for HiveMQ credentials
│   ├── server.js              # Node.js backend bridge & WebSocket server
│   ├── start-server.bat       # Quick launch batch script for server
│   ├── index.html             # Web dashboard UI
│   ├── style.css              # Discord dark theme styles
│   └── app.js                 # Frontend application & WebSocket/HTTP client
├── desktop-app/
│   ├── package.json           # Electron desktop app configuration
│   ├── main.js                # Electron main process
│   ├── preload.js             # Secure Electron preload bridge
│   ├── start-desktop.bat      # Desktop launcher
│   └── renderer/              # Desktop UI (HTML/CSS/JS)
├── WIRING.md                  # Detailed pin mappings and wiring diagram
└── README.md                  # Project documentation
```

---

## 🛠️ Calibration & Thresholds

To calibrate your soil moisture sensors for your specific soil type and probes, update `esp32-firmware/src/config.h`:

```cpp
#define SOIL_DRY_VALUE 3200 // ADC reading when dry in air
#define SOIL_WET_VALUE 1200 // ADC reading submerged in water
```

Thresholds for automatic visual alerts:
```cpp
#define TEMP_HIGH_THRESHOLD 35.0    // °C — excessive heat
#define TEMP_LOW_THRESHOLD  10.0    // °C — cold alert
#define HUMIDITY_LOW_THRESHOLD 30.0 // % — low air humidity
#define SOIL_DRY_THRESHOLD  25.0    // % — water needed
#define SOIL_WET_THRESHOLD  85.0    // % — potential overwatering
```

Thresholds for Fault Detection mechanisms:
```cpp
#define SOIL_JUMP_THRESHOLD 15.0                // Maximum valid % change per second
#define SOIL_SENSOR_DISAGREEMENT_THRESHOLD 30.0 // Maximum % difference between L and R
#define PUMP_MAX_RUNTIME_MS 15000               // 15s absolute limit for pump activity
#define WATERING_EFFECTIVENESS_THRESHOLD 3.0    // % moisture must increase after watering
```

---

## 📄 License

This project is licensed under the MIT License.
