// Seasonal radiation background ranges for Ann Arbor (nSv/h)
// Based on EPA background levels and seasonal variation
const RAD_SEASONS = {
    winter: { label: 'Winter', months: [11, 0, 1],  low: 70,  high: 140 },
    spring: { label: 'Spring', months: [2,  3, 4],  low: 60,  high: 120 },
    summer: { label: 'Summer', months: [5,  6, 7],  low: 55,  high: 110 },
    fall:   { label: 'Fall',   months: [8,  9, 10], low: 65,  high: 125 },
};

// figures out which season we're currently in based on the month
function getCurrentSeason() {
    const m = new Date().getMonth();
    return Object.values(RAD_SEASONS).find(s => s.months.includes(m));
}

// returns a status label and color based on how the reading compares to the seasonal high
function getRadiationStatus(nSvh) {
    const s = getCurrentSeason();
    if (nSvh <= s.high)        return { text: 'Normal',          color: '#22c55e', icon: '●', title: 'Safe range.',      body: `Within the expected ${s.label.toLowerCase()} background.` };
    if (nSvh <= s.high * 1.5)  return { text: 'Monitor',         color: '#f59e0b', icon: '●', title: 'Worth watching.',  body: `Slightly above ${s.label.toLowerCase()} seasonal average.` };
    if (nSvh <= s.high * 2.5)  return { text: 'Elevated',        color: '#f97316', icon: '▲', title: 'Elevated.',        body: `Notably above ${s.label.toLowerCase()} normal — monitor closely.` };
    return                            { text: 'Action Required', color: '#ef4444', icon: '!', title: 'Investigate now.', body: 'Far above seasonal background — contact facilities.' };
}

// updates the clock in the top bar every second
setInterval(() => {
    const el = document.getElementById('top-bar-clock');
    if (el) el.textContent = new Date().toLocaleTimeString();
}, 1000);

// sets the greeting text and date when the page loads
(function() {
    const h = new Date().getHours();
    // pick the right greeting based on time of day
    const g = h < 12 ? 'Good Morning!' : h < 17 ? 'Good Afternoon!' : 'Good Evening!';
    const el = document.getElementById('greeting-text');
    if (el) el.textContent = g;
    const de = document.getElementById('greeting-date');
    if (de) de.textContent = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
})();

// Three.js building visualization
let scene, camera, renderer, controls, roofNode, indoorNode, basementNode, building;

function initThree() {
    const container = document.getElementById('three-container');
    if (!container) return;

    // basic scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060a14);
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(20, 15, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // use OrbitControls if available, otherwise just slowly rotate the building
    if (typeof THREE.OrbitControls !== 'undefined') {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
    } else {
        controls = { update: () => { if (building) building.rotation.y += 0.003; } };
    }

    // lighting: soft ambient + a directional light in UMich yellow
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const light = new THREE.DirectionalLight(0xffcb05, 0.8);
    light.position.set(10, 20, 10);
    scene.add(light);

    // build a 3-floor wireframe building
    building = new THREE.Group();
    const mat     = new THREE.MeshStandardMaterial({ color: 0x0c1428, transparent: true, opacity: 0.25 });
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true, transparent: true, opacity: 0.3 });

    for (let i = 0; i < 3; i++) {
        const geo = new THREE.BoxGeometry(10, 3.8, 7);
        const s = new THREE.Mesh(geo, mat);
        const w = new THREE.Mesh(geo, wireMat);
        // stack each floor on top of the previous one
        s.position.y = w.position.y = i * 3.8 - 3.8;
        building.add(s, w);
    }
    scene.add(building);

    // helper to create a glowing sensor node sphere at a given position
    function createNode(color, x, y, z) {
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.35, 32, 32), new THREE.MeshBasicMaterial({ color }));
        core.position.set(x, y, z);
        // the aura is a slightly bigger transparent sphere around the core
        const aura = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2 }));
        core.add(aura);
        building.add(core);
        return aura;
    }

    // place the three station nodes at their real-world positions in the building
    roofNode     = createNode(0xffcb05, 0,   5.8,  0);   // CS Facility roof (yellow)
    indoorNode   = createNode(0x4ade80, 3,   0,    0.5);  // RM 1962 indoor (green)
    basementNode = createNode(0xf87171, -3, -4,   -0.5);  // Basement (red)

    // grid on the floor for depth
    const grid = new THREE.GridHelper(40, 30, 0x1e2937, 0x0f172a);
    grid.position.y = -6;
    scene.add(grid);

    // animation loop — pulses the node auras in and out
    let t = 0;
    (function animate() {
        requestAnimationFrame(animate);
        t += 0.05;
        const scale = 1 + Math.sin(t) * 0.25;
        [roofNode, indoorNode, basementNode].forEach(n => n && n.scale.set(scale, scale, scale));
        controls.update();
        renderer.render(scene, camera);
    })();

    // keep the canvas the right size if the window resizes
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

// each chart entry holds its Chart.js instance, rolling label/data arrays, color, and a baseline value
const CHARTS = {
    temp:     { chart: null, labels: [], data: [], color: '#c084fc', baseline: 55.5, blLabel: '55.5°F' },
    humidity: { chart: null, labels: [], data: [], color: '#22d3ee', baseline: 50,   blLabel: '50%'    },
    wind:     { chart: null, labels: [], data: [], color: '#4ade80', baseline: 3.5,  blLabel: '3.5mph' },
    rain:     { chart: null, labels: [], data: [], color: '#38bdf8', baseline: 0,    blLabel: 'Dry'    },
    solar:    { chart: null, labels: [], data: [], color: '#ffcb05', baseline: 450,  blLabel: '450lx'  },
    radon:    { chart: null, labels: [], data: [], color: '#fb7185', baseline: 1.2,  blLabel: '1.2pCi' },
};
const MAX_POINTS = 30; // how many data points to keep visible before dropping old ones

