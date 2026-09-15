// ============================================================
//  Dombla — ESP32 Sensor Monitor Firmware
//  Reads DHT11 + 2x Soil Moisture, displays on LCD, serves JSON API
//
//  Arduino IDE Setup:
//    Board:  "ESP32 Dev Module"
//    Upload Speed: 115200
//    Install libs via Sketch > Include Library > Manage Libraries:
//      - DHT sensor library (by Adafruit)
//      - Adafruit Unified Sensor
//      - LiquidCrystal I2C (by Frank de Brabander)
//      - ArduinoJson (by Benoit Blanchon)
// ============================================================

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <DHT.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include "config.h"

// ── Globals ─────────────────────────────────────────────────

DHT dht(DHT_PIN, DHT_TYPE);
LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);
WebServer server(80);

// Current sensor values
float temperature   = 0.0;
float humidity      = 0.0;
float soilMoisture  = 0.0;   // percentage 0-100
int   soilRaw       = 0;

// Relay states (true = ON, false = OFF)
bool  relayGrowLight = false;
bool  relayPump      = false;

// LCD page cycling
int   lcdPage       = 0;
const int LCD_PAGES  = 3;

// Timing
unsigned long lastDHTRead  = 0;
unsigned long lastSoilRead = 0;
unsigned long lastLCDCycle = 0;
unsigned long lastHistoryRecord = 0;

// Uptime
unsigned long bootTime = 0;

// ── History Buffer ──────────────────────────────────────────

struct SensorRecord {
    float temp;
    float hum;
    float soil;
    unsigned long timestamp;  // millis since boot
};

SensorRecord history[HISTORY_SIZE];
int historyIndex = 0;
int historyCount = 0;

// ── Custom LCD Characters ───────────────────────────────────

byte thermChar[8] = {
    0b00100, 0b01010, 0b01010, 0b01010,
    0b01110, 0b11111, 0b11111, 0b01110
};

byte dropChar[8] = {
    0b00100, 0b00100, 0b01010, 0b01010,
    0b10001, 0b10001, 0b10001, 0b01110
};

byte plantChar[8] = {
    0b00100, 0b01110, 0b00100, 0b11111,
    0b00100, 0b00100, 0b01110, 0b11111
};

byte wifiChar[8] = {
    0b00000, 0b01110, 0b10001, 0b00100,
    0b01010, 0b00000, 0b00100, 0b00000
};

// ── Soil Moisture Mapping ───────────────────────────────────

float mapSoilMoisture(int rawValue) {
    // Map raw ADC value to percentage (0% = dry, 100% = wet)
    float pct = (float)(SOIL_DRY_VALUE - rawValue) /
                (float)(SOIL_DRY_VALUE - SOIL_WET_VALUE) * 100.0;
    return constrain(pct, 0.0, 100.0);
}

// ── Relay Control ───────────────────────────────────────────

void setRelay(int pin, bool on) {
    #if RELAY_ACTIVE_LOW
        digitalWrite(pin, on ? LOW : HIGH);
    #else
        digitalWrite(pin, on ? HIGH : LOW);
    #endif
}

void setGrowLight(bool on) {
    relayGrowLight = on;
    setRelay(RELAY_GROWLIGHT_PIN, on);
    Serial.println(String("Grow Light: ") + (on ? "ON" : "OFF"));
}

void setPump(bool on) {
    relayPump = on;
    setRelay(RELAY_PUMP_PIN, on);
    Serial.println(String("Water Pump: ") + (on ? "ON" : "OFF"));
}

// ── Sensor Reading ──────────────────────────────────────────

void readDHT() {
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t) && !isnan(h)) {
        temperature = t;
        humidity    = h;
    }
}

void readSoilSensors() {
    soilRaw = analogRead(SOIL_PIN);
    soilMoisture = mapSoilMoisture(soilRaw);
}

void recordHistory() {
    history[historyIndex].temp      = temperature;
    history[historyIndex].hum       = humidity;
    history[historyIndex].soil      = soilMoisture;
    history[historyIndex].timestamp = millis();

    historyIndex = (historyIndex + 1) % HISTORY_SIZE;
    if (historyCount < HISTORY_SIZE) historyCount++;
}

// ── LCD Display ─────────────────────────────────────────────

