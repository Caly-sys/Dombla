// ============================================================
//  Dombla — ESP32 Sensor Monitor Firmware
//  Reads DHT11 + 2x Soil Moisture, displays on LCD, serves JSON API
//  Now with MQTT remote access via HiveMQ Cloud
// ============================================================

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <DHT.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <PubSubClient.h>
#include "config.h"

// ── HiveMQ Cloud Root CA Certificate ────────────────────────
// ISRG Root X1 — Let's Encrypt root used by HiveMQ Cloud
static const char *hivemq_root_ca PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6
UA5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+s
WT8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3q
yHB5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x
+UCB5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SH
zUvKBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahm
bWnOlFuhjuefXKnEgV2he687chSOBhFhOKLg7pRO6bgfkwjGA/7t/xOHtU9XD1Ec
Q1YJmCCeMlSHF5YR2MXqhWlghJEE7VOHGIaH78QFAKxq52VqL/nfdGGwgm3GECEY
gxvlWxWFlNAflF/E0AOfrHSJwE9GQJMPMfGFB2AWw0L7CheIhDdxTBAO/Ik1DQGC
P0R+TMiCfMLAABN8oXsUSFNXnGIPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAP
BgNVHRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjAN
BgkqhkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V
9lZLubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPb
k6ZGQ3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRc
OJ/6aMYowGSwPQ0dTMQcASK3LIYdFz6EWZPEuNd9OS8nQBaG0buMcqMK/MywmFYH
NPIQR0d54rKOe1fUJv6fOg+i2Rk/MFVuKkhq5193EPCFhDLRVpt2m0EF14mBKmhb
H4SvsRuNEB9skzT2lL0iMnPMCsrP2GEJTBmxuUnhS0M7DOG2y1Jq5se1xJGBFIcz
FT3VJQHCEE2mJT7G0aNBMiSTPGCpDHazxmoHTrLiSFMAD6RAvGKTFRCMlcECWHGm
b8gJC20TJfMKVaMGx0gbKovBikDFJBB1fB0iJKk/NmGlzJM4PGw49jN9ii22+kCv
FMHCNT5aFB81V0pR8MqKL/MIv+VGpETB0MdKTv/MH7c2VFEnKuZWQgmb3KfuVGMy
Bj1c6JPMZIZgh0KyXKIC3nH6OMj8LHcNe0VFg0Mnp5lejDvZPkJpkjVtv+2MRZFK
MN10bCYv07IwE/0M0xT3IT3PLAoswm0t+Jln6yBVLsTj16VmxVxNqAFqDq8+dYBH
kz0=
-----END CERTIFICATE-----
)EOF";

// ── Globals ─────────────────────────────────────────────────

DHT dht(DHT_PIN, DHT_TYPE);
LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);
WebServer server(80);

// MQTT clients
WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);

// Current sensor values
float temperature   = 0.0;
float humidity      = 0.0;
float soilMoisture  = 0.0;   // percentage 0-100 (sensor 1)
int   soilRaw       = 0;
float soilMoisture2 = 0.0;   // percentage 0-100 (sensor 2)
int   soilRaw2      = 0;

// Relay states
bool pumpState      = false;
bool growlightState = false;

// LCD page cycling
int   lcdPage       = 0;
const int LCD_PAGES  = 4;  // Added MQTT status page

// Timing
unsigned long lastDHTRead  = 0;
unsigned long lastSoilRead = 0;
unsigned long lastLCDCycle = 0;
unsigned long lastHistoryRecord = 0;
unsigned long lastMqttPublish = 0;
unsigned long lastMqttReconnect = 0;

// MQTT connection state
bool mqttConnected = false;

// Uptime
unsigned long bootTime = 0;

// ── History Buffer ──────────────────────────────────────────

