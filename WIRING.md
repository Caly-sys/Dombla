# 🔌 Dombla — Wiring Reference

## Pin Connections

| Component       | Pin  | ESP32 Pin   | Notes                        |
| --------------- | ---- | ----------- | ---------------------------- |
| 🌡️ **DHT11**   | VCC  | **3V3**     | 3.3V power                   |
|                 | DATA | **GPIO 4**  | Add 10kΩ pull-up to 3V3      |
|                 | GND  | **GND**     |                              |
| 🌱 **Soil Moisture 1** | VCC  | **3V3**     | 3.3V power                   |
|                 | AO   | **GPIO 34** | Analog input (ADC1_CH6)      |
|                 | GND  | **GND**     |                              |
| 🌱 **Soil Moisture 2** | VCC  | **3V3**     | 3.3V power                   |
|                 | AO   | **GPIO 35** | Analog input (ADC1_CH7)      |
|                 | GND  | **GND**     |                              |
| 📺 **LCD I2C**  | VCC  | **5V**      | ⚡ Needs 5V (VIN pin)        |
|                 | GND  | **GND**     |                              |
|                 | SDA  | **GPIO 21** | I2C Data                     |
|                 | SCL  | **GPIO 22** | I2C Clock                    |
| 💡 **Relay: Grow Light** | IN | **GPIO 14** | Active-LOW relay module |
|                 | VCC  | **5V**      | ⚡ Relay module needs 5V     |
|                 | GND  | **GND**     |                              |
| 💧 **Relay: Water Pump** | IN | **GPIO 27** | Active-LOW relay module |
|                 | VCC  | **5V**      | ⚡ Relay module needs 5V     |
|                 | GND  | **GND**     |                              |
| 🔘 **Button: Water Pump** | VCC | **3V3** | 3.3V power               |
|                 | GND  | **GND**     |                              |
|                 | OUT  | **GPIO 25** | HIGH when pressed            |
| 🔘 **Button: Grow Light** | VCC | **3V3** | 3.3V power               |
|                 | GND  | **GND**     |                              |
|                 | OUT  | **GPIO 26** | HIGH when pressed            |

## Push-Button Module Wiring Detail

Each 3-pin push-button module has three pins: **VCC**, **GND**, and **OUT**.

### Water Pump Button

| Button Pin | → | ESP32 Pin   |
| ---------- | - | ----------- |
| VCC        | → | **3V3**     |
| GND        | → | **GND**     |
| OUT        | → | **GPIO 25** |

### Grow Light Button

| Button Pin | → | ESP32 Pin   |
| ---------- | - | ----------- |
| VCC        | → | **3V3**     |
| GND        | → | **GND**     |
| OUT        | → | **GPIO 26** |

Press a button once to toggle its relay ON/OFF. The firmware debounces the signal (~40 ms) and only triggers once per press — holding the button does NOT repeat the toggle.

## Tips

- **DHT11**: Add a 10kΩ pull-up resistor between the DATA pin and VCC for reliable readings.
- **Soil Sensor**: GPIO 34 is an input-only pin with no internal pull-up — perfect for the analog soil sensor.
- **LCD I2C Address**: Default is `0x27`. If the display doesn't work, try `0x3F`. You can run an I2C scanner sketch to find the correct address.
- **Power**: The LCD needs 5V from the ESP32's VIN pin (USB power pass-through). All other components run on 3.3V.
- **Relay Modules**: Most relay modules are active-LOW (pull IN pin LOW to energize). The firmware handles this via `RELAY_ACTIVE_LOW` in `config.h`. If your relay triggers on HIGH, set it to `false`.
- **Relay Power**: Power the relay module VCC from the ESP32's 5V (VIN) pin, **not** 3.3V. The relay coil typically needs 5V, but the signal pin (IN) works fine with 3.3V logic from the ESP32.
- **Pump Safety**: Add a flyback diode (e.g., 1N4007) across the pump motor terminals to protect the relay from back-EMF spikes.
- **Push-Button Modules**: The 3-pin modules output HIGH when pressed and LOW when idle. The ESP32 pins are configured with internal pull-down resistors. These modules are powered from the ESP32's 3.3V rail.
- **Startup Defaults**: On boot, the Water Pump starts **OFF** (safe default) and the Grow Light starts **ON**. Pin registers are pre-written before enabling outputs to prevent active-LOW startup glitching, and buttons have a 1-second boot settling lockout.
- **🚨 Fault Detection Safeties**: The firmware continuously monitors for hardware faults. If the soil sensor jumps erratically, the DHT11 disconnects, or the pump runs for more than 15 seconds consecutively, the system will raise an alert and automatically shut down the pump to prevent flooding.

## ⚠️ Mains Voltage Safety Notice

> **This wiring guide only covers the low-voltage ESP32 control side (3.3V / 5V logic).**
>
> If your water pump or grow light operates on **mains voltage (110V / 220V AC)**, the relay's high-voltage switching side must use an **appropriately rated, enclosed relay module** designed for mains loads.
>
> **Do NOT** connect mains AC wiring based on this guide alone. Mains wiring must be performed by a **qualified adult or licensed electrician** in compliance with local electrical codes.

## Wiring Diagram (ASCII)

```
                    ESP32 DevKit
                  ┌─────────────┐
                  │             │
    DHT11 DATA ──│ GPIO 4      │
                  │             │
      Soil 1 AO ──│ GPIO 34     │
      Soil 2 AO ──│ GPIO 35     │
                  │             │
   Grow Light  ──│ GPIO 14     │── Relay IN (grow light)
   Water Pump  ──│ GPIO 27     │── Relay IN (pump)
                  │             │
  Pump Btn OUT ──│ GPIO 25     │── Button (pump toggle)
  Light Btn OUT──│ GPIO 26     │── Button (growlight toggle)
                  │             │
      LCD SDA  ──│ GPIO 21     │
      LCD SCL  ──│ GPIO 22     │
                  │             │
     3V3 ─────────│ 3V3    GND │───── GND (all)
     5V  ─────────│ VIN        │
                  └─────────────┘

  Button Modules (×2):          Relay Modules (×2):
  ┌──────────┐                  ┌──────────┐
  │  VCC ────│── 3V3            │  VCC ────│── 5V (VIN)
  │  GND ────│── GND            │  GND ────│── GND
  │  OUT ────│── GPIO 25 / 26   │   IN ────│── GPIO 14 / 27
  └──────────┘                  └──────────┘
```