void updateLCD() {
    lcd.clear();

    switch (lcdPage) {
        case 0:  // Temperature & Humidity
            lcd.setCursor(0, 0);
            lcd.write(0);  // therm icon
            lcd.print(" Temp: ");
            lcd.print(temperature, 1);
            lcd.print((char)223);  // degree symbol
            lcd.print("C");

            lcd.setCursor(0, 1);
            lcd.write(1);  // drop icon
            lcd.print(" Hum:  ");
            lcd.print(humidity, 1);
            lcd.print("%");
            break;

        case 1:  // Soil Moisture
            lcd.setCursor(0, 0);
            lcd.write(2);  // plant icon
            lcd.print(" Soil Moisture");

            lcd.setCursor(0, 1);
            lcd.print("  ");
            lcd.print(soilMoisture, 1);
            lcd.print("% ");
            if (soilMoisture < SOIL_DRY_THRESHOLD) {
                lcd.print("[DRY!]");
            } else if (soilMoisture > SOIL_WET_THRESHOLD) {
                lcd.print("[WET!]");
            } else {
                lcd.print("[OK]");
            }
            break;

        case 2:  // WiFi Info
            lcd.setCursor(0, 0);
            lcd.write(3);  // wifi icon
            lcd.print(" WiFi ");
            lcd.print(WiFi.status() == WL_CONNECTED ? "OK" : "ERR");

            lcd.setCursor(0, 1);
            if (WiFi.status() == WL_CONNECTED) {
                lcd.print(WiFi.localIP().toString());
            } else {
                lcd.print("Connecting...");
            }
            break;
    }

    lcdPage = (lcdPage + 1) % LCD_PAGES;
}

// ── Alert Check ─────────────────────────────────────────────

String getAlerts() {
    String alerts = "";
    if (temperature > TEMP_HIGH_THRESHOLD)  alerts += "TEMP_HIGH,";
    if (temperature < TEMP_LOW_THRESHOLD)   alerts += "TEMP_LOW,";
    if (humidity < HUMIDITY_LOW_THRESHOLD)   alerts += "HUMIDITY_LOW,";
    if (soilMoisture < SOIL_DRY_THRESHOLD)  alerts += "SOIL_DRY,";
    if (soilMoisture > SOIL_WET_THRESHOLD)  alerts += "SOIL_WET,";
    if (alerts.endsWith(",")) alerts.remove(alerts.length() - 1);
    return alerts;
}

// ── CORS Headers ────────────────────────────────────────────

void sendCORS() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void handleOptions() {
    sendCORS();
    server.send(204);
}

// ── API: GET /api/status ────────────────────────────────────

void handleStatus() {
    sendCORS();

    JsonDocument doc;
    doc["device"]     = DEVICE_NAME;
    doc["uptime"]     = (millis() - bootTime) / 1000;
    doc["wifi_rssi"]  = WiFi.RSSI();
    doc["ip"]         = WiFi.localIP().toString();
    doc["mac"]        = WiFi.macAddress();
    doc["free_heap"]  = ESP.getFreeHeap();

    JsonObject sensors = doc["sensors"].to<JsonObject>();

    JsonObject dhtObj = sensors["dht11"].to<JsonObject>();
    dhtObj["temperature"] = round(temperature * 10.0) / 10.0;
    dhtObj["humidity"]    = round(humidity * 10.0) / 10.0;

    JsonObject s = sensors["soil"].to<JsonObject>();
    s["moisture"] = round(soilMoisture * 10.0) / 10.0;
    s["raw"]      = soilRaw;

    // Backward compatibility alias
    JsonObject s1 = sensors["soil1"].to<JsonObject>();
    s1["moisture"] = round(soilMoisture * 10.0) / 10.0;
    s1["raw"]      = soilRaw;

    // Relay states
    JsonObject relays = doc["relays"].to<JsonObject>();
    relays["growlight"] = relayGrowLight;
    relays["pump"]      = relayPump;

    JsonObject thresholds = doc["thresholds"].to<JsonObject>();
    thresholds["temp_high"]     = TEMP_HIGH_THRESHOLD;
    thresholds["temp_low"]      = TEMP_LOW_THRESHOLD;
    thresholds["humidity_low"]  = HUMIDITY_LOW_THRESHOLD;
    thresholds["soil_dry"]      = SOIL_DRY_THRESHOLD;
    thresholds["soil_wet"]      = SOIL_WET_THRESHOLD;

    String alertStr = getAlerts();
    if (alertStr.length() > 0) {
        JsonArray alertsArr = doc["alerts"].to<JsonArray>();
        int start = 0;
        for (int i = 0; i <= (int)alertStr.length(); i++) {
            if (i == (int)alertStr.length() || alertStr[i] == ',') {
                alertsArr.add(alertStr.substring(start, i));
                start = i + 1;
            }
        }
    } else {
        doc["alerts"].to<JsonArray>();
    }

    String output;
    serializeJson(doc, output);
    server.send(200, "application/json", output);
}