struct SensorRecord {
    float temp;
    float hum;
    float soil;
    float soil2;
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

void setPump(bool on);
void setGrowlight(bool on);

void setupRelays() {
    pinMode(RELAY_PUMP_PIN, OUTPUT);
    pinMode(RELAY_GROWLIGHT_PIN, OUTPUT);
    // Safe default: both OFF at boot
    setPump(false);
    setGrowlight(false);
}

void setPump(bool on) {
    pumpState = on;
    if (RELAY_ACTIVE_LOW) {
        digitalWrite(RELAY_PUMP_PIN, on ? LOW : HIGH);
    } else {
        digitalWrite(RELAY_PUMP_PIN, on ? HIGH : LOW);
    }
    Serial.printf("[Relay] Pump %s\n", on ? "ON" : "OFF");
}

void setGrowlight(bool on) {
    growlightState = on;
    if (RELAY_ACTIVE_LOW) {
        digitalWrite(RELAY_GROWLIGHT_PIN, on ? LOW : HIGH);
    } else {
        digitalWrite(RELAY_GROWLIGHT_PIN, on ? HIGH : LOW);
    }
    Serial.printf("[Relay] Growlight %s\n", on ? "ON" : "OFF");
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

    soilRaw2 = analogRead(SOIL_PIN_2);
    soilMoisture2 = mapSoilMoisture(soilRaw2);
}

void recordHistory() {
    history[historyIndex].temp      = temperature;
    history[historyIndex].hum       = humidity;
    history[historyIndex].soil      = soilMoisture;
    history[historyIndex].soil2     = soilMoisture2;
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

        case 1:  // Soil Moisture (sensor 1)
            lcd.setCursor(0, 0);
            lcd.write(2);  // plant icon
            lcd.print(" Soil 1");

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

        case 3:  // MQTT Status
            lcd.setCursor(0, 0);
            lcd.print("MQTT ");
            lcd.print(mqttConnected ? "Connected" : "Offline");

            lcd.setCursor(0, 1);
            lcd.print("Pump:");
            lcd.print(pumpState ? "ON " : "OFF");
            lcd.print(" S1:");
            lcd.print((int)soilMoisture);
            lcd.print("%");
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
    if (soilMoisture2 < SOIL_DRY_THRESHOLD) alerts += "SOIL2_DRY,";
    if (soilMoisture2 > SOIL_WET_THRESHOLD) alerts += "SOIL2_WET,";
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
    doc["mqtt"]       = mqttConnected;

    JsonObject sensors = doc["sensors"].to<JsonObject>();

    JsonObject dhtObj = sensors["dht11"].to<JsonObject>();
    dhtObj["temperature"] = round(temperature * 10.0) / 10.0;
    dhtObj["humidity"]    = round(humidity * 10.0) / 10.0;

    JsonObject s = sensors["soil"].to<JsonObject>();
    s["moisture"] = round(soilMoisture * 10.0) / 10.0;
    s["raw"]      = soilRaw;

    // Soil sensor 1
    JsonObject s1 = sensors["soil1"].to<JsonObject>();
    s1["moisture"] = round(soilMoisture * 10.0) / 10.0;
    s1["raw"]      = soilRaw;

    // Soil sensor 2
    JsonObject s2 = sensors["soil2"].to<JsonObject>();
    s2["moisture"] = round(soilMoisture2 * 10.0) / 10.0;
    s2["raw"]      = soilRaw2;

    // Relay states
    JsonObject relays = doc["relays"].to<JsonObject>();
    relays["pump"]      = pumpState;
    relays["growlight"] = growlightState;

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
    doc["soil2"]        = round(soilMoisture2 * 10.0) / 10.0;
    doc["soil2_raw"]    = soilRaw2;
    doc["pump"]         = pumpState;
    doc["growlight"]    = growlightState;
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
        rec["soil2"]     = round(history[idx].soil2 * 10.0) / 10.0;
        rec["timestamp"] = history[idx].timestamp;
    }

    doc["count"] = historyCount;
    doc["max"]   = HISTORY_SIZE;

    String output;
    serializeJson(doc, output);
    server.send(200, "application/json", output);
}

// ── API: POST /api/relay ────────────────────────────────────
// Local relay control endpoint (existing dashboard uses this)

void handleRelay() {
    sendCORS();

    String relay = server.arg("relay");
    String stateArg = server.arg("state");

    if (relay.length() == 0) {
        server.send(400, "application/json", "{\"error\":\"missing relay param\"}");
        return;
    }

    bool newState = (stateArg == "1" || stateArg == "true" || stateArg == "ON");

    JsonDocument doc;

    if (relay == "pump") {
        setPump(newState);
        doc["relay"] = "pump";
        doc["state"] = pumpState;
        // Publish state change to MQTT
        if (mqttClient.connected()) {
            String topic = String("dombla/") + MQTT_DEVICE_ID + "/pump/state";
            mqttClient.publish(topic.c_str(), pumpState ? "ON" : "OFF", true);
        }
    } else if (relay == "growlight") {
        setGrowlight(newState);
        doc["relay"] = "growlight";
        doc["state"] = growlightState;
    } else {
        server.send(400, "application/json", "{\"error\":\"unknown relay\"}");
        return;
    }

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
                  "<div class='metric'><div class='label'>Soil 1</div><div class='val'>" + String(soilMoisture, 1) + "%</div></div>"
                  "<div class='metric'><div class='label'>Soil 2</div><div class='val'>" + String(soilMoisture2, 1) + "%</div></div>"
                  "</div>"
                  "<p style='margin-top:20px;font-size:.8em;'>API: /api/status · /api/sensors · /api/history · /api/relay</p>"
                  "<p style='font-size:.7em;color:" + String(mqttConnected ? "#0cce6b" : "#f23f43") + ";'>MQTT: " + String(mqttConnected ? "Connected" : "Offline") + "</p>"
                  "</div></body></html>";
    server.send(200, "text/html", html);
}

