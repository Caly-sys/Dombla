// ============================================================
//  Dombla — Web Dashboard Server & MQTT Bridge
//  Serves static files, connects to HiveMQ Cloud via MQTT over TLS,
//  and bridges MQTT messages to browser clients via WebSocket.
// ============================================================

require('dotenv').config();
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const WebSocket = require('ws');
const mqtt = require('mqtt');

const PORT = parseInt(process.env.PORT, 10) || 8000;
const MQTT_BROKER = process.env.MQTT_BROKER || '';
const MQTT_USER = process.env.MQTT_USER || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
const MQTT_DEVICE_ID = process.env.MQTT_DEVICE_ID || 'greenhouse1';

// Dashboard Access Authentication
const AUTH_USER = process.env.AUTH_USER || 'dombla';
const AUTH_PASS = process.env.AUTH_PASS || 'lomba';
const activeTokens = new Set();

function generateToken() {
    const token = crypto.randomBytes(24).toString('hex');
    activeTokens.add(token);
    return token;
}

function isValidToken(token) {
    if (!token) return false;
    return activeTokens.has(token);
}

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

// Authentication API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    if (username === AUTH_USER && password === AUTH_PASS) {
        const token = generateToken();
        console.log(`[AUTH] Successful login for user: ${username}`);
        return res.json({ ok: true, success: true, token, user: username });
    }
    console.warn(`[AUTH] Failed login attempt for user: '${username}'`);
    return res.status(401).json({ ok: false, success: false, error: 'Invalid username or password' });
});

app.get('/api/verify-auth', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : req.query.token;
    if (isValidToken(token)) {
        return res.json({ ok: true, authenticated: true, user: AUTH_USER });
    }
    return res.status(401).json({ ok: false, authenticated: false });
});

app.post('/api/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : req.query.token;
    if (token) {
        activeTokens.delete(token);
    }
    return res.json({ ok: true, success: true });
});

// REST Health / Status API
app.get('/api/bridge-status', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : req.query.token;
    const isAuth = isValidToken(token);

    res.json({
        authenticated: isAuth,
        configured: isConfigured,
        mqttConnected: mqttClient ? mqttClient.connected : false,
        deviceId: MQTT_DEVICE_ID,
        broker: isConfigured ? MQTT_BROKER.replace(/:[^:@]+@/, ':***@') : 'Not configured',
        devices: isAuth ? deviceCache : {},
        timestamp: Date.now()
    });
});

// ── HTTP & WebSocket Server ──────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

function broadcast(data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.isAuthenticated) {
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

        // Subscribe to all Dombla device sensor, status, pump, and schedule topics
        const topics = [
            'dombla/+/sensors/#',
            'dombla/+/status',
            'dombla/+/pump/state',
            'dombla/+/growlight/state',
            'dombla/+/schedules'
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
                    schedules: [],
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
            } else if (parts[2] === 'schedules') {
                try {
                    device.schedules = JSON.parse(messageStr);
                } catch (e) {
                    device.schedules = messageStr;
                }
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
wss.on('connection', (ws, req) => {
    ws.isAuthenticated = false;

    // Check token from query string (e.g. /ws?token=xyz)
    try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const token = url.searchParams.get('token');
        if (isValidToken(token)) {
            ws.isAuthenticated = true;
        }
    } catch (e) {}

    function sendInitPayload() {
        ws.send(JSON.stringify({
            type: 'init',
            authenticated: true,
            configured: isConfigured,
            mqttConnected: mqttClient ? mqttClient.connected : false,
            deviceId: MQTT_DEVICE_ID,
            devices: deviceCache
        }));
    }

    if (ws.isAuthenticated) {
        sendInitPayload();
    } else {
        ws.send(JSON.stringify({
            type: 'auth_required',
            configured: isConfigured
        }));
    }

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw.toString());

            // Handle client auth message
            if (data.type === 'auth') {
                if (isValidToken(data.token)) {
                    ws.isAuthenticated = true;
                    sendInitPayload();
                } else {
                    ws.send(JSON.stringify({
                        type: 'auth_error',
                        message: 'Invalid or expired session'
                    }));
                }
                return;
            }

            // Reject all commands if not authenticated
            if (!ws.isAuthenticated) {
                ws.send(JSON.stringify({
                    type: 'auth_error',
                    message: 'Authentication required'
                }));
                return;
            }

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

            // Handle schedule modifications from web UI
            if (data.action === 'update_schedules') {
                const targetDevice = data.deviceId || MQTT_DEVICE_ID;
                const topic = `dombla/${targetDevice}/schedules/set`;
                const payload = typeof data.schedules === 'string' ? data.schedules : JSON.stringify(data.schedules);

                if (mqttClient && mqttClient.connected) {
                    mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
                        if (err) {
                            console.error(`[MQTT] Failed to publish schedules to ${topic}:`, err.message);
                            ws.send(JSON.stringify({ type: 'command_ack', success: false, error: err.message }));
                        } else {
                            console.log(`[MQTT] Published schedules update to ${topic}`);
                            ws.send(JSON.stringify({ type: 'command_ack', success: true, topic }));
                        }
                    });
                } else {
                    ws.send(JSON.stringify({ type: 'command_ack', success: false, error: 'MQTT broker is not connected' }));
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
