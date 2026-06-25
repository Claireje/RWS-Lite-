// seasonal radiation baselines for Ann Arbor
// cosmic ray flux goes up in winter bc cold air is denser at altitude
// but the surface layer attenuates less when pressure is lower
// indoor radon also spikes in winter since buildings are sealed up
// numbers are roughly EPA background + NOAA atmospheric data, not exact
const RAD_SEASONS = {
    winter: { label: 'Winter', months: [11, 0, 1],  low: 70,  high: 140 },
    spring: { label: 'Spring', months: [2,  3, 4],  low: 60,  high: 120 },
    summer: { label: 'Summer', months: [5,  6, 7],  low: 55,  high: 110 },
    fall:   { label: 'Fall',   months: [8,  9, 10], low: 65,  high: 125 },
};

function getCurrentSeason() {
    const m = new Date().getMonth();
    return Object.values(RAD_SEASONS).find(s => s.months.includes(m));
}

// status tiers based on how far above the seasonal high we are
function getRadiationStatus(nSvh) {
    const s = getCurrentSeason();
    if (nSvh <= s.high)        return { text: 'Normal',          color: '#22c55e', icon: '🌲', title: 'Safe range.',      body: `Within the expected ${s.label.toLowerCase()} background.` };
    if (nSvh <= s.high * 1.5)  return { text: 'Monitor',         color: '#f59e0b', icon: '👀', title: 'Worth watching.',  body: `Slightly above ${s.label.toLowerCase()} seasonal average.` };
    if (nSvh <= s.high * 2.5)  return { text: 'Elevated',        color: '#f97316', icon: '⚠️', title: 'Elevated.',        body: `Notably above ${s.label.toLowerCase()} normal — monitor closely.` };
    return                            { text: 'Action Required', color: '#ef4444', icon: '🚨', title: 'Investigate now.', body: 'Far above seasonal background — contact facilities.' };
}

// quick helper for testing, fires sample telemetry at the API
async function insertSampleData() {
    try {
        await fetch('/api/insert-sample', { method: 'POST' });
        alert("Sample telemetry dispatched.");
        location.reload();
    } catch(e) {
        console.error(e);
    }
}

// top bar clock, ticks every second
setInterval(() => {
    const el = document.getElementById('top-bar-clock');
    if (el) el.textContent = new Date().toLocaleTimeString();
}, 1000);

// good morning / afternoon / evening greeting + today's date
(function() {
    const h = new Date().getHours();
    const g = h < 12 ? 'Good Morning!' : h < 17 ? 'Good Afternoon!' : 'Good Evening!';
    const el = document.getElementById('greeting-text');
    if (el) el.textContent = g;
    const de = document.getElementById('greeting-date');
    if (de) de.textContent = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
})();

/* -----------------------------------------
   three.js building scene
   3 floors, wireframe shell, pulsing sensor nodes for roof/indoor/basement
----------------------------------------- */
let scene, camera, renderer, controls, roofNode, indoorNode, basementNode, building;

function initThree() {
    const container = document.getElementById('three-container');
    if (!container) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060a14);
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(20, 15, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // orbit controls if loaded, otherwise just slowly spin the building so it's not static
    if (typeof THREE.OrbitControls !== 'undefined') {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
    } else {
        controls = { update: () => { if (building) building.rotation.y += 0.003; } };
    }

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const light = new THREE.DirectionalLight(0xffcb05, 0.8); // maize
    light.position.set(10, 20, 10);
    scene.add(light);

    building = new THREE.Group();
    const mat     = new THREE.MeshStandardMaterial({ color: 0x0c1428, transparent: true, opacity: 0.25 });
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true, transparent: true, opacity: 0.3 });

    // stack 3 floors
    for (let i = 0; i < 3; i++) {
        const geo = new THREE.BoxGeometry(10, 3.8, 7);
        const s = new THREE.Mesh(geo, mat);
        const w = new THREE.Mesh(geo, wireMat);
        s.position.y = w.position.y = i * 3.8 - 3.8;
        building.add(s, w);
    }
    scene.add(building);

    // little glowing dot + aura for each sensor location
    function createNode(color, x, y, z) {
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.35, 32, 32), new THREE.MeshBasicMaterial({ color }));
        core.position.set(x, y, z);
        const aura = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2 }));
        core.add(aura);
        building.add(core);
        return aura; // returning the aura so we can pulse it in the animate loop
    }

    roofNode     = createNode(0xffcb05, 0,    5.8,  0);
    indoorNode   = createNode(0x4ade80, 3,    0,    0.5);
    basementNode = createNode(0xf87171, -3,  -4,   -0.5);

    const grid = new THREE.GridHelper(40, 30, 0x1e2937, 0x0f172a);
    grid.position.y = -6;
    scene.add(grid);

    let t = 0;
    (function animate() {
        requestAnimationFrame(animate);
        t += 0.05;
        const scale = 1 + Math.sin(t) * 0.25; // breathing pulse on the nodes
        [roofNode, indoorNode, basementNode].forEach(n => n && n.scale.set(scale, scale, scale));
        controls.update();
        renderer.render(scene, camera);
    })();

    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