function buildChart(key) {
    const cfg = CHARTS[key];
    const ctx = document.getElementById('chart-' + key);
    if (!ctx) return;

    // try to attach a dashed baseline annotation if the plugin is loaded
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
            transitions: {
                active: { animation: { duration: 400, easing: 'linear' } }
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

// builds all six sparkline charts on page load
function initAllCharts() {
    Object.keys(CHARTS).forEach(buildChart);
}

// fetches the latest sensor reading and pushes it into each chart
// falls back to simulated values if the API is unreachable
async function updateLiveChart() {
    let sensor;
    try {
        const res = await fetch('https://dev-engin-rws.pantheonsite.io/wp-json/rws/v1/sensors');
        const payload = await res.json();
        sensor = payload.data;
    } catch(e) {
        // API is down or sensors aren't pushing — generate fake data so the charts still show something
        console.warn('Sensor fetch failed, using fallback data:', e);
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

    // helper to safely update a DOM element with a rounded number
    const setEl = (id, val, dec) => {
        const el = document.getElementById(id);
        if (el && val != null) el.textContent = Number(val).toFixed(dec);
    };

    // map sensor fields to chart keys
    const incoming = {
        temp:     sensor.indoor_temp,
        humidity: sensor.indoor_humidity,
        wind:     sensor.wind_speed,
        rain:     sensor.rainfall,
        solar:    sensor.lux,
        radon:    sensor.radon_level,
    };

    // push values into the current conditions readouts
    setEl('current-temp',     incoming.temp,     1);
    setEl('current-humidity', incoming.humidity, 1);
    setEl('current-wind',     incoming.wind,     1);
    setEl('current-rain',     incoming.rain,     2);
    setEl('current-solar',    incoming.solar,    0);
    setEl('current-radon',    incoming.radon,    2);
    setEl('nav-temp',         sensor.indoor_temp, 0);

    // figure out the radiation status and update the shield card
    const rad    = sensor.radiation ?? 82;
    const season = getCurrentSeason();
    const status = getRadiationStatus(rad);
    setEl('current-rad', rad, 0);

    const radStatusEl = document.getElementById('rad-status-text');
    if (radStatusEl) {
        radStatusEl.textContent = status.text;
        radStatusEl.style.color = status.color;
    }

    // show the seasonal normal range below the status
    const radRangeEl = document.getElementById('rad-range-text');
    if (radRangeEl) radRangeEl.textContent = `${season.label} normal: ${season.low}–${season.high} nSv/h`;

    // color the shield border and glow based on the current status
    const shieldEl   = document.getElementById('rad-shield');
    const shieldIcon = document.getElementById('rad-shield-icon');
    if (shieldEl) {
        shieldEl.style.borderColor = status.color + '99';
        shieldEl.style.boxShadow   = `0 0 15px ${status.color}33`;
    }
    if (shieldIcon) shieldIcon.style.color = status.color;

    // update the info box below the shield with a short explanation
    const infoBox   = document.getElementById('rad-info-box');
    const infoIcon  = document.getElementById('rad-info-icon');
    const infoTitle = document.getElementById('rad-info-title');
    const infoText  = document.getElementById('rad-info-text');
    if (infoBox)   infoBox.style.borderColor = status.color + '33';
    if (infoIcon)  infoIcon.textContent      = status.icon;
    if (infoTitle) infoTitle.textContent     = status.title;
    if (infoText)  infoText.textContent      = status.body;

    setEl('weather-temp',  sensor.indoor_temp, 0);
    setEl('weather-feels', sensor.indoor_temp, 0);

    const ts = new Date(sensor.timestamp || new Date())
        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // push the new reading into each chart and drop the oldest point if we're over the limit
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

// shows/hides the radiation info popup
function openRadiationInfo() {
    const modal = document.getElementById('rad-info-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeRadiationInfo() {
    const modal = document.getElementById('rad-info-modal');
    if (modal) modal.classList.add('hidden');
}

// close the radiation modal when clicking the backdrop behind it
window.addEventListener('DOMContentLoaded', () => {
    const radModal = document.getElementById('rad-info-modal');
    if (radModal) radModal.addEventListener('click', e => { if (e.target === radModal) closeRadiationInfo(); });
});

// builds a CSV with all six sensor columns and triggers a download
function exportAllStationsCSV() {
    const keys = Object.keys(CHARTS);
    const maxLen = Math.max(...keys.map(k => CHARTS[k].labels.length));

    if (maxLen === 0) {
        alert('No data collected yet.');
        return;
    }

    // use the chart with the most points as the timestamp source
    const tsSource   = keys.find(k => CHARTS[k].labels.length === maxLen);
    const timestamps = CHARTS[tsSource].labels;
    const headers    = ['Timestamp', 'Temp (°F)', 'Humidity (%)', 'Wind (mph)', 'Rainfall (in)', 'Solar (lx)', 'Radon (pCi/L)'];
    const colKeys    = ['temp', 'humidity', 'wind', 'rain', 'solar', 'radon'];

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

    // create a temporary link and click it to trigger the download
    const csv  = rows.map(r => r.join(',')).join('\n');
    const date = new Date().toISOString().slice(0, 10);
    const a    = document.createElement('a');
    a.href     = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `RWS_AllStations_${date}.csv`;
    a.click();
}

// kick everything off once the page finishes loading
window.onload = function() {
    initThree();
    initAllCharts();
    updateLiveChart();
    setInterval(updateLiveChart, 5000); // poll every 5 seconds
};