// ── API: POST /api/relay ────────────────────────────────────

void handleRelay() {
    sendCORS();

    String relay = server.arg("relay");
    String stateArg = server.arg("state");

    if (relay.length() == 0) {
        server.send(400, "application/json", "{\"error\":\"Missing 'relay' parameter (growlight|pump)\"}");
        return;
    }

    bool newState;
    if (stateArg == "1" || stateArg == "on") {
        newState = true;
    } else if (stateArg == "0" || stateArg == "off") {
        newState = false;
    } else if (stateArg == "toggle" || stateArg.length() == 0) {
        // Toggle mode
        if (relay == "growlight") newState = !relayGrowLight;
        else if (relay == "pump") newState = !relayPump;
        else {
            server.send(400, "application/json", "{\"error\":\"Unknown relay: " + relay + "\"}");
            return;
        }
    } else {
        server.send(400, "application/json", "{\"error\":\"Invalid state. Use: 0, 1, on, off, toggle\"}");
        return;
    }

    JsonDocument doc;
    doc["relay"] = relay;

    if (relay == "growlight") {
        setGrowLight(newState);
        doc["state"] = relayGrowLight;
    } else if (relay == "pump") {
        setPump(newState);
        doc["state"] = relayPump;
    } else {
        server.send(400, "application/json", "{\"error\":\"Unknown relay: " + relay + "\"}");
        return;
    }

    String output;
    serializeJson(doc, output);
    server.send(200, "application/json", output);
}

// ── API: GET /api/sensors ───────────────────────────────────

void handleSensors() {
    sendCORS();

    JsonDocument doc;
    doc["temperature"]  = round(temperature * 10.0) / 10.0;
    doc["humidity"]     = round(humidity * 10.0) / 10.0;
    doc["soil"]         = round(soilMoisture * 10.0) / 10.0;
    doc["soil_raw"]     = soilRaw;
    doc["soil1"]        = round(soilMoisture * 10.0) / 10.0;
    doc["soil1_raw"]    = soilRaw;
    doc["timestamp"]    = millis();

    String output;
    serializeJson(doc, output);
    server.send(200, "application/json", output);
}

// ── API: GET /api/history ───────────────────────────────────

void handleHistory() {
    sendCORS();

    JsonDocument doc;
    JsonArray records = doc["records"].to<JsonArray>();

    for (int i = 0; i < historyCount; i++) {
        // Read from oldest to newest
        int idx = (historyCount < HISTORY_SIZE)
                  ? i
                  : (historyIndex + i) % HISTORY_SIZE;

        JsonObject rec = records.add<JsonObject>();
        rec["temp"]      = round(history[idx].temp * 10.0) / 10.0;
        rec["hum"]       = round(history[idx].hum * 10.0) / 10.0;
        rec["soil"]      = round(history[idx].soil * 10.0) / 10.0;
        rec["soil1"]     = round(history[idx].soil * 10.0) / 10.0;
        rec["timestamp"] = history[idx].timestamp;
    }

    doc["count"] = historyCount;
    doc["max"]   = HISTORY_SIZE;

    String output;
    serializeJson(doc, output);
    server.send(200, "application/json", output);
}

// ── API: GET / (Root — simple info page) ────────────────────

void handleRoot() {
    sendCORS();
    String html = "<!DOCTYPE html><html><head><meta charset='utf-8'>"
                  "<title>Dombla</title>"
                  "<style>body{font-family:sans-serif;background:#1a1a2e;color:#e0e0e0;"
                  "display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;}"
                  ".card{background:#16213e;border-radius:16px;padding:40px;max-width:400px;"
                  "box-shadow:0 8px 32px rgba(0,0,0,.3);text-align:center;}"
                  "h1{color:#0cce6b;margin:0 0 8px;}p{color:#8892b0;margin:4px 0;}"
                  ".val{font-size:2em;color:#64ffda;font-weight:bold;}"
                  ".grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px;}"
                  ".metric{background:#0a0e27;border-radius:12px;padding:16px;}"
                  ".label{font-size:.75em;color:#8892b0;text-transform:uppercase;letter-spacing:1px;}"
                  "</style></head><body><div class='card'>"
                  "<h1>🌱 Dombla</h1><p>" + String(DEVICE_NAME) + "</p>"
                  "<div class='grid'>"
                  "<div class='metric'><div class='label'>Temp</div><div class='val'>" + String(temperature, 1) + "°</div></div>"
                  "<div class='metric'><div class='label'>Humidity</div><div class='val'>" + String(humidity, 1) + "%</div></div>"
                  "<div class='metric'><div class='label'>Soil Moisture</div><div class='val'>" + String(soilMoisture, 1) + "%</div></div>"
                  "</div>"
                  "<p style='margin-top:20px;font-size:.8em;'>API: /api/status · /api/sensors · /api/history</p>"
                  "</div></body></html>";
    server.send(200, "text/html", html);
}