/* -----------------------------------------
   chart.js sparkline cards, one per metric
----------------------------------------- */
const CHARTS = {
    temp:     { chart: null, labels: [], data: [], color: '#c084fc', baseline: 55.5, blLabel: '55.5°F' },
    humidity: { chart: null, labels: [], data: [], color: '#22d3ee', baseline: 50,   blLabel: '50%'    },
    wind:     { chart: null, labels: [], data: [], color: '#4ade80', baseline: 3.5,  blLabel: '3.5mph' },
    rain:     { chart: null, labels: [], data: [], color: '#38bdf8', baseline: 0,    blLabel: 'Dry'    },
    solar:    { chart: null, labels: [], data: [], color: '#ffcb05', baseline: 450,  blLabel: '450lx'  },
    radon:    { chart: null, labels: [], data: [], color: '#fb7185', baseline: 1.2,  blLabel: '1.2pCi' },
};
const MAX_POINTS = 30; // rolling window so the line charts don't grow forever

function buildChart(key) {
    const cfg = CHARTS[key];
    const ctx = document.getElementById('chart-' + key);
    if (!ctx) return;

    // only add the baseline dashed line if the annotation plugin actually loaded
    const annotationPlugin = {};
    const annotationObj = window['chartjs-plugin-annotation'] || window.ChartAnnotation;
    if (annotationObj) {
        annotationPlugin.annotation = {
            annotations: {
                baseline: {
                    type: 'line', yMin: cfg.baseline, yMax: cfg.baseline,
                    borderColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderDash: [4, 4],
                    label: { display: true, content: cfg.blLabel, position: 'end',
                        backgroundColor: 'rgba(15,23,42,0.85)', color: '#64748b',
                        font: { size: 8, weight: 'bold' }, padding: { x: 4, y: 2 } }
                }
            }
        };
    }

    cfg.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: cfg.labels,
            datasets: [{
                data: cfg.data,
                borderColor: cfg.color,
                backgroundColor: cfg.color + '12',
                borderWidth: 1.5,
                tension: 0.4,
                pointRadius: 0,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // linear transition instead of the default elastic-ish easing so live updates feel steady, not jumpy
            transitions: {
                active: {
                    animation: {
                        duration: 400,
                        easing: 'linear'
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index', intersect: false,
                    backgroundColor: '#0d1526',
                    borderColor: cfg.color + '40',
                    borderWidth: 1,
                    titleColor: cfg.color,
                    bodyColor: '#94a3b8',
                    padding: 8,
                    callbacks: { title: items => items[0].label }
                },
                ...annotationPlugin
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#334155', font: { size: 8 }, maxTicksLimit: 5, maxRotation: 0 }
                },
                y: {
                    grid: { color: 'rgba(30,41,59,0.4)' },
                    ticks: { color: '#475569', font: { size: 8 }, maxTicksLimit: 4 }
                }
            }
        }
    });
}

function initAllCharts() {
    Object.keys(CHARTS).forEach(buildChart);
}

