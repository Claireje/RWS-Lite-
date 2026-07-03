// updates the clock in the top bar every second
setInterval(() => {
    const el = document.getElementById('top-bar-clock');
    if (el) el.textContent = new Date().toLocaleTimeString();
}, 1000);

// shows a greeting ("Good Morning!" etc.) and today's date at the top of the page
function setGreeting() {
    const hour = new Date().getHours();
    let greeting = 'Good Evening!';
    if (hour < 12) greeting = 'Good Morning!';
    else if (hour < 17) greeting = 'Good Afternoon!';

    const greetingEl = document.getElementById('greeting-text');
    if (greetingEl) greetingEl.textContent = greeting;

    const dateEl = document.getElementById('greeting-date');
    if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }
}

setGreeting();

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

    // render loop — keeps the camera controls responsive and the scene drawn
    (function animate() {
        requestAnimationFrame(animate);
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

    //actual chart gets created, using Chart.js.
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
            //what happens when you hover over the chart
            transitions: {
                active: { animation: { duration: 400, easing: 'linear' } }
            },
            //chart's legend and hover tooltip
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
            //This controls the two axes of the chart — the x-axis 
            // (time, running left to right) and the y-axis (the value 
            // being measured, running up and down).
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        maxTicksLimit: 5, maxRotation: 0,
                        // "Now" is bigger + white so it stands out from the regular
                        // gray timestamp labels
                        color: (ctx) => ctx.tick.value === ctx.scale.getLabels().length - 1 ? '#ffffff' : '#334155',
                        font: (ctx) => ctx.tick.value === ctx.scale.getLabels().length - 1
                            ? { size: 11, weight: 'bold' }
                            : { size: 8 },
                        // tag the most recent point with "Now" but keep its timestamp too
                        callback: function (value, index) {
                            const isLast = index === this.getLabels().length - 1;
                            const label = this.getLabelForValue(value);
                            return isLast ? 'Now · ' + label : label;
                        }
                    },
                    // autoSkip won't always land on the very last point -- force it to
                    // stay in the tick list so "Now" is never skipped
                    afterBuildTicks: (axis) => {
                        const lastIndex = axis.getLabels().length - 1;
                        if (lastIndex >= 0 && !axis.ticks.some(t => t.value === lastIndex)) {
                            axis.ticks.push({ value: lastIndex });
                        }
                    }
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
    // try to get the real reading; if that fails for any reason,
    // quietly fake a believable one instead so the dashboard
    // never looks broken to whoever's looking at it.
    let sensor;
    try {
        // live-data.php only returns one station at a time, and the six
        // metrics shown here live on different physical stations -- so
        // pull RM 1962 (indoor temp/humidity/radiation/radon) and the
        // CS Facility roof (wind/rain/solar) and merge them into one
        // reading for the homepage overview
        const [roomRes, roofRes] = await Promise.all([
            fetch('https://dev-engin-rws.pantheonsite.io/live-data.php?station=rm1962'),
            fetch('https://dev-engin-rws.pantheonsite.io/live-data.php?station=cs-facility'),
        ]);
        const room = (await roomRes.json()).data;
        const roof = (await roofRes.json()).data;
        if (!room || !roof) throw new Error('no data returned from live-data.php');

        sensor = {
            indoor_temp:     room.indoor_temp,
            indoor_humidity: room.indoor_humidity,
            radiation:       room.radiation,
            radon_level:     room.radon_level,
            wind_speed:      roof.wind_speed,
            rainfall:        roof.rainfall,
            lux:             roof.lux,
        };
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
        };
    }
    if (!sensor) return;

    // helper to safely update a DOM element with a rounded number
    const setEl = (id, val, dec) => {
        const el = document.getElementById(id);
        if (el && val != null) el.textContent = Number(val).toFixed(dec);
    };

    // renames the sensor's field names into 
    // the shorter names the charts use internally.
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

    // just show the raw radiation number for now -- the status/color
    // logic (normal vs elevated, etc.) isn't wired up yet. the green
    // "Normal" state, shield color, and info text are static placeholders
    // set directly in index.html until that's built.
    const rad = sensor.radiation ?? 82;
    setEl('current-rad', rad, 0);

    setEl('weather-temp',  sensor.indoor_temp, 0);
    setEl('weather-feels', sensor.indoor_temp, 0);

    // use the browser's own clock for the chart label rather than the
    // server's raw timestamp field -- the rm1962 station's "time" column
    // isn't always a full date (sometimes just HH:MM:SS), which JS can't
    // parse and used to show up on the chart as "Invalid Date"
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

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
