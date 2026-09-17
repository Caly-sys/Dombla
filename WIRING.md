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

## Tips

- **DHT11**: Add a 10kΩ pull-up resistor between the DATA pin and VCC for reliable readings.
- **Soil Sensor**: GPIO 34 is an input-only pin with no internal pull-up — perfect for the analog soil sensor.
- **LCD I2C Address**: Default is `0x27`. If the display doesn't work, try `0x3F`. You can run an I2C scanner sketch to find the correct address.
- **Power**: The LCD needs 5V from the ESP32's VIN pin (USB power pass-through). All other components run on 3.3V.
- **Relay Modules**: Most relay modules are active-LOW (pull IN pin LOW to energize). The firmware handles this via `RELAY_ACTIVE_LOW` in `config.h`. If your relay triggers on HIGH, set it to `false`.
- **Relay Power**: Power the relay module VCC from the ESP32's 5V (VIN) pin, **not** 3.3V. The relay coil typically needs 5V, but the signal pin (IN) works fine with 3.3V logic from the ESP32.
- **Pump Safety**: Add a flyback diode (e.g., 1N4007) across the pump motor terminals to protect the relay from back-EMF spikes.

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
      LCD SDA  ──│ GPIO 21     │
      LCD SCL  ──│ GPIO 22     │
                  │             │
     3V3 ─────────│ 3V3    GND │───── GND (all)
     5V  ─────────│ VIN        │
                  └─────────────┘
```