/* -----------------------------------------
   live data polling
   hits the WP REST endpoint, falls back to mock data if it's down
----------------------------------------- */
async function updateLiveChart() {
    let sensor;
    try {
        const res = await fetch('https://dev-engin-rws.pantheonsite.io/wp-json/rws/v1/sensors');
        const payload = await res.json();
        sensor = payload.data;
    } catch(e) {
        // API's probably just asleep (pantheon free tier naps), feed in fake but plausible numbers
        // logging this so it's obvious in devtools we're on mock data and not actually live
        console.warn('sensor fetch failed, falling back to mock data:', e);
        sensor = {
            indoor_temp:     55.1 + (Math.random() * 2 - 1),
            indoor_humidity: 48.0 + (Math.random() * 4 - 2),
            rainfall:        Math.max(0, Math.random() * 0.008),
            wind_speed:      Math.max(0, 3.7 + (Math.random() * 2 - 1)),
            radiation:       82 + (Math.random() * 6 - 3),
            radon_level:     1.2 + (Math.random() * 0.4 - 0.2),
            lux:             440 + (Math.random() * 40 - 20),
            timestamp:       new Date().toISOString()
        };
    }

    if (!sensor) return;

    const setEl = (id, val, dec) => {
        const el = document.getElementById(id);
        if (el && val != null) el.textContent = Number(val).toFixed(dec);
    };

    const incoming = {
        temp:     sensor.indoor_temp,
        humidity: sensor.indoor_humidity,
        wind:     sensor.wind_speed,
        rain:     sensor.rainfall,
        solar:    sensor.lux,
        radon:    sensor.radon_level,
    };

    // update the live readout cards
    setEl('current-temp',     incoming.temp,     1);
    setEl('current-humidity', incoming.humidity, 1);
    setEl('current-wind',     incoming.wind,     1);
    setEl('current-rain',     incoming.rain,     2);
    setEl('current-solar',    incoming.solar,    0);
    setEl('current-radon',    incoming.radon,    2);
    setEl('nav-temp',         sensor.indoor_temp, 0);

    const rad    = sensor.radiation ?? 82;
    const season = getCurrentSeason();
    const status = getRadiationStatus(rad);
    setEl('current-rad', rad, 0);

    const radStatusEl = document.getElementById('rad-status-text');
    if (radStatusEl) {
        radStatusEl.textContent = status.text;
        radStatusEl.style.color = status.color;
    }

    const radRangeEl = document.getElementById('rad-range-text');
    if (radRangeEl) radRangeEl.textContent = `${season.label} normal: ${season.low}–${season.high} nSv/h`;

    // shield glow matches whatever tier we're in
    const shieldEl = document.getElementById('rad-shield');
    const shieldIcon = document.getElementById('rad-shield-icon');
    if (shieldEl) {
        shieldEl.style.borderColor = status.color + '99';
        shieldEl.style.boxShadow   = `0 0 15px ${status.color}33`;
    }
    if (shieldIcon) shieldIcon.style.color = status.color;

    const infoBox   = document.getElementById('rad-info-box');
    const infoIcon  = document.getElementById('rad-info-icon');
    const infoTitle = document.getElementById('rad-info-title');
    const infoText  = document.getElementById('rad-info-text');
    if (infoBox)   infoBox.style.borderColor  = status.color + '33';
    if (infoIcon)  infoIcon.textContent       = status.icon;
    if (infoTitle) infoTitle.textContent      = status.title;
    if (infoText)  infoText.textContent       = status.body;

    setEl('weather-temp',  sensor.indoor_temp, 0);
    setEl('weather-feels', sensor.indoor_temp, 0);

    const ts = new Date(sensor.timestamp || new Date())
        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // push new point onto each chart, trim old ones off the front so it scrolls
    Object.entries(incoming).forEach(([key, val]) => {
        const cfg = CHARTS[key];
        if (!cfg) return;
        cfg.labels.push(ts);
        cfg.data.push(val ?? cfg.baseline);
        if (cfg.labels.length > MAX_POINTS) {
            cfg.labels.shift();
            cfg.data.shift();
        }
        if (cfg.chart) cfg.chart.update();
    });
}

/* -----------------------------------------
   custom sensor list (sidebar)
   stored in localStorage since these are just user-added bookmarks, not real telemetry
----------------------------------------- */
const SENSORS_KEY = 'rws_custom_sensors';

function loadCustomSensors() {
    try { return JSON.parse(localStorage.getItem(SENSORS_KEY)) || []; }
    catch { return []; }
}

function saveCustomSensors(list) {
    localStorage.setItem(SENSORS_KEY, JSON.stringify(list));
}

const STATUS_CONFIG = {
    online:  { color: 'text-emerald-500', pulse: 'animate-pulse', dot: true },
    offline: { color: 'text-rose-500',    pulse: '',              dot: false },
    unknown: { color: 'text-slate-500',   pulse: '',              dot: false },
};

