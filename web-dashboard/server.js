// ============================================================
//  Dombla — Web Dashboard Server & MQTT Bridge
//  Serves static files, connects to HiveMQ Cloud via MQTT over TLS,
//  and bridges MQTT messages to browser clients via WebSocket.
// ============================================================

require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const mqtt = require('mqtt');

const PORT = parseInt(process.env.PORT, 10) || 8000;
const MQTT_BROKER = process.env.MQTT_BROKER || '';
const MQTT_USER = process.env.MQTT_USER || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
const MQTT_DEVICE_ID = process.env.MQTT_DEVICE_ID || 'greenhouse1';

const isConfigured = Boolean(
    MQTT_BROKER &&
    !MQTT_BROKER.includes('YOUR_CLUSTER') &&
    MQTT_USER &&
    !MQTT_USER.includes('YOUR_MQTT_USERNAME')
);

// ── Express Setup ────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// Cache latest device state for quick delivery on WebSocket connection
const deviceCache = {};

// REST Health / Status API
app.get('/api/bridge-status', (req, res) => {
    res.json({
        configured: isConfigured,
        mqttConnected: mqttClient ? mqttClient.connected : false,
        deviceId: MQTT_DEVICE_ID,
        broker: isConfigured ? MQTT_BROKER.replace(/:[^:@]+@/, ':***@') : 'Not configured',
        devices: deviceCache,
        timestamp: Date.now()
    });
});

// ── HTTP & WebSocket Server ──────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

function broadcast(data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// ── MQTT Client Setup ────────────────────────────────────────
let mqttClient = null;

if (isConfigured) {
    console.log(`[MQTT] Connecting to broker: ${MQTT_BROKER}...`);

    mqttClient = mqtt.connect(MQTT_BROKER, {
        username: MQTT_USER,
        password: MQTT_PASSWORD,
        clientId: `dombla-web-bridge-${Math.random().toString(16).substring(2, 8)}`,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
        rejectUnauthorized: true // Secure TLS verification
    });

    mqttClient.on('connect', () => {
        console.log('[MQTT] Connected successfully to HiveMQ Cloud');

        // Subscribe to all Dombla device sensor, status, and pump topics
        const topics = [
            'dombla/+/sensors/#',
            'dombla/+/status',
            'dombla/+/pump/state',
            'dombla/+/growlight/state'
        ];

        mqttClient.subscribe(topics, (err) => {
            if (err) {
                console.error('[MQTT] Subscription error:', err.message);
            } else {
                console.log('[MQTT] Subscribed to topics:', topics.join(', '));
            }
        });

        broadcast({
            type: 'mqtt_status',
            connected: true,
            deviceId: MQTT_DEVICE_ID
        });
    });

    mqttClient.on('message', (topic, payload) => {
        const messageStr = payload.toString();
        const parts = topic.split('/');
        // Format: dombla/<device_id>/...
        if (parts.length >= 3 && parts[0] === 'dombla') {
            const deviceId = parts[1];
            if (!deviceCache[deviceId]) {
                deviceCache[deviceId] = {
                    deviceId,
                    sensors: {},
                    pump: false,
                    growlight: false,
                    status: 'online',
                    lastSeen: Date.now()
                };
            }

            const device = deviceCache[deviceId];
            device.lastSeen = Date.now();

            if (parts[2] === 'sensors' && parts[3]) {
                const sensorName = parts[3];
                const numericVal = parseFloat(messageStr);
                device.sensors[sensorName] = isNaN(numericVal) ? messageStr : numericVal;
            } else if (parts[2] === 'pump' && parts[3] === 'state') {
                device.pump = (messageStr.toUpperCase() === 'ON');
            } else if (parts[2] === 'growlight' && parts[3] === 'state') {
                device.growlight = (messageStr.toUpperCase() === 'ON');
            } else if (parts[2] === 'status') {
                device.status = messageStr;
            }
        }

        // Forward raw message to all connected browsers
        broadcast({
            type: 'mqtt_data',
            topic,
            payload: messageStr,
            cached: deviceCache
        });
    });

    mqttClient.on('error', (err) => {
        console.error('[MQTT] Error:', err.message);
        broadcast({
            type: 'mqtt_status',
            connected: false,
            error: err.message
        });
    });

    mqttClient.on('offline', () => {
        console.warn('[MQTT] Client went offline');
        broadcast({
            type: 'mqtt_status',
            connected: false
        });
    });

    mqttClient.on('reconnect', () => {
        console.log('[MQTT] Reconnecting to broker...');
    });
} else {
    console.log('[MQTT] HiveMQ Cloud credentials not configured in .env');
    console.log('[MQTT] Running in local dashboard mode. Fill in .env to enable remote MQTT.');
}

// ── WebSocket Client Handling ────────────────────────────────
wss.on('connection', (ws) => {
    // Send immediate initial status & cached state to newly connected client
    ws.send(JSON.stringify({
        type: 'init',
        configured: isConfigured,
        mqttConnected: mqttClient ? mqttClient.connected : false,
        deviceId: MQTT_DEVICE_ID,
        devices: deviceCache
    }));

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw.toString());

            // Handle pump relay command from web UI
            if (data.action === 'pump') {
                const targetDevice = data.deviceId || MQTT_DEVICE_ID;
                const command = data.state === true || data.state === 'ON' || data.command === 'ON' ? 'ON' : 'OFF';
                const topic = `dombla/${targetDevice}/pump/set`;

                if (mqttClient && mqttClient.connected) {
                    mqttClient.publish(topic, command, { qos: 1 }, (err) => {
                        if (err) {
                            console.error(`[MQTT] Failed to publish pump command to ${topic}:`, err.message);
                            ws.send(JSON.stringify({
                                type: 'command_ack',
                                success: false,
                                error: err.message
                            }));
                        } else {
                            console.log(`[MQTT] Published pump command '${command}' to ${topic}`);
                            ws.send(JSON.stringify({
                                type: 'command_ack',
                                success: true,
                                topic,
                                command
                            }));
                        }
                    });
                } else {
                    ws.send(JSON.stringify({
                        type: 'command_ack',
                        success: false,
                        error: 'MQTT broker is not connected'
                    }));
                }
            }

            // Handle growlight relay command from web UI if requested
            if (data.action === 'growlight') {
                const targetDevice = data.deviceId || MQTT_DEVICE_ID;
                const command = data.state === true || data.state === 'ON' || data.command === 'ON' ? 'ON' : 'OFF';
                const topic = `dombla/${targetDevice}/growlight/set`;

                if (mqttClient && mqttClient.connected) {
                    mqttClient.publish(topic, command, { qos: 1 });
                }
            }
        } catch (err) {
            console.warn('[WS] Failed to parse client message:', err.message);
        }
    });
});

// ── Start Server ─────────────────────────────────────────────
server.listen(PORT, () => {
    console.log('====================================================');
    console.log('  Dombla Web Dashboard & MQTT Bridge');
    console.log('====================================================');
    console.log(`  Local URL:      http://localhost:${PORT}`);
    console.log(`  WebSocket URL:  ws://localhost:${PORT}/ws`);
    console.log(`  MQTT Remote:    ${isConfigured ? 'Enabled' : 'Disabled (fill in .env)'}`);
    if (isConfigured) {
        console.log(`  MQTT Broker:    ${MQTT_BROKER}`);
        console.log(`  Target Device:  ${MQTT_DEVICE_ID}`);
    }
    console.log('====================================================');
});