// ── MQTT ────────────────────────────────────────────────────

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    String msg;
    for (unsigned int i = 0; i < length; i++) {
        msg += (char)payload[i];
    }
    msg.trim();
    msg.toUpperCase();

    String topicStr = String(topic);
    Serial.printf("[MQTT] Received: %s = %s\n", topic, msg.c_str());

    // Pump control command
    String pumpSetTopic = String("dombla/") + MQTT_DEVICE_ID + "/pump/set";
    if (topicStr == pumpSetTopic) {
        if (msg == "ON") {
            setPump(true);
        } else if (msg == "OFF") {
            setPump(false);
        } else {
            Serial.printf("[MQTT] Unknown pump command: %s\n", msg.c_str());
            return;
        }
        // Publish actual pump state back
        String stateTopic = String("dombla/") + MQTT_DEVICE_ID + "/pump/state";
        mqttClient.publish(stateTopic.c_str(), pumpState ? "ON" : "OFF", true);
    }
}

void setupMQTT() {
    espClient.setCACert(hivemq_root_ca);
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setCallback(mqttCallback);
    mqttClient.setKeepAlive(MQTT_KEEPALIVE);
    Serial.println("[MQTT] Client configured for " + String(MQTT_BROKER));
}

bool mqttReconnect() {
    if (mqttClient.connected()) {
        mqttConnected = true;
        return true;
    }

    // Don't try if WiFi is down
    if (WiFi.status() != WL_CONNECTED) {
        mqttConnected = false;
        return false;
    }

    Serial.println("[MQTT] Attempting connection...");

    // Build LWT (Last Will and Testament) topic
    String statusTopic = String("dombla/") + MQTT_DEVICE_ID + "/status";

    // Connect with LWT message
    bool connected = mqttClient.connect(
        MQTT_DEVICE_ID,         // Client ID
        MQTT_USER,              // Username
        MQTT_PASSWORD,          // Password
        statusTopic.c_str(),    // LWT topic
        1,                      // LWT QoS
        true,                   // LWT retain
        "offline"               // LWT message
    );

    if (connected) {
        mqttConnected = true;
        Serial.println("[MQTT] Connected to broker!");

        // Publish online status
        mqttClient.publish(statusTopic.c_str(), "online", true);

        // Publish initial pump state
        String pumpStateTopic = String("dombla/") + MQTT_DEVICE_ID + "/pump/state";
        mqttClient.publish(pumpStateTopic.c_str(), pumpState ? "ON" : "OFF", true);

        // Subscribe to pump control commands
        String pumpSetTopic = String("dombla/") + MQTT_DEVICE_ID + "/pump/set";
        mqttClient.subscribe(pumpSetTopic.c_str(), 1);
        Serial.println("[MQTT] Subscribed to: " + pumpSetTopic);
    } else {
        mqttConnected = false;
        Serial.printf("[MQTT] Connection failed, rc=%d\n", mqttClient.state());
    }

    return connected;
}

void mqttPublishSensors() {
    if (!mqttClient.connected()) return;

    String prefix = String("dombla/") + MQTT_DEVICE_ID + "/sensors/";

    mqttClient.publish((prefix + "temperature").c_str(), String(temperature, 1).c_str(), true);
    mqttClient.publish((prefix + "humidity").c_str(),    String(humidity, 1).c_str(), true);
    mqttClient.publish((prefix + "soil1").c_str(),       String(soilMoisture, 1).c_str(), true);
    mqttClient.publish((prefix + "soil2").c_str(),       String(soilMoisture2, 1).c_str(), true);

    Serial.println("[MQTT] Sensors published");
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
        lcd.print("Check secrets.h");
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
    lcd.print("Dombla v2.0");
    lcd.setCursor(3, 1);
    lcd.print("Starting...");
    delay(1500);

    // Initialize DHT11
    dht.begin();

    // Initialize soil sensor pins
    pinMode(SOIL_PIN, INPUT);
    pinMode(SOIL_PIN_2, INPUT);

    // Initialize relays (safe OFF state)
    setupRelays();

    // Connect to WiFi
    setupWiFi();

    // Setup MQTT
    setupMQTT();

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

    // Initial MQTT connection attempt
    mqttReconnect();
}

// ── Main Loop ───────────────────────────────────────────────

void loop() {
    server.handleClient();

    // MQTT client loop (non-blocking)
    if (mqttClient.connected()) {
        mqttClient.loop();
    }

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

    // Publish sensors via MQTT periodically
    if (now - lastMqttPublish >= MQTT_PUBLISH_INTERVAL) {
        lastMqttPublish = now;
        mqttPublishSensors();
    }

    // MQTT auto-reconnect (non-blocking, with backoff)
    if (!mqttClient.connected()) {
        mqttConnected = false;
        if (now - lastMqttReconnect >= MQTT_RECONNECT_INTERVAL) {
            lastMqttReconnect = now;
            mqttReconnect();
        }
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