function renderCustomSensors() {
    const container = document.getElementById('custom-stations-list');
    if (!container) return;
    const sensors = loadCustomSensors();
    if (!sensors.length) { container.innerHTML = ''; return; }

    container.innerHTML = sensors.map(s => {
        const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.unknown;
        return `
        <div class="flex items-center group">
            <a href="${s.url || '#'}" class="flex-1 flex items-center justify-between px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
                <span class="truncate pr-2">${s.name}</span>
                <span class="flex items-center shrink-0 ${cfg.color} ${cfg.pulse}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                        ${cfg.dot ? '<circle cx="12" cy="12" r="1.5" fill="currentColor"/>' : ''}
                        <path stroke-linecap="round" d="M9 9a4.2 4.2 0 000 6m6-6a4.2 4.2 0 010 6M6 6a8.5 8.5 0 000 12m12-12a8.5 8.5 0 010 12"/>
                    </svg>
                </span>
            </a>
            <button onclick="removeCustomSensor('${s.id}')" title="Remove"
                class="opacity-0 group-hover:opacity-100 ml-1 w-5 h-5 flex items-center justify-center rounded text-slate-600 hover:text-rose-400 transition-all text-xs shrink-0">✕</button>
        </div>`;
    }).join('');
}

function openAddSensorModal() {
    document.getElementById('new-sensor-name').value = '';
    document.getElementById('new-sensor-url').value  = '';
    document.querySelector('input[name="new-sensor-status"][value="online"]').checked = true;
    document.getElementById('add-sensor-error').classList.add('hidden');
    document.getElementById('add-sensor-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('new-sensor-name').focus(), 50);
}

function closeAddSensorModal() {
    document.getElementById('add-sensor-modal').classList.add('hidden');
}

function saveNewSensor() {
    const name   = document.getElementById('new-sensor-name').value.trim();
    const url    = document.getElementById('new-sensor-url').value.trim();
    const status = document.querySelector('input[name="new-sensor-status"]:checked')?.value || 'unknown';

    if (!name) {
        document.getElementById('add-sensor-error').classList.remove('hidden');
        return;
    }

    const sensors = loadCustomSensors();
    sensors.push({ id: Date.now().toString(), name, url, status });
    saveCustomSensors(sensors);
    renderCustomSensors();

    // pop the submenu open so they can actually see the thing they just added
    const submenu = document.getElementById('radiations-submenu');
    const chevron = document.getElementById('radiation-chevron');
    if (submenu?.classList.contains('hidden')) {
        submenu.classList.remove('hidden');
        chevron?.classList.add('rotate-180');
    }
    closeAddSensorModal();
}

function removeCustomSensor(id) {
    const sensors = loadCustomSensors().filter(s => s.id !== id);
    saveCustomSensors(sensors);
    renderCustomSensors();
}

/* -----------------------------------------
   radiation info modal + boot
----------------------------------------- */
function openRadiationInfo() {
    const modal = document.getElementById('rad-info-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeRadiationInfo() {
    const modal = document.getElementById('rad-info-modal');
    if (modal) modal.classList.add('hidden');
}

// close modals on backdrop click, set up the sidebar list on load
window.addEventListener('DOMContentLoaded', () => {
    const radModal    = document.getElementById('rad-info-modal');
    const sensorModal = document.getElementById('add-sensor-modal');
    if (radModal)    radModal.addEventListener('click',    e => { if (e.target === radModal)    closeRadiationInfo(); });
    if (sensorModal) sensorModal.addEventListener('click', e => { if (e.target === sensorModal) closeAddSensorModal(); });
    renderCustomSensors();
});

/* -----------------------------------------
   export all metrics to one CSV
----------------------------------------- */
function exportAllStationsCSV() {
    // all metrics push together every poll, so just grab whichever array is longest as the timestamp source
    const keys = Object.keys(CHARTS);
    const maxLen = Math.max(...keys.map(k => CHARTS[k].labels.length));

    if (maxLen === 0) {
        alert('No data collected yet — wait for the first readings to come in.');
        return;
    }

    const tsSource = keys.find(k => CHARTS[k].labels.length === maxLen);
    const timestamps = CHARTS[tsSource].labels;

    const headers = ['Timestamp', 'Temp (°F)', 'Humidity (%)', 'Wind (mph)', 'Rainfall (in)', 'Solar (lx)', 'Radon (pCi/L)'];
    const colKeys = ['temp', 'humidity', 'wind', 'rain', 'solar', 'radon'];

    const rows = [headers];
    for (let i = 0; i < maxLen; i++) {
        rows.push([
            timestamps[i] || '',
            ...colKeys.map(k => {
                const val = CHARTS[k].data[i];
                return val != null ? Number(val).toFixed(k === 'rain' ? 3 : k === 'radon' ? 2 : 1) : '';
            })
        ]);
    }

    const csv = rows.map(r => r.join(',')).join('\n');
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `RWS_AllStations_${date}.csv`;
    a.click();
}

// kick everything off once the page loads
window.onload = function() {
    initThree();
    initAllCharts();
    updateLiveChart();
    setInterval(updateLiveChart, 5000);
};