// ── WiFi Setup ──────────────────────────────────────────────

void setupWiFi() {
    Serial.print("Connecting to WiFi");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.write(3);  // wifi icon
    lcd.print(" Connecting...");
    lcd.setCursor(0, 1);
    lcd.print(WIFI_SSID);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 40) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi connected!");
        Serial.print("IP: ");
        Serial.println(WiFi.localIP());

        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.write(3);
        lcd.print(" WiFi OK!");
        lcd.setCursor(0, 1);
        lcd.print(WiFi.localIP().toString());
        delay(2000);
    } else {
        Serial.println("\nWiFi connection FAILED");
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("WiFi FAILED!");
        lcd.setCursor(0, 1);
        lcd.print("Check config.h");
        delay(3000);
    }
}

// ── Setup ───────────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    Serial.println("\n=== Dombla Sensor Monitor ===");

    bootTime = millis();

    // Initialize I2C with custom pins
    Wire.begin(LCD_SDA, LCD_SCL);

    // Initialize LCD
    lcd.init();
    lcd.backlight();
    lcd.createChar(0, thermChar);
    lcd.createChar(1, dropChar);
    lcd.createChar(2, plantChar);
    lcd.createChar(3, wifiChar);

    lcd.clear();
    lcd.setCursor(2, 0);
    lcd.print("Dombla v1.0");
    lcd.setCursor(3, 1);
    lcd.print("Starting...");
    delay(1500);

    // Initialize DHT11
    dht.begin();

    // Initialize soil sensor pin
    pinMode(SOIL_PIN, INPUT);

    // Initialize relay pins (OFF at boot)
    pinMode(RELAY_GROWLIGHT_PIN, OUTPUT);
    pinMode(RELAY_PUMP_PIN, OUTPUT);
    setGrowLight(false);
    setPump(false);
    Serial.println("Relays initialized (both OFF)");

    // Connect to WiFi
    setupWiFi();

    // Setup mDNS
    if (MDNS.begin(MDNS_HOSTNAME)) {
        Serial.println("mDNS started: " + String(MDNS_HOSTNAME) + ".local");
        MDNS.addService("http", "tcp", 80);
        MDNS.addService("dombla", "tcp", 80);  // Custom service for device discovery
    }

    // Setup API routes
    server.on("/",             HTTP_GET,     handleRoot);
    server.on("/api/status",   HTTP_GET,     handleStatus);
    server.on("/api/sensors",  HTTP_GET,     handleSensors);
    server.on("/api/history",  HTTP_GET,     handleHistory);
    server.on("/api/relay",    HTTP_POST,    handleRelay);
    server.on("/api/relay",    HTTP_GET,     handleRelay);  // Allow GET for easy testing

    // CORS preflight
    server.on("/api/status",   HTTP_OPTIONS, handleOptions);
    server.on("/api/sensors",  HTTP_OPTIONS, handleOptions);
    server.on("/api/history",  HTTP_OPTIONS, handleOptions);
    server.on("/api/relay",    HTTP_OPTIONS, handleOptions);

    server.begin();
    Serial.println("HTTP server started on port 80");

    // Initial sensor reads
    readDHT();
    readSoilSensors();
    recordHistory();
}

// ── Main Loop ───────────────────────────────────────────────

void loop() {
    server.handleClient();

    unsigned long now = millis();

    // Read DHT11 every 2 seconds
    if (now - lastDHTRead >= DHT_READ_INTERVAL) {
        lastDHTRead = now;
        readDHT();
    }

    // Read soil sensors every 1 second
    if (now - lastSoilRead >= SOIL_READ_INTERVAL) {
        lastSoilRead = now;
        readSoilSensors();
    }

    // Cycle LCD display every 3 seconds
    if (now - lastLCDCycle >= LCD_CYCLE_INTERVAL) {
        lastLCDCycle = now;
        updateLCD();
    }

    // Record history every 60 seconds
    if (now - lastHistoryRecord >= 60000) {
        lastHistoryRecord = now;
        recordHistory();
    }

    // WiFi auto-reconnect
    if (WiFi.status() != WL_CONNECTED) {
        static unsigned long lastReconnect = 0;
        if (now - lastReconnect >= 30000) {
            lastReconnect = now;
            Serial.println("WiFi lost — reconnecting...");
            WiFi.disconnect();
            WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        }
    }
}
