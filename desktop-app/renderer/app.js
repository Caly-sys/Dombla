// ============================================================
//  Dombla — Web Dashboard Application Logic
//  Connects to ESP32 devices, polls sensor data, renders charts
//  Discord palette and clean SVG aesthetics (Zero Emojis)
// ============================================================

(() => {
    'use strict';

    // ── State ───────────────────────────────────────────────
    const state = {
        devices: [],            // [{ ip, name, online }]
        activeDevice: null,     // Currently selected device IP or 'mqtt'
        pollInterval: null,     // Polling timer ID
        pollRate: 5000,         // Poll every 5 seconds
        lastData: null,         // Last fetched data from /api/status
        charts: {
            climate: null,
            soil: null
        },
        relays: {
            growlight: false,
            pump: false
        },
        schedules: [],
        clock: {
            time: null,
            date: null,
            synced: false,
            lastReceivedAt: null
        },
        clockTimer: null,
        editingScheduleId: null,
        mqtt: {
            ws: null,
            configured: false,
            connected: false,
            deviceId: 'greenhouse1',
            lastData: null,
            reconnectTimer: null
        }
    };

    // ── DOM References ──────────────────────────────────────
    const $ = (id) => document.getElementById(id);

    const dom = {
        statusDot:       $('status-dot'),
        statusText:      $('status-text'),
        mqttStatus:      $('mqtt-status'),
        mqttStatusDot:   $('mqtt-status-dot'),
        mqttStatusText:  $('mqtt-status-text'),
        dataSourceBadge: $('data-source-badge'),
        deviceInput:     $('device-ip-input'),
        btnAddDevice:    $('btn-add-device'),
        btnRefresh:      $('btn-refresh'),
        deviceChips:     $('device-chips'),
        alertsPanel:     $('alerts-panel'),
        lastUpdate:      $('last-update'),
        emptyState:      $('empty-state'),
        sensorGrid:      $('sensor-grid'),
        relayWrapper:    $('relay-wrapper'),
        relayCardGrowlight: $('relay-card-growlight'),
        btnRelayGrowlight:  $('btn-relay-growlight'),
        relayStateGrowlight: $('relay-state-growlight'),
        relayCardPump:    $('relay-card-pump'),
        btnRelayPump:     $('btn-relay-pump'),
        relayStatePump:   $('relay-state-pump'),

        // Schedules & Clock
        schedulesWrapper:      $('schedules-wrapper'),
        schedulesGrid:         $('schedules-grid'),
        schedulesEmpty:        $('schedules-empty'),
        espClockBadge:         $('esp-clock-badge'),
        espClockTime:          $('esp-clock-time'),
        clockStatusDot:        $('clock-status-dot'),
        btnAddSchedule:        $('btn-add-schedule'),

        // Schedule Modal
        scheduleModalOverlay:  $('schedule-modal-overlay'),
        scheduleModalCard:     $('schedule-modal-card'),
        scheduleModalTitle:    $('schedule-modal-title'),
        scheduleForm:          $('schedule-form'),
        schId:                 $('sch-id'),
        schName:               $('sch-name'),
        schDevice:             $('sch-device'),
        schMode:               $('sch-mode'),
        schTimesContainer:     $('sch-times-container'),
        schOnGroup:            $('sch-on-group'),
        schOffGroup:           $('sch-off-group'),
        schOnLabel:            $('sch-on-label'),
        schOffLabel:           $('sch-off-label'),
        schOnTime:             $('sch-on-time'),
        schOffTime:            $('sch-off-time'),
        daysSelector:          $('days-selector'),
        schEnabled:            $('sch-enabled'),
        btnCancelSchedule:     $('btn-cancel-schedule'),
        btnCloseScheduleModal: $('btn-close-schedule-modal'),

        chartsGrid:      $('charts-grid'),
        infoGrid:        $('info-grid'),
        toastContainer:  $('toast-container'),
        // Sensor values
        valTemp:         $('val-temp'),
        valHumidity:     $('val-humidity'),
        valSoil1:        $('val-soil1'),
        valSoil2:        $('val-soil2'),
        // Status badges
        statusTemp:      $('status-temp'),
        statusHumidity:  $('status-humidity'),
        statusSoil1:     $('status-soil1'),
        statusSoil2:     $('status-soil2'),
        // Gauges
        gaugeSoil1:      $('gauge-soil1'),
        gaugeSoil2:      $('gauge-soil2'),
        // Info values
        infoIp:          $('info-ip'),
        infoMac:         $('info-mac'),
        infoRssi:        $('info-rssi'),
        infoName:        $('info-name'),
        infoUptime:      $('info-uptime'),
        infoHeap:        $('info-heap'),
        infoTempRange:   $('info-temp-range'),
        infoHumMin:      $('info-hum-min'),
        infoSoilRange:   $('info-soil-range'),
    };

    // ── LocalStorage ────────────────────────────────────────
    const STORAGE_KEY = 'dombla_devices';

    function loadDevices() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                state.devices = JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Failed to load saved devices:', e);
        }
    }

    function saveDevices() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.devices));
    }

    // ── Toast Notifications (No Emojis, Clean SVG) ──────────
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
            error: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
            warning: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
        };

        toast.innerHTML = `<span class="toast-icon">${icons[type] || ''}</span> <span>${message}</span>`;
        dom.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('leaving');
            setTimeout(() => toast.remove(), 260);
        }, 3200);
    }

    // ── Device Management ───────────────────────────────────
    function addDevice(ip) {
        ip = ip.trim();
        if (!ip) return;

        // Strip protocol and trailing slash
        ip = ip.replace(/^https?:\/\//, '').replace(/\/+$/, '');

        // Check for duplicates
        if (state.devices.find(d => d.ip === ip)) {
            showToast(`Device ${ip} is already added`, 'warning');
            return;
        }

        const device = { ip, name: ip, online: false };
        state.devices.push(device);
        saveDevices();

        // Auto-select if first device
        if (!state.activeDevice) {
            selectDevice(ip);
        }

        renderDeviceChips();
        showToast(`Device ${ip} registered`, 'success');
        dom.deviceInput.value = '';
    }

    function removeDevice(ip) {
        state.devices = state.devices.filter(d => d.ip !== ip);
        saveDevices();

        if (state.activeDevice === ip) {
            state.activeDevice = state.devices.length > 0 ? state.devices[0].ip : null;
            if (state.activeDevice) {
                selectDevice(state.activeDevice);
            } else {
                stopPolling();
                resetUI();
            }
        }

        renderDeviceChips();
        showToast(`Device removed`, 'warning');
    }

    function selectDevice(ip) {
        state.activeDevice = ip;
        renderDeviceChips();
        updateDataSourceBadge('local');
        startPolling();
        fetchData(); // Immediate fetch
    }

    function selectMqttDevice() {
        state.activeDevice = 'mqtt';
        stopPolling();
        renderDeviceChips();
        updateDataSourceBadge('remote');
        if (state.mqtt.lastData) {
            updateSensorCards(state.mqtt.lastData);
            updateRelayStates(state.mqtt.lastData);
            updateInfoPanel(state.mqtt.lastData);
        }
        updateConnectionStatus(state.mqtt.connected, `MQTT (${state.mqtt.deviceId})`);
    }

    function updateDataSourceBadge(mode) {
        if (!dom.dataSourceBadge) return;
        dom.dataSourceBadge.style.display = 'inline-flex';
        if (mode === 'remote') {
            dom.dataSourceBadge.textContent = 'MQTT Remote';
            dom.dataSourceBadge.className = 'source-badge remote';
        } else {
            dom.dataSourceBadge.textContent = 'Local HTTP';
            dom.dataSourceBadge.className = 'source-badge';
        }
    }

    function renderDeviceChips() {
        dom.deviceChips.innerHTML = '';
        state.devices.forEach(device => {
            const chip = document.createElement('div');
            chip.className = `device-chip ${device.ip === state.activeDevice ? 'active' : ''}`;
            chip.innerHTML = `
                <span class="status-dot ${device.online ? 'online' : ''}" style="width:6px;height:6px;"></span>
                <span>${device.name}</span>
                <button class="remove-btn" title="Remove device" aria-label="Remove device">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            `;
            chip.querySelector('.remove-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                removeDevice(device.ip);
            });
            chip.addEventListener('click', () => selectDevice(device.ip));
            dom.deviceChips.appendChild(chip);
        });

        // Add MQTT remote device chip if configured
        if (state.mqtt && state.mqtt.configured) {
            const mqttChip = document.createElement('div');
            const isMqttActive = (state.activeDevice === 'mqtt' || (!state.activeDevice && state.mqtt.connected));
            mqttChip.className = `device-chip ${isMqttActive ? 'active' : ''}`;
            mqttChip.innerHTML = `
                <span class="status-dot ${state.mqtt.connected ? 'mqtt-active' : ''}" style="width:6px;height:6px;"></span>
                <span>MQTT: ${state.mqtt.deviceId}</span>
            `;
            mqttChip.addEventListener('click', () => selectMqttDevice());
            dom.deviceChips.appendChild(mqttChip);
        }

        updateVisibility();
    }

    function updateVisibility() {
        const hasDevices = state.devices.length > 0 || (state.mqtt && (state.mqtt.configured || state.mqtt.lastData));
        dom.emptyState.classList.toggle('hidden', hasDevices);
        dom.sensorGrid.classList.toggle('hidden', !hasDevices);
        if (dom.relayWrapper) dom.relayWrapper.classList.toggle('hidden', !hasDevices);
        if (dom.schedulesWrapper) dom.schedulesWrapper.classList.toggle('hidden', !hasDevices);
        dom.chartsGrid.classList.toggle('hidden', !hasDevices);
        dom.infoGrid.classList.toggle('hidden', !hasDevices);
    }

    // ── Data Fetching ───────────────────────────────────────
    async function fetchData() {
        if (!state.activeDevice || state.activeDevice === 'mqtt') return;

        const device = state.devices.find(d => d.ip === state.activeDevice);
        if (!device) return;

        try {
            const url = `http://${device.ip}/api/status`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            state.lastData = data;

            // Update device status
            device.online = true;
            device.name = data.device || device.ip;

            updateSensorCards(data);
            updateInfoPanel(data);
            updateAlerts(data);
            updateRelayStates(data);
            if (data.time) {
                updateClockState(data.time);
            }
            updateConnectionStatus(true, device.name);
            updateDataSourceBadge('local');

            // Fetch history for charts and automation schedules
            fetchHistory();
            fetchSchedules();

            renderDeviceChips();
        } catch (err) {
            console.warn('Fetch failed:', err.message);
            if (device) device.online = false;
            updateConnectionStatus(false);
            renderDeviceChips();
        }
    }

    async function fetchSchedules() {
        if (!state.activeDevice || state.activeDevice === 'mqtt') return;

        try {
            const url = `http://${state.activeDevice}/api/schedules`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);

            if (!response.ok) return;

            const data = await response.json();
            if (Array.isArray(data.schedules)) {
                state.schedules = data.schedules;
                renderSchedules();
            }
            if (data.time) {
                updateClockState({ current: data.time, synced: data.synced, date: data.date });
            }
        } catch (err) {
            console.warn('Schedules fetch failed:', err.message);
        }
    }

    async function fetchHistory() {
        if (!state.activeDevice) return;

        try {
            const url = `http://${state.activeDevice}/api/history`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);

            const data = await response.json();
            updateCharts(data.records || []);
        } catch (err) {
            console.warn('History fetch failed:', err.message);
        }
    }

    // ── Polling ─────────────────────────────────────────────
    function startPolling() {
        stopPolling();
        state.pollInterval = setInterval(fetchData, state.pollRate);
    }

    function stopPolling() {
        if (state.pollInterval) {
            clearInterval(state.pollInterval);
            state.pollInterval = null;
        }
    }

    // ── UI Updates ──────────────────────────────────────────

    function updateSensorCards(data) {
        const sensors = data.sensors || {};
        const dht = sensors.dht11 || {};
        const thresholds = data.thresholds || {};

        // Temperature
        dom.valTemp.innerHTML = `${dht.temperature ?? '--'}<span class="sensor-unit">°C</span>`;
        updateStatus(dom.statusTemp, dht.temperature, thresholds.temp_low, thresholds.temp_high, 'range');

        // Humidity
        dom.valHumidity.innerHTML = `${dht.humidity ?? '--'}<span class="sensor-unit">%</span>`;
        updateStatus(dom.statusHumidity, dht.humidity, thresholds.humidity_low, 100, 'min');

        // Soil Monitor 1 (soil1)
        const s1 = sensors.soil1 || sensors.soil || {};
        const soil1Val = s1.moisture;
        if (dom.valSoil1) {
            dom.valSoil1.innerHTML = `${soil1Val ?? '--'}<span class="sensor-unit">%</span>`;
        }
        if (dom.statusSoil1) {
            updateStatus(dom.statusSoil1, soil1Val, thresholds.soil_dry, thresholds.soil_wet, 'range');
        }
        if (dom.gaugeSoil1) {
            dom.gaugeSoil1.style.width = `${Math.min(soil1Val || 0, 100)}%`;
        }

        // Soil Monitor 2 (soil2)
        const s2 = sensors.soil2 || {};
        const soil2Val = s2.moisture;
        if (dom.valSoil2) {
            dom.valSoil2.innerHTML = `${soil2Val ?? '--'}<span class="sensor-unit">%</span>`;
        }
        if (dom.statusSoil2) {
            updateStatus(dom.statusSoil2, soil2Val, thresholds.soil_dry, thresholds.soil_wet, 'range');
        }
        if (dom.gaugeSoil2) {
            dom.gaugeSoil2.style.width = `${Math.min(soil2Val || 0, 100)}%`;
        }

        // Last update time
        const now = new Date();
        dom.lastUpdate.textContent = `Updated ${now.toLocaleTimeString()}`;
    }

    function updateStatus(el, value, low, high, mode) {
        if (value == null || isNaN(value)) {
            el.textContent = 'No data';
            el.className = 'sensor-status';
            return;
        }

        if (mode === 'range') {
            if (value < low) {
                el.textContent = 'Too Low';
                el.className = 'sensor-status danger';
            } else if (value > high) {
                el.textContent = 'Too High';
                el.className = 'sensor-status warning';
            } else {
                el.textContent = 'Optimal';
                el.className = 'sensor-status ok';
            }
        } else if (mode === 'min') {
            if (value < low) {
                el.textContent = 'Too Low';
                el.className = 'sensor-status danger';
            } else {
                el.textContent = 'Optimal';
                el.className = 'sensor-status ok';
            }
        }
    }

    function updateInfoPanel(data) {
        dom.infoIp.textContent = data.ip || '—';
        dom.infoMac.textContent = data.mac || '—';
        dom.infoRssi.textContent = data.wifi_rssi ? `${data.wifi_rssi} dBm` : '—';
        dom.infoName.textContent = data.device || '—';
        dom.infoUptime.textContent = data.uptime != null ? formatUptime(data.uptime) : '—';
        dom.infoHeap.textContent = data.free_heap != null ? `${(data.free_heap / 1024).toFixed(1)} KB` : '—';

        const th = data.thresholds || {};
        dom.infoTempRange.textContent = (th.temp_low != null && th.temp_high != null)
            ? `${th.temp_low}° – ${th.temp_high}°C`
            : '—';
        dom.infoHumMin.textContent = th.humidity_low != null ? `${th.humidity_low}%` : '—';
        dom.infoSoilRange.textContent = (th.soil_dry != null && th.soil_wet != null)
            ? `${th.soil_dry}% – ${th.soil_wet}%`
            : '—';
    }

    function updateAlerts(data) {
        const alerts = data.alerts || [];
        dom.alertsPanel.innerHTML = '';

        if (alerts.length === 0) return;

        const alertSvg = {
            danger: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
            warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
        };

        const alertMap = {
            'TEMP_HIGH':    { text: 'Temperature is above threshold', type: 'danger' },
            'TEMP_LOW':     { text: 'Temperature is below threshold', type: 'warning' },
            'HUMIDITY_LOW': { text: 'Air humidity is below threshold', type: 'warning' },
            'SOIL_DRY':     { text: 'Soil 1 moisture is dry', type: 'danger' },
            'SOIL_WET':     { text: 'Soil 1 moisture is overwatered', type: 'warning' },
            'SOIL1_DRY':    { text: 'Soil 1 moisture is dry', type: 'danger' },
            'SOIL1_WET':    { text: 'Soil 1 moisture is overwatered', type: 'warning' },
            'SOIL2_DRY':    { text: 'Soil 2 moisture is dry', type: 'danger' },
            'SOIL2_WET':    { text: 'Soil 2 moisture is overwatered', type: 'warning' },
        };

        alerts.forEach(alert => {
            const info = alertMap[alert] || { text: alert, type: 'warning' };
            const iconSvg = alertSvg[info.type] || alertSvg.warning;
            const item = document.createElement('div');
            item.className = `alert-item ${info.type}`;
            item.innerHTML = `
                <span class="alert-icon">${iconSvg}</span>
                <span class="alert-text">${info.text}</span>
                <span class="alert-time">${new Date().toLocaleTimeString()}</span>
            `;
            dom.alertsPanel.appendChild(item);
        });
    }

    function updateConnectionStatus(online, name) {
        dom.statusDot.className = `status-dot ${online ? 'online' : ''}`;
        dom.statusText.textContent = online
            ? `Connected: ${name || 'ESP32 Device'}`
            : 'Disconnected';
    }

    function resetUI() {
        dom.valTemp.innerHTML = '--<span class="sensor-unit">°C</span>';
        dom.valHumidity.innerHTML = '--<span class="sensor-unit">%</span>';
        if (dom.valSoil1) dom.valSoil1.innerHTML = '--<span class="sensor-unit">%</span>';
        if (dom.valSoil2) dom.valSoil2.innerHTML = '--<span class="sensor-unit">%</span>';
        if (dom.gaugeSoil1) dom.gaugeSoil1.style.width = '0%';
        if (dom.gaugeSoil2) dom.gaugeSoil2.style.width = '0%';
        dom.lastUpdate.textContent = '—';
        dom.alertsPanel.innerHTML = '';
        updateConnectionStatus(false);
        updateVisibility();

        ['statusTemp', 'statusHumidity', 'statusSoil1', 'statusSoil2'].forEach(key => {
            if (dom[key]) {
                dom[key].textContent = 'Waiting';
                dom[key].className = 'sensor-status ok';
            }
        });

        ['infoIp', 'infoMac', 'infoRssi', 'infoName', 'infoUptime', 'infoHeap',
         'infoTempRange', 'infoHumMin', 'infoSoilRange'].forEach(key => {
            dom[key].textContent = '—';
        });
    }

    // ── Charts (Discord Dark Palette) ───────────────────────

    const chartDefaults = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    color: '#dbdee1',
                    font: { family: "'Inter', sans-serif", size: 11, weight: '500' },
                    boxWidth: 10,
                    boxHeight: 10,
                    useBorderRadius: true,
                    borderRadius: 3,
                    padding: 14,
                }
            },
            tooltip: {
                backgroundColor: '#111214',
                titleColor: '#f2f3f5',
                bodyColor: '#dbdee1',
                borderColor: '#383a40',
                borderWidth: 1,
                cornerRadius: 6,
                padding: 10,
                titleFont: { family: "'Inter', sans-serif", weight: '600' },
                bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
            }
        },
        scales: {
            x: {
                display: true,
                grid: { color: 'rgba(255, 255, 255, 0.04)', drawBorder: false },
                ticks: {
                    color: '#949ba4',
                    font: { family: "'JetBrains Mono', monospace", size: 10 },
                    maxTicksLimit: 10,
                },
                border: { display: false },
            },
            y: {
                display: true,
                grid: { color: 'rgba(255, 255, 255, 0.04)', drawBorder: false },
                ticks: {
                    color: '#949ba4',
                    font: { family: "'JetBrains Mono', monospace", size: 10 },
                },
                border: { display: false },
            }
        },
        elements: {
            point: { radius: 2, hoverRadius: 5, borderWidth: 2, backgroundColor: '#2b2d31' },
            line: { tension: 0.35, borderWidth: 2 },
        }
    };

    function initCharts() {
        // Climate chart (temp + humidity in Discord Red + Blurple)
        const climateCtx = $('chart-climate').getContext('2d');
        state.charts.climate = new Chart(climateCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Temperature (°C)',
                        data: [],
                        borderColor: '#f23f43',
                        backgroundColor: 'rgba(242, 63, 67, 0.08)',
                        fill: true,
                    },
                    {
                        label: 'Humidity (%)',
                        data: [],
                        borderColor: '#5865f2',
                        backgroundColor: 'rgba(88, 101, 242, 0.08)',
                        fill: true,
                    }
                ]
            },
            options: {
                ...chartDefaults,
                scales: {
                    ...chartDefaults.scales,
                    y: {
                        ...chartDefaults.scales.y,
                        suggestedMin: 0,
                        suggestedMax: 50,
                    }
                }
            }
        });

        // Soil chart (Soil Moisture in Discord Green)
        const soilCtx = $('chart-soil').getContext('2d');
        state.charts.soil = new Chart(soilCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Soil Moisture (%)',
                        data: [],
                        borderColor: '#23a55a',
                        backgroundColor: 'rgba(35, 165, 90, 0.08)',
                        fill: true,
                    }
                ]
            },
            options: {
                ...chartDefaults,
                scales: {
                    ...chartDefaults.scales,
                    y: {
                        ...chartDefaults.scales.y,
                        min: 0,
                        max: 100,
                    }
                }
            }
        });
    }

    function updateCharts(records) {
        if (!records || records.length === 0) return;

        const labels = records.map((r, i) => {
            const mins = Math.round((records[records.length - 1].timestamp - r.timestamp) / 60000);
            return mins > 0 ? `-${mins}m` : 'now';
        });

        // Climate chart
        state.charts.climate.data.labels = labels;
        state.charts.climate.data.datasets[0].data = records.map(r => r.temp);
        state.charts.climate.data.datasets[1].data = records.map(r => r.hum);
        state.charts.climate.update('none');

        // Soil chart
        state.charts.soil.data.labels = labels;
        state.charts.soil.data.datasets[0].data = records.map(r => r.soil ?? r.soil1);
        state.charts.soil.update('none');
    }

    // ── Helpers ──────────────────────────────────────────────

    function formatUptime(seconds) {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;

        if (d > 0) return `${d}d ${h}h ${m}m`;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    }

    // ── Event Listeners ─────────────────────────────────────

    function bindEvents() {
        // Add device
        dom.btnAddDevice.addEventListener('click', () => {
            addDevice(dom.deviceInput.value);
        });

        dom.deviceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                addDevice(dom.deviceInput.value);
            }
        });

        // Manual refresh
        dom.btnRefresh.addEventListener('click', () => {
            fetchData();
            showToast('Refreshing sensor data...', 'success');
        });

        // Grow Light relay toggle
        if (dom.btnRelayGrowlight) {
            dom.btnRelayGrowlight.addEventListener('click', () => toggleRelay('growlight'));
        }

        // Water Pump relay toggle
        if (dom.btnRelayPump) {
            dom.btnRelayPump.addEventListener('click', () => toggleRelay('pump'));
        }

        // Schedules Modal & UI triggers
        if (dom.btnAddSchedule) {
            dom.btnAddSchedule.addEventListener('click', () => openScheduleModal());
        }
        if (dom.btnCloseScheduleModal) {
            dom.btnCloseScheduleModal.addEventListener('click', closeScheduleModal);
        }
        if (dom.btnCancelSchedule) {
            dom.btnCancelSchedule.addEventListener('click', closeScheduleModal);
        }
        if (dom.scheduleModalOverlay) {
            dom.scheduleModalOverlay.addEventListener('click', (e) => {
                if (e.target === dom.scheduleModalOverlay) {
                    closeScheduleModal();
                }
            });
        }
        if (dom.schMode) {
            dom.schMode.addEventListener('change', updateScheduleFormModeUI);
        }

        // Day presets buttons
        document.querySelectorAll('.days-presets .btn-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                applyDayPreset(btn.getAttribute('data-preset'));
            });
        });

        // Day chips selection
        document.querySelectorAll('.days-selector .day-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                chip.classList.toggle('active');
                updateActivePresetButton();
            });
        });

        // Schedule Form submit
        if (dom.scheduleForm) {
            dom.scheduleForm.addEventListener('submit', (e) => {
                e.preventDefault();
                saveScheduleFromForm();
            });
        }
    }

    // ── Relay Control ───────────────────────────────────────

    async function toggleRelay(relayName) {
        state.relays[relayName] = !state.relays[relayName];
        const isOn = state.relays[relayName];

        // Update UI immediately for responsiveness
        updateRelayUI(relayName, isOn);

        const label = relayName === 'growlight' ? 'Grow Light' : 'Water Pump';
        showToast(`${label} turned ${isOn ? 'ON' : 'OFF'}`, isOn ? 'success' : 'warning');

        // Check if we should route directly via MQTT WebSocket
        const isMqttMode = (state.activeDevice === 'mqtt' || (!state.activeDevice && state.mqtt.connected));
        if (isMqttMode && state.mqtt.ws && state.mqtt.ws.readyState === WebSocket.OPEN) {
            state.mqtt.ws.send(JSON.stringify({
                action: relayName,
                deviceId: state.mqtt.deviceId,
                state: isOn ? 'ON' : 'OFF'
            }));
            return;
        }

        // Send command to ESP32 via HTTP
        if (state.activeDevice && state.activeDevice !== 'mqtt') {
            try {
                const resp = await fetch(
                    `http://${state.activeDevice}/api/relay?relay=${relayName}&state=${isOn ? 1 : 0}`,
                    { method: 'POST' }
                );
                if (resp.ok) {
                    const result = await resp.json();
                    state.relays[relayName] = result.state;
                    updateRelayUI(relayName, result.state);
                }
            } catch (err) {
                console.warn('Relay HTTP command failed:', err.message);
                // Fallback to MQTT if connected
                if (state.mqtt.ws && state.mqtt.ws.readyState === WebSocket.OPEN) {
                    state.mqtt.ws.send(JSON.stringify({
                        action: relayName,
                        deviceId: state.mqtt.deviceId,
                        state: isOn ? 'ON' : 'OFF'
                    }));
                    showToast(`${label} command routed via MQTT fallback`, 'success');
                } else {
                    showToast(`Failed to toggle ${label}`, 'error');
                    state.relays[relayName] = !isOn;
                    updateRelayUI(relayName, !isOn);
                }
            }
        }
    }

    function updateRelayUI(relayName, isOn) {
        const btnKey = relayName === 'growlight' ? 'btnRelayGrowlight' : 'btnRelayPump';
        const stateKey = relayName === 'growlight' ? 'relayStateGrowlight' : 'relayStatePump';

        if (dom[btnKey]) {
            dom[btnKey].classList.toggle('active', isOn);
        }
        if (dom[stateKey]) {
            dom[stateKey].textContent = isOn ? 'ACTIVE' : 'OFF';
            dom[stateKey].classList.toggle('active', isOn);
        }
    }

    function updateRelayStates(data) {
        const relays = data.relays || {};
        if (relays.growlight !== undefined) {
            state.relays.growlight = relays.growlight;
            updateRelayUI('growlight', relays.growlight);
        }
        if (relays.pump !== undefined) {
            state.relays.pump = relays.pump;
            updateRelayUI('pump', relays.pump);
        }
    }

    // ── MQTT WebSocket Client & Handling ────────────────────

    function initMQTT() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host || 'localhost:8000';
        const wsUrl = `${protocol}//${host}/ws`;

        try {
            const ws = new WebSocket(wsUrl);
            state.mqtt.ws = ws;

            ws.onopen = () => {
                console.log('[MQTT Bridge] Connected to WebSocket backend');
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'init') {
                        state.mqtt.configured = data.configured;
                        state.mqtt.connected = data.mqttConnected;
                        state.mqtt.deviceId = data.deviceId || 'greenhouse1';
                        updateMQTTStatusUI();
                        renderDeviceChips();

                        // If backend has cached device data
                        if (data.devices && data.devices[state.mqtt.deviceId]) {
                            applyCachedMqttDevice(data.devices[state.mqtt.deviceId]);
                        }
                    } else if (data.type === 'mqtt_status') {
                        state.mqtt.connected = data.connected;
                        if (data.deviceId) state.mqtt.deviceId = data.deviceId;
                        updateMQTTStatusUI();
                        renderDeviceChips();
                    } else if (data.type === 'mqtt_data') {
                        handleMqttData(data);
                    }
                } catch (e) {
                    console.warn('[MQTT Bridge] Message parse error:', e);
                }
            };

            ws.onclose = () => {
                state.mqtt.connected = false;
                updateMQTTStatusUI();
                renderDeviceChips();
                // Reconnect after 3 seconds
                if (!state.mqtt.reconnectTimer) {
                    state.mqtt.reconnectTimer = setTimeout(() => {
                        state.mqtt.reconnectTimer = null;
                        initMQTT();
                    }, 3000);
                }
            };

            ws.onerror = () => {
                console.warn('[MQTT Bridge] WebSocket connection error');
            };
        } catch (e) {
            console.warn('[MQTT Bridge] Init exception:', e);
        }
    }

    function updateMQTTStatusUI() {
        if (!dom.mqttStatus || !dom.mqttStatusDot || !dom.mqttStatusText) return;
        if (!state.mqtt.configured) {
            dom.mqttStatusDot.className = 'status-dot';
            dom.mqttStatusText.textContent = 'MQTT: Offline';
            dom.mqttStatus.title = 'Configure HiveMQ Cloud credentials in web-dashboard/.env';
        } else if (state.mqtt.connected) {
            dom.mqttStatusDot.className = 'status-dot mqtt-active';
            dom.mqttStatusText.textContent = `MQTT: Online`;
            dom.mqttStatus.title = `HiveMQ Cloud Active (Device: ${state.mqtt.deviceId})`;
        } else {
            dom.mqttStatusDot.className = 'status-dot connecting';
            dom.mqttStatusText.textContent = 'MQTT: Connecting';
            dom.mqttStatus.title = 'Attempting connection to HiveMQ Cloud...';
        }
    }

    function applyCachedMqttDevice(cachedDev) {
        if (!cachedDev) return;
        if (!state.mqtt.lastData) {
            state.mqtt.lastData = createEmptySensorData(cachedDev.deviceId || state.mqtt.deviceId);
        }
        const d = state.mqtt.lastData;
        if (cachedDev.sensors) {
            if (cachedDev.sensors.temperature !== undefined) d.sensors.dht11.temperature = cachedDev.sensors.temperature;
            if (cachedDev.sensors.humidity !== undefined) d.sensors.dht11.humidity = cachedDev.sensors.humidity;
            if (cachedDev.sensors.soil1 !== undefined) d.sensors.soil1.moisture = cachedDev.sensors.soil1;
            if (cachedDev.sensors.soil2 !== undefined) d.sensors.soil2.moisture = cachedDev.sensors.soil2;
        }
        if (cachedDev.pump !== undefined) {
            d.relays.pump = cachedDev.pump;
            state.relays.pump = cachedDev.pump;
            updateRelayUI('pump', cachedDev.pump);
        }
        if (cachedDev.growlight !== undefined) {
            d.relays.growlight = cachedDev.growlight;
            state.relays.growlight = cachedDev.growlight;
            updateRelayUI('growlight', cachedDev.growlight);
        }
        if (cachedDev.schedules) {
            try {
                const schData = typeof cachedDev.schedules === 'string' ? JSON.parse(cachedDev.schedules) : cachedDev.schedules;
                if (Array.isArray(schData)) {
                    state.schedules = schData;
                } else if (schData && Array.isArray(schData.schedules)) {
                    state.schedules = schData.schedules;
                    if (schData.time) updateClockState({ current: schData.time, synced: schData.synced, date: schData.date });
                }
                renderSchedules();
            } catch (e) {}
        }

        if (state.activeDevice === 'mqtt' || (!state.activeDevice && state.devices.length === 0)) {
            updateSensorCards(d);
            updateDataSourceBadge('remote');
            updateVisibility();
            renderSchedules();
            updateClockUI();
            updateConnectionStatus(true, `MQTT (${state.mqtt.deviceId})`);
        }
    }

    function handleMqttData(msg) {
        const topic = msg.topic;
        const payload = msg.payload;

        if (!state.mqtt.lastData) {
            state.mqtt.lastData = createEmptySensorData(state.mqtt.deviceId);
        }

        const d = state.mqtt.lastData;
        const parts = topic.split('/');
        // dombla/<deviceId>/...
        if (parts.length >= 3) {
            const topicType = parts[2];
            const subType = parts[3];

            if (topicType === 'sensors' && subType) {
                if (subType === 'time') {
                    updateClockState({ current: payload, synced: true });
                } else {
                    const val = parseFloat(payload);
                    if (subType === 'temperature') d.sensors.dht11.temperature = isNaN(val) ? payload : val;
                    if (subType === 'humidity') d.sensors.dht11.humidity = isNaN(val) ? payload : val;
                    if (subType === 'soil1') d.sensors.soil1.moisture = isNaN(val) ? payload : val;
                    if (subType === 'soil2') d.sensors.soil2.moisture = isNaN(val) ? payload : val;

                    // Push to live charts
                    addLiveChartPoint(d.sensors.dht11.temperature, d.sensors.dht11.humidity, d.sensors.soil1.moisture);
                }
            } else if (topicType === 'schedules') {
                try {
                    const parsed = JSON.parse(payload);
                    if (Array.isArray(parsed)) {
                        state.schedules = parsed;
                    } else if (parsed && Array.isArray(parsed.schedules)) {
                        state.schedules = parsed.schedules;
                        if (parsed.time) {
                            updateClockState({ current: parsed.time, synced: parsed.synced, date: parsed.date });
                        }
                    }
                    renderSchedules();
                } catch (e) {
                    console.warn('[MQTT] Error parsing schedules payload:', e);
                }
            } else if (topicType === 'pump' && subType === 'state') {
                const isOn = payload.toUpperCase() === 'ON';
                d.relays.pump = isOn;
                state.relays.pump = isOn;
                updateRelayUI('pump', isOn);
            } else if (topicType === 'growlight' && subType === 'state') {
                const isOn = payload.toUpperCase() === 'ON';
                d.relays.growlight = isOn;
                state.relays.growlight = isOn;
                updateRelayUI('growlight', isOn);
            } else if (topicType === 'status') {
                const isOnline = payload.toLowerCase() === 'online';
                state.mqtt.connected = isOnline;
                updateMQTTStatusUI();
            }
        }

        // Apply to UI if currently viewing MQTT or no online local device
        const activeLocalOnline = state.activeDevice && state.activeDevice !== 'mqtt' && state.devices.find(x => x.ip === state.activeDevice && x.online);
        if (state.activeDevice === 'mqtt' || (!activeLocalOnline && (state.activeDevice === null || state.devices.length === 0))) {
            updateSensorCards(d);
            updateDataSourceBadge('remote');
            updateVisibility();
            renderSchedules();
            updateClockUI();
            updateConnectionStatus(true, `MQTT (${state.mqtt.deviceId})`);
        }
    }

    function createEmptySensorData(deviceId) {
        return {
            device: deviceId,
            sensors: {
                dht11: { temperature: null, humidity: null },
                soil1: { moisture: null },
                soil2: { moisture: null }
            },
            relays: {
                pump: false,
                growlight: false
            },
            thresholds: {
                temp_low: 10,
                temp_high: 35,
                humidity_low: 30,
                soil_dry: 25,
                soil_wet: 85
            }
        };
    }

    function addLiveChartPoint(temp, hum, soil) {
        if (!state.charts.climate || !state.charts.soil) return;
        const now = new Date();
        const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        if (temp != null && !isNaN(temp) && hum != null && !isNaN(hum)) {
            const climateLabels = state.charts.climate.data.labels;
            if (climateLabels.length > 30) {
                climateLabels.shift();
                state.charts.climate.data.datasets[0].data.shift();
                state.charts.climate.data.datasets[1].data.shift();
            }
            climateLabels.push(timeLabel);
            state.charts.climate.data.datasets[0].data.push(temp);
            state.charts.climate.data.datasets[1].data.push(hum);
            state.charts.climate.update('none');
        }

        if (soil != null && !isNaN(soil)) {
            const soilLabels = state.charts.soil.data.labels;
            if (soilLabels.length > 30) {
                soilLabels.shift();
                state.charts.soil.data.datasets[0].data.shift();
            }
            soilLabels.push(timeLabel);
            state.charts.soil.data.datasets[0].data.push(soil);
            state.charts.soil.update('none');
        }
    }

    // ── Schedules & Automation UI Logic ─────────────────────

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatDaysMask(mask) {
        if (mask === undefined || mask === null) mask = 127;
        mask = parseInt(mask, 10);
        const effective = mask & 0x7F;

        if (effective === 0x7F) return 'Every day';
        if (effective === 0x3E) return 'Weekdays (Mon - Fri)';
        if (effective === 0x41) return 'Weekends (Sat - Sun)';
        if (effective === 0) return 'Disabled';

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const active = [];
        for (let i = 0; i < 7; i++) {
            if ((effective & (1 << i)) !== 0) {
                active.push(dayNames[i]);
            }
        }
        return active.join(', ');
    }

    function calculateDaysMaskFromUI() {
        let mask = 0;
        document.querySelectorAll('.days-selector .day-chip.active').forEach(chip => {
            const day = parseInt(chip.getAttribute('data-day'), 10);
            if (!isNaN(day)) {
                mask |= (1 << day);
            }
        });
        return mask;
    }

    // ── Schedules & Automation Storage ─────────────────────
    const SCHEDULES_STORAGE_KEY = 'dombla_schedules';
    const DEFAULT_SCHEDULES = [
        {
            id: 'sch_growlight_default',
            name: 'Grow Light Night Automation',
            device: 'growlight',
            onTime: '19:00',
            offTime: '06:00',
            daysMask: 127,
            enabled: true
        }
    ];

    function loadSavedSchedules() {
        try {
            const saved = localStorage.getItem(SCHEDULES_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    state.schedules = parsed;
                    return;
                }
            }
        } catch (e) {
            console.warn('Failed to load saved schedules:', e);
        }
        if (!state.schedules || state.schedules.length === 0) {
            state.schedules = JSON.parse(JSON.stringify(DEFAULT_SCHEDULES));
        }
    }

    function saveSchedulesToStorage() {
        try {
            localStorage.setItem(SCHEDULES_STORAGE_KEY, JSON.stringify(state.schedules));
        } catch (e) {
            console.warn('Failed to save schedules to localStorage:', e);
        }
    }

    function getEffectiveWibTime() {
        if (state.clock.time) {
            return state.clock.time.substring(0, 5);
        }
        try {
            const now = new Date();
            const wibStr = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour12: false });
            return wibStr.substring(0, 5);
        } catch (e) {
            return null;
        }
    }

    function isTimeInWindow(curTimeStr, onTimeStr, offTimeStr) {
        if (!curTimeStr || !onTimeStr || !offTimeStr) return false;
        const [ch, cm] = curTimeStr.split(':').map(Number);
        const [onH, onM] = onTimeStr.split(':').map(Number);
        const [offH, offM] = offTimeStr.split(':').map(Number);
        if (isNaN(ch) || isNaN(cm) || isNaN(onH) || isNaN(onM) || isNaN(offH) || isNaN(offM)) return false;

        const cur = ch * 60 + cm;
        const start = onH * 60 + onM;
        const stop = offH * 60 + offM;

        if (start < stop) {
            return (cur >= start && cur < stop);
        } else if (start > stop) {
            return (cur >= start || cur < stop);
        }
        return false;
    }

    function applyDayPreset(preset) {
        const chips = document.querySelectorAll('.days-selector .day-chip');
        chips.forEach(chip => {
            const day = parseInt(chip.getAttribute('data-day'), 10);
            let active = false;
            if (preset === 'all') {
                active = true;
            } else if (preset === 'weekdays') {
                active = (day >= 1 && day <= 5);
            } else if (preset === 'weekends') {
                active = (day === 0 || day === 6);
            }
            chip.classList.toggle('active', active);
        });
        updateActivePresetButton();
    }

    function updateActivePresetButton() {
        const mask = calculateDaysMaskFromUI() & 0x7F;
        document.querySelectorAll('.days-presets .btn-preset').forEach(btn => {
            const p = btn.getAttribute('data-preset');
            let isActive = false;
            if (p === 'all' && mask === 0x7F) isActive = true;
            else if (p === 'weekdays' && mask === 0x3E) isActive = true;
            else if (p === 'weekends' && mask === 0x41) isActive = true;
            btn.classList.toggle('active', isActive);
        });
    }

    function updateScheduleFormModeUI() {
        const mode = dom.schMode ? dom.schMode.value : 'range';
        if (!dom.schOnGroup || !dom.schOffGroup || !dom.schTimesContainer) return;

        if (mode === 'range') {
            dom.schOnGroup.style.display = 'block';
            dom.schOffGroup.style.display = 'block';
            dom.schOnTime.required = true;
            dom.schOffTime.required = true;
            if (dom.schOnLabel) dom.schOnLabel.textContent = 'Turn ON Time (Night - WIB)';
            if (dom.schOffLabel) dom.schOffLabel.textContent = 'Turn OFF Time (Morning - WIB)';
            dom.schTimesContainer.style.gridTemplateColumns = '1fr 1fr';
        } else if (mode === 'on_only') {
            dom.schOnGroup.style.display = 'block';
            dom.schOffGroup.style.display = 'none';
            dom.schOnTime.required = true;
            dom.schOffTime.required = false;
            if (dom.schOnLabel) dom.schOnLabel.textContent = 'Trigger Time (WIB)';
            dom.schTimesContainer.style.gridTemplateColumns = '1fr';
        } else if (mode === 'off_only') {
            dom.schOnGroup.style.display = 'none';
            dom.schOffGroup.style.display = 'block';
            dom.schOnTime.required = false;
            dom.schOffTime.required = true;
            if (dom.schOffLabel) dom.schOffLabel.textContent = 'Trigger Time (WIB)';
            dom.schTimesContainer.style.gridTemplateColumns = '1fr';
        }
    }

    function openScheduleModal(scheduleId = null) {
        state.editingScheduleId = scheduleId;

        if (scheduleId) {
            const sch = state.schedules.find(s => String(s.id) === String(scheduleId));
            if (sch) {
                if (dom.scheduleModalTitle) dom.scheduleModalTitle.textContent = 'Edit Automation';
                if (dom.schId) dom.schId.value = sch.id;
                if (dom.schName) dom.schName.value = sch.name || 'Grow Light Night Automation';
                if (dom.schDevice) dom.schDevice.value = sch.device || 'growlight';

                let mode = 'range';
                if (sch.onTime && sch.offTime) mode = 'range';
                else if (sch.onTime && !sch.offTime) mode = 'on_only';
                else if (!sch.onTime && sch.offTime) mode = 'off_only';

                if (dom.schMode) dom.schMode.value = mode;
                if (dom.schOnTime) dom.schOnTime.value = sch.onTime || '19:00';
                if (dom.schOffTime) dom.schOffTime.value = sch.offTime || '06:00';

                const mask = sch.daysMask !== undefined ? sch.daysMask : 127;
                document.querySelectorAll('.days-selector .day-chip').forEach(chip => {
                    const d = parseInt(chip.getAttribute('data-day'), 10);
                    chip.classList.toggle('active', (mask & (1 << d)) !== 0);
                });
                updateActivePresetButton();

                if (dom.schEnabled) dom.schEnabled.checked = (sch.enabled !== false);
            }
        } else {
            if (dom.scheduleModalTitle) dom.scheduleModalTitle.textContent = 'Add Automation';
            if (dom.schId) dom.schId.value = '';
            if (dom.schName) dom.schName.value = 'Grow Light Night Automation';
            if (dom.schDevice) dom.schDevice.value = 'growlight';
            if (dom.schMode) dom.schMode.value = 'range';
            if (dom.schOnTime) dom.schOnTime.value = '19:00';
            if (dom.schOffTime) dom.schOffTime.value = '06:00';
            applyDayPreset('all');
            if (dom.schEnabled) dom.schEnabled.checked = true;
        }

        updateScheduleFormModeUI();
        if (dom.scheduleModalOverlay) {
            dom.scheduleModalOverlay.classList.remove('hidden');
        }
        if (dom.schName) {
            setTimeout(() => dom.schName.focus(), 60);
        }
    }

    function closeScheduleModal() {
        if (dom.scheduleModalOverlay) {
            dom.scheduleModalOverlay.classList.add('hidden');
        }
        state.editingScheduleId = null;
    }

    function renderSchedules() {
        if (!dom.schedulesGrid) return;
        dom.schedulesGrid.innerHTML = '';

        const list = state.schedules || [];
        if (list.length === 0) {
            if (dom.schedulesEmpty) dom.schedulesEmpty.classList.remove('hidden');
            return;
        }
        if (dom.schedulesEmpty) dom.schedulesEmpty.classList.add('hidden');

        const curTime = getEffectiveWibTime();

        list.forEach((sch, idx) => {
            const card = document.createElement('div');
            const isLight = (sch.device === 'growlight');
            card.className = `schedule-card device-${isLight ? 'growlight' : 'pump'}${sch.enabled ? '' : ' disabled'}`;
            card.dataset.id = sch.id || idx;

            const lightSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
            const pumpSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>`;

            // Dynamic Live Cycle Status Pill
            let cycleBadgeHtml = '';
            if (!sch.enabled) {
                cycleBadgeHtml = `
                    <span class="cycle-pill paused" title="Automation cycle is paused">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                        <span>Paused</span>
                    </span>`;
            } else if (sch.onTime && sch.offTime) {
                const isNight = isTimeInWindow(curTime, sch.onTime, sch.offTime);
                if (isLight) {
                    if (isNight) {
                        cycleBadgeHtml = `
                            <span class="cycle-pill active-night" title="Current time (${curTime || '--:--'} WIB) is within the night period. Light is automatically ON.">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                                <span>Night Mode &bull; Light ON</span>
                            </span>`;
                    } else {
                        cycleBadgeHtml = `
                            <span class="cycle-pill active-day" title="Current time (${curTime || '--:--'} WIB) is within the day period. Light is automatically OFF.">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                                <span>Day Mode &bull; Light OFF</span>
                            </span>`;
                    }
                } else {
                    cycleBadgeHtml = isNight
                        ? `<span class="cycle-pill active-night"><span>Active &bull; Pump ON</span></span>`
                        : `<span class="cycle-pill active-day"><span>Inactive &bull; Pump OFF</span></span>`;
                }
            } else {
                cycleBadgeHtml = `<span class="cycle-pill active-day"><span>Triggered Mode</span></span>`;
            }

            let timePills = '';
            if (sch.onTime && sch.offTime) {
                timePills = `
                    <span class="time-pill on" title="Automatically turns ON at this time">
                        <span class="time-label-prefix">${isLight ? 'Night ON' : 'Turn ON'}</span> ${escapeHtml(sch.onTime)} WIB
                    </span>
                    <span style="color: var(--text-muted); font-size: 0.8rem; line-height: 1; user-select: none;">➔</span>
                    <span class="time-pill off" title="Automatically turns OFF at this time">
                        <span class="time-label-prefix">${isLight ? 'Morning OFF' : 'Turn OFF'}</span> ${escapeHtml(sch.offTime)} WIB
                    </span>
                `;
            } else if (sch.onTime) {
                timePills = `<span class="time-pill on"><span class="time-label-prefix">Turn ON</span> ${escapeHtml(sch.onTime)} WIB</span>`;
            } else if (sch.offTime) {
                timePills = `<span class="time-pill off"><span class="time-label-prefix">Turn OFF</span> ${escapeHtml(sch.offTime)} WIB</span>`;
            } else {
                timePills = `<span class="time-pill">—</span>`;
            }

            card.innerHTML = `
                <div class="schedule-card-top">
                    <div class="schedule-card-meta">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span class="schedule-name">${escapeHtml(sch.name || 'Automation ' + (idx + 1))}</span>
                            ${cycleBadgeHtml}
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px; margin-top: 3px;">
                            <span class="schedule-device-pill ${isLight ? 'growlight' : 'pump'}">
                                ${isLight ? lightSvg : pumpSvg}
                                <span>${isLight ? 'Grow Light' : 'Water Pump'}</span>
                            </span>
                        </div>
                    </div>
                    <label class="toggle-switch-label" title="${sch.enabled ? 'Automation Enabled' : 'Automation Disabled'}">
                        <input type="checkbox" class="sch-toggle-checkbox" ${sch.enabled ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="schedule-time-row">
                    ${timePills}
                </div>
                <div class="schedule-card-footer">
                    <div class="schedule-days-summary">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        <span>${escapeHtml(formatDaysMask(sch.daysMask))}</span>
                    </div>
                    <div class="schedule-actions">
                        <button type="button" class="btn btn-secondary btn-sm btn-edit-sch" style="padding: 4px 10px; font-size: 0.74rem; font-weight: 600; gap: 5px; height: 30px; display: inline-flex; align-items: center;" title="Edit automation hours">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                            <span>Edit Hours</span>
                        </button>
                        <button type="button" class="btn-icon-action delete btn-del-sch" title="Delete automation" aria-label="Delete automation">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;

            // Toggle switch listener
            const toggleBox = card.querySelector('.sch-toggle-checkbox');
            if (toggleBox) {
                toggleBox.addEventListener('change', (e) => {
                    toggleScheduleEnabled(sch.id, e.target.checked);
                });
            }

            // Edit button listener
            const editBtn = card.querySelector('.btn-edit-sch');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    openScheduleModal(sch.id);
                });
            }

            // Delete button listener
            const delBtn = card.querySelector('.btn-del-sch');
            if (delBtn) {
                delBtn.addEventListener('click', () => {
                    deleteSchedule(sch.id);
                });
            }

            dom.schedulesGrid.appendChild(card);
        });
    }

    function saveScheduleFromForm() {
        const name = dom.schName ? dom.schName.value.trim() : '';
        if (!name) {
            showToast('Please enter an automation name', 'warning');
            return;
        }

        const device = dom.schDevice ? dom.schDevice.value : 'growlight';
        const mode = dom.schMode ? dom.schMode.value : 'range';
        const daysMask = calculateDaysMaskFromUI();

        if (daysMask === 0) {
            showToast('Please select at least one active day', 'warning');
            return;
        }

        let onTime = '';
        let offTime = '';

        if (mode === 'range') {
            onTime = dom.schOnTime ? dom.schOnTime.value : '';
            offTime = dom.schOffTime ? dom.schOffTime.value : '';
            if (!onTime || !offTime) {
                showToast('Please specify both Turn ON and Turn OFF times', 'warning');
                return;
            }
        } else if (mode === 'on_only') {
            onTime = dom.schOnTime ? dom.schOnTime.value : '';
            if (!onTime) {
                showToast('Please specify a trigger time', 'warning');
                return;
            }
        } else if (mode === 'off_only') {
            offTime = dom.schOffTime ? dom.schOffTime.value : '';
            if (!offTime) {
                showToast('Please specify a trigger time', 'warning');
                return;
            }
        }

        const enabled = dom.schEnabled ? dom.schEnabled.checked : true;
        const scheduleId = dom.schId ? dom.schId.value : '';

        if (scheduleId) {
            const existing = state.schedules.find(s => String(s.id) === String(scheduleId));
            if (existing) {
                existing.name = name;
                existing.device = device;
                existing.onTime = onTime;
                existing.offTime = offTime;
                existing.daysMask = daysMask;
                existing.enabled = enabled;
            }
        } else {
            if (state.schedules.length >= 16) {
                showToast('Maximum automations limit (16) reached', 'warning');
                return;
            }
            const newId = 'sch_' + Date.now();
            state.schedules.push({
                id: newId,
                name: name,
                device: device,
                onTime: onTime,
                offTime: offTime,
                daysMask: daysMask,
                enabled: enabled
            });
        }

        closeScheduleModal();
        saveSchedulesToStorage();
        renderSchedules();
        saveSchedulesToDevice();
        showToast(scheduleId ? 'Automation hours updated' : 'Automation created', 'success');
    }

    function toggleScheduleEnabled(id, isEnabled) {
        const sch = state.schedules.find(s => String(s.id) === String(id));
        if (!sch) return;
        sch.enabled = isEnabled;
        saveSchedulesToStorage();
        renderSchedules();
        saveSchedulesToDevice();
        showToast(`Automation "${sch.name}" ${isEnabled ? 'enabled' : 'paused'}`, isEnabled ? 'success' : 'warning');
    }

    function deleteSchedule(id) {
        const sch = state.schedules.find(s => String(s.id) === String(id));
        const name = sch ? sch.name : 'Automation';
        state.schedules = state.schedules.filter(s => String(s.id) !== String(id));
        saveSchedulesToStorage();
        renderSchedules();
        saveSchedulesToDevice();
        showToast(`Deleted automation "${name}"`, 'warning');
    }

    async function saveSchedulesToDevice() {
        const isMqttMode = (state.activeDevice === 'mqtt' || (!state.activeDevice && state.mqtt.connected));
        if (isMqttMode && state.mqtt.ws && state.mqtt.ws.readyState === WebSocket.OPEN) {
            state.mqtt.ws.send(JSON.stringify({
                action: 'update_schedules',
                deviceId: state.mqtt.deviceId,
                schedules: state.schedules
            }));
            return;
        }

        if (state.activeDevice && state.activeDevice !== 'mqtt') {
            try {
                const resp = await fetch(`http://${state.activeDevice}/api/schedules`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ schedules: state.schedules })
                });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && Array.isArray(data.schedules)) {
                        state.schedules = data.schedules;
                        saveSchedulesToStorage();
                        renderSchedules();
                    }
                } else {
                    throw new Error(`HTTP ${resp.status}`);
                }
            } catch (err) {
                console.warn('[Schedules] HTTP save failed:', err.message);
                if (state.mqtt.ws && state.mqtt.ws.readyState === WebSocket.OPEN) {
                    state.mqtt.ws.send(JSON.stringify({
                        action: 'update_schedules',
                        deviceId: state.mqtt.deviceId,
                        schedules: state.schedules
                    }));
                    showToast('Automations saved via MQTT fallback', 'success');
                } else {
                    showToast('Failed to sync automations to ESP32', 'error');
                }
            }
        }
    }

    // ── Real-Time Clock Management ──────────────────────────

    function updateClockState(clockData) {
        if (!clockData) return;

        let timeStr = null;
        let isSynced = true;
        let dateStr = null;

        if (typeof clockData === 'string') {
            timeStr = clockData.trim();
        } else if (typeof clockData === 'object') {
            timeStr = clockData.current || clockData.time || clockData.datetime;
            if (clockData.synced !== undefined) isSynced = Boolean(clockData.synced);
            if (clockData.date) dateStr = clockData.date;
        }

        if (timeStr) {
            // Strip any " WIB" or trailing labels
            timeStr = timeStr.replace(/\s*(WIB|UTC\+7).*$/i, '').trim();
            // If full datetime "YYYY-MM-DD HH:MM:SS" extract just time
            const parts = timeStr.split(' ');
            if (parts.length === 2 && parts[1].includes(':')) {
                if (!dateStr) dateStr = parts[0];
                timeStr = parts[1];
            }

            const hadTime = Boolean(state.clock.time);
            state.clock.time = timeStr;
            state.clock.synced = isSynced;
            if (dateStr) state.clock.date = dateStr;
            state.clock.lastReceivedAt = Date.now();
            updateClockUI();

            if (!hadTime) {
                renderSchedules();
            }
        }
    }

    function initClockTick() {
        if (state.clockTimer) {
            clearInterval(state.clockTimer);
            state.clockTimer = null;
        }

        state.clockTimer = setInterval(() => {
            if (!state.clock.time) return;

            const timeParts = state.clock.time.split(':').map(n => parseInt(n, 10));
            if (timeParts.length < 2 || isNaN(timeParts[0]) || isNaN(timeParts[1])) return;

            let h = timeParts[0];
            let m = timeParts[1];
            let s = timeParts.length >= 3 && !isNaN(timeParts[2]) ? timeParts[2] : 0;

            s++;
            let minuteRolled = false;
            if (s >= 60) {
                s = 0;
                minuteRolled = true;
                m++;
                if (m >= 60) {
                    m = 0;
                    h++;
                    if (h >= 24) {
                        h = 0;
                    }
                }
            }

            state.clock.time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            updateClockUI();

            if (minuteRolled) {
                renderSchedules();
            }
        }, 1000);
    }

    function updateClockUI() {
        if (!dom.espClockTime || !dom.clockStatusDot) return;

        if (state.clock.time) {
            dom.espClockTime.textContent = `${state.clock.time} WIB`;
            dom.clockStatusDot.className = `status-dot ${state.clock.synced ? 'online' : 'connecting'}`;
            if (dom.espClockBadge) {
                dom.espClockBadge.title = `ESP32 Time: ${state.clock.time} WIB${state.clock.synced ? ' (NTP Synced)' : ' (Syncing...)'}`;
            }
        } else {
            dom.espClockTime.textContent = '--:--:-- WIB';
            dom.clockStatusDot.className = 'status-dot';
            if (dom.espClockBadge) {
                dom.espClockBadge.title = 'ESP32 Real-Time Clock (WIB UTC+7)';
            }
        }
    }

    // ── Init ────────────────────────────────────────────────

    function init() {
        loadDevices();
        loadSavedSchedules();
        bindEvents();
        initCharts();
        renderDeviceChips();
        renderSchedules();
        initMQTT();
        initClockTick();

        // Auto-select first device and start polling
        if (state.devices.length > 0) {
            state.activeDevice = state.devices[0].ip;
            startPolling();
            fetchData();
        } else {
            updateVisibility();
        }

        console.log('[Dombla] Dashboard initialized');
    }

    // Boot
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

