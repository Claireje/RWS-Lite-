/**
 * RWS Station Manager Engine (Enhanced Native Overlay Edition)
 * Fully handles Basement, CS Facility, and Room 1962.
 */

let history = { radon: [], temperature: [], moisture: [], soiltemp: [], wind: [], rainfall: [], solar: [], humidity: [], radiation: [], pressure: [] };
let instances = {};
let activeMetric = null;
let currentStation = 'unknown';
const MAX_PTS = 30;
const HISTORY_INTERVAL_MS = 10 * 60 * 1000; // log one reading per 10 minutes
let lastHistoryLogTime = 0;

// ── Native Chart.js Custom Average Baseline Plugin ──
const avgBaselinePlugin = {
    id: 'avgBaseline',
    // Swapping to afterDatasetsDraw ensures the baseline overlays smoothly ON TOP of trend fills
    afterDatasetsDraw(chart) {
        const data = chart.data.datasets[0]?.data || [];
        if (!data.length) return;
        
        // Compute precise current numerical baseline point average
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const { ctx, chartArea: { left, right }, scales: { y } } = chart;
        const yPos = y.getPixelForValue(avg);
        
        // Bounds-check protection to stop line from spilling into outer labels/margins
        if (yPos < chart.chartArea.top || yPos > chart.chartArea.bottom) return;
        
        ctx.save();
        // Crisp semitransparent baseline stroke configuration
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]); // Clean dashed baseline rhythm 
        
        ctx.beginPath(); 
        ctx.moveTo(left, yPos); 
        ctx.lineTo(right, yPos); 
        ctx.stroke();
        
        // Text Tag Details overlay rendering configuration
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = 'bold 9px monospace, system-ui';
        ctx.textAlign = 'right';
        
        // Dynamically shift text below the line if it gets too close to the chart ceiling
        const yOffset = (yPos - chart.chartArea.top < 15) ? 12 : -5;
        ctx.fillText('AVG ' + avg.toFixed(avg > 10 ? 1 : 2), right - 6, yPos + yOffset);
        
        ctx.restore();
    }
};

// ── Shared UI Management ──
function initClockAndDates() {
    setInterval(() => {
        const el = document.getElementById('top-bar-clock');
        if (el) el.textContent = new Date().toLocaleTimeString();
    }, 1000);

    const de = document.getElementById('greeting-date');
    if (de) de.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const md = document.getElementById('modal-generation-date');
    if (md) md.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function toggleRadiationsMenu() {
    const submenu = document.getElementById('radiations-submenu');
    const chevron = document.getElementById('radiation-chevron');
    
    if (submenu) {
        submenu.classList.toggle('hidden');
    }
    if (chevron) {
        chevron.classList.toggle('rotate-180');
    }
}

// ── Master Stations Matrix Configuration ──
const STATIONS_CONFIG = {
    'basement': {
        apiEndpoint: '/api/insert-sample',
        exportFilename: () => `RWS_Basement_${new Date().toISOString().slice(0, 10)}.csv`,
        csvHeaders: ['Timestamp', 'Radon (pCi/L)', 'Temp (°F)', 'Soil Moisture (%)', 'Soil Temp (°F)'],
        csvRowMapping: (i) => [
            history.radon[i]?.ts || '', history.radon[i]?.val?.toFixed(2) || '',
            history.temperature[i]?.val?.toFixed(1) || '', history.moisture[i]?.val?.toFixed(1) || '',
            history.soiltemp[i]?.val?.toFixed(1) || ''
        ],
        metrics: {
            radon: { canvas: 'radonChart', color: '#fb7185', label: 'Radon Concentration', dec: 2, unit: ' pCi/L', avgId: 'avg-radon' },
            temperature: { canvas: 'tempChart', color: '#c084fc', label: 'Ambient Temperature', dec: 1, unit: '°F', avgId: 'avg-temp' },
            moisture: { canvas: 'moistureChart', color: '#4ade80', label: 'Soil Moisture', dec: 1, unit: '%', avgId: 'avg-moisture' },
            soiltemp: { canvas: 'soiltempChart', color: '#fbbf24', label: 'Soil Temperature', dec: 1, unit: '°F', avgId: 'avg-soiltemp' }
        },
        generateFallbackData: () => ({
            radon_level: 1.2 + (Math.random() * 0.4 - 0.2),
            indoor_temp: 54.0 + (Math.random() * 2 - 1),
            soil_moisture: 32.5 + (Math.random() * 3 - 1.5),
            soil_temperature: 54.0 + (Math.random() * 2 - 1),
            timestamp: new Date().toISOString()
        }),
        updateUI: (sensor) => {
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            const t = Number(sensor.indoor_temp ?? 54);
            set('weather-temp', t.toFixed(0));
            set('weather-feels', t.toFixed(0));
            set('weather-hi', (t + 4).toFixed(0) + ' F');
            set('weather-lo', (t - 5).toFixed(0) + ' F');
            set('nav-temp', t.toFixed(0) + '°F');

            const radon = sensor.radon_level ?? 1.2;
            set('current-radon', radon.toFixed(2));
            set('radon-card-val', radon.toFixed(2) + ' pCi/L');
            set('current-temp', t.toFixed(1));
            set('current-moisture', Number(sensor.soil_moisture ?? 32.5).toFixed(1));
            set('current-soiltemp', Number(sensor.soil_temperature ?? 54).toFixed(1));

            const radonStatusEl = document.getElementById('radon-status-text');
            if (radonStatusEl) {
                radonStatusEl.textContent = radon >= 4.0 ? 'ACTION REQUIRED' : radon >= 2.0 ? 'Monitor' : 'Safe';
                radonStatusEl.className = radon >= 4.0 ? 'text-2xl font-black text-rose-400' : radon >= 2.0 ? 'text-2xl font-black text-amber-400' : 'text-2xl font-black text-[#22c55e]';
            }
            return { radon: sensor.radon_level, temperature: sensor.indoor_temp, moisture: sensor.soil_moisture, soiltemp: sensor.soil_temperature };
        }
    },
    'cs-facility': {
        apiEndpoint: '/api/insert-sample',
        exportFilename: () => `RWS_CSFacility_${new Date().toISOString().slice(0, 10)}.csv`,
        csvHeaders: ['Timestamp', 'Temp (°F)', 'Wind (mph)', 'Rainfall (in)', 'Solar (lx)'],
        csvRowMapping: (i) => [
            history.temperature[i]?.ts || '', history.temperature[i]?.val?.toFixed(1) || '',
            history.wind[i]?.val?.toFixed(1) || '', history.rainfall[i]?.val?.toFixed(3) || '',
            history.solar[i]?.val?.toFixed(0) || ''
        ],
        metrics: {
            temperature: { canvas: 'tempChart', color: '#c084fc', label: 'Ambient Temp', dec: 1, unit: '°F', avgId: 'avg-temp' },
            wind: { canvas: 'windChart', color: '#34d399', label: 'Wind Speed', dec: 1, unit: ' mph', avgId: 'avg-wind' },
            rainfall: { canvas: 'rainChart', color: '#60a5fa', label: 'Rainfall Volume', dec: 3, unit: ' in', avgId: 'avg-rain' },
            solar: { canvas: 'solarChart', color: '#facc15', label: 'Solar Density', dec: 0, unit: ' lx', avgId: 'avg-solar' }
        },
        generateFallbackData: () => ({ indoor_temp: 56.0 + (Math.random() * 2 - 1), wind_speed: Math.max(0, 12 + (Math.random() * 4 - 2)), rainfall: Math.max(0, Math.random() * 0.005), lux: 480 + (Math.random() * 60 - 30), timestamp: new Date().toISOString() }),
        updateUI: (sensor) => {
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            const t = Number(sensor.indoor_temp ?? 56);
            set('weather-temp', t.toFixed(0)); set('weather-feels', t.toFixed(0)); set('nav-temp', t.toFixed(0) + '°F');
            set('current-temp', t.toFixed(1));
            set('current-wind', Number(sensor.wind_speed ?? 12).toFixed(1));
            set('current-rain', Number(sensor.rainfall ?? 0).toFixed(3));
            set('current-solar', Number(sensor.lux ?? 480).toFixed(0));
            return { temperature: sensor.indoor_temp, wind: sensor.wind_speed, rainfall: sensor.rainfall, solar: sensor.lux };
        }
    },
    'rm1962': {
        apiEndpoint: '/api/insert-sample',
        exportFilename: () => `RWS_RM1962_${new Date().toISOString().slice(0, 10)}.csv`,
        csvHeaders: ['Timestamp', 'Temp (°F)', 'Humidity (%)', 'Radiation (nSv/h)', 'Pressure (hPa)'],
        csvRowMapping: (i) => [
            history.temperature[i]?.ts || '', history.temperature[i]?.val?.toFixed(1) || '',
            history.humidity[i]?.val?.toFixed(1) || '', history.radiation[i]?.val?.toFixed(0) || '',
            history.pressure[i]?.val?.toFixed(1) || ''
        ],
        metrics: {
            temperature: { canvas: 'tempChart', color: '#c084fc', label: 'Ambient Temperature', dec: 1, unit: '°F', avgId: 'avg-temp' },
            humidity: { canvas: 'humidityChart', color: '#22d3ee', label: 'Relative Humidity', dec: 1, unit: '%', avgId: 'avg-humidity' },
            radiation: { canvas: 'radiationChart', color: '#34d399', label: 'Ambient Radiation', dec: 0, unit: ' nSv/h', avgId: 'avg-radiation' },
            pressure: { canvas: 'pressureChart', color: '#60a5fa', label: 'Barometric Pressure', dec: 1, unit: ' hPa', avgId: 'avg-pressure' }
        },
        generateFallbackData: () => ({ indoor_temp: 71.0 + (Math.random() * 2 - 1), indoor_humidity: 48.0 + (Math.random() * 4 - 2), radiation: 82 + (Math.random() * 8 - 4), indoor_pressure: 1013 + (Math.random() * 4 - 2), timestamp: new Date().toISOString() }),
        updateUI: (sensor) => {
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            const t = Number(sensor.indoor_temp ?? 71);
            set('weather-temp', t.toFixed(0)); set('weather-feels', t.toFixed(0)); set('nav-temp', t.toFixed(0) + '°F');
            set('current-temp', t.toFixed(1));
            set('current-humidity', Number(sensor.indoor_humidity ?? 48).toFixed(1));
            set('current-radiation', Math.round(sensor.radiation ?? 82));
            set('current-pressure', Number(sensor.indoor_pressure ?? 1013).toFixed(1));
            return { temperature: sensor.indoor_temp, humidity: sensor.indoor_humidity, radiation: sensor.radiation, pressure: sensor.indoor_pressure };
        }
    }
};

// ── Core Operational Loops ──
function buildChart(key, m) {
    const ctx = document.getElementById(m.canvas);
    if (!ctx) return;
    instances[key] = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ data: [], borderColor: m.color, backgroundColor: m.color + '14', borderWidth: 2, tension: 0.4, pointRadius: 0, fill: true }] },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            layout: {
                padding: { top: 12, bottom: 4 } // Provides tiny breathing room for text bounds labels
            },
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 9 }, maxTicksLimit: 6, maxRotation: 0 } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 9 }, maxTicksLimit: 5 } }
            }
        },
        plugins: [avgBaselinePlugin]
    });
}

async function fetchAndUpdate() {
    const config = STATIONS_CONFIG[currentStation];
    if (!config) return;

    let sensor;
    try {
        const res = await fetch('/api/live-data');
        sensor = (await res.json()).data;
    } catch (_) {
        sensor = config.generateFallbackData();
    }
    if (!sensor) return;

    const pushMap = config.updateUI(sensor);
    const readingTime = new Date(sensor.timestamp || Date.now());
    const ts = readingTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const keys = Object.keys(config.metrics);
    const checkInst = instances[keys[0]];
    if (!checkInst || !checkInst.data.labels.length || checkInst.data.labels[checkInst.data.labels.length - 1] !== ts) {
        keys.forEach(key => {
            const inst = instances[key];
            const m = config.metrics[key];
            if (!inst) return;

            const val = pushMap[key] ?? 0;
            inst.data.labels.push(ts);
            inst.data.datasets[0].data.push(val);

            if (inst.data.labels.length > MAX_PTS) { inst.data.labels.shift(); inst.data.datasets[0].data.shift(); }
            if (readingTime.getTime() - lastHistoryLogTime >= HISTORY_INTERVAL_MS) {
                history[key].push({ ts, val, t: readingTime.getTime() });
                if (history[key].length > MAX_PTS) history[key].shift();
            }

            const vals = inst.data.datasets[0].data;
            const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
            const avgEl = document.getElementById(m.avgId);
            if (avgEl) avgEl.textContent = avg.toFixed(m.dec);

            // FIX: Use default update mode or custom configurations to force clear custom canvas strokes
            inst.update(); 
        });
        // Advance the history log timer after all keys are processed
        if (readingTime.getTime() - lastHistoryLogTime >= HISTORY_INTERVAL_MS) {
            lastHistoryLogTime = readingTime.getTime();
        }
        if (activeMetric) renderReportTable(activeMetric);
    }
}

// ── Window Bindings ──

// Returns history entries filtered by the current time range inputs
function getFilteredHistory(metric) {
    const hist = history[metric] || [];
    const fromEl = document.getElementById('filter-from');
    const toEl   = document.getElementById('filter-to');
    const from   = fromEl?.value; // "HH:MM"
    const to     = toEl?.value;
    if (!from && !to) return hist;
    return hist.filter(h => {
        if (!h.t) return true;
        const hhmm = new Date(h.t).toTimeString().slice(0, 5);
        if (from && hhmm < from) return false;
        if (to   && hhmm > to)   return false;
        return true;
    });
}

// Re-renders the stats row and table using the current filter
function renderReportTable(metric) {
    const config = STATIONS_CONFIG[currentStation];
    if (!config || !config.metrics[metric]) return;
    const meta     = config.metrics[metric];
    const filtered = getFilteredHistory(metric);
    const vals     = filtered.map(h => h.val);
    const fmt      = v => Number(v).toFixed(meta.dec) + meta.unit;

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setVal('modal-stat-current', vals.length ? fmt(vals[vals.length - 1]) : '--');
    setVal('modal-stat-min',     vals.length ? fmt(Math.min(...vals))     : '--');
    setVal('modal-stat-max',     vals.length ? fmt(Math.max(...vals))     : '--');
    setVal('modal-stat-avg',     vals.length ? fmt(vals.reduce((a, b) => a + b, 0) / vals.length) : '--');

    const tableRows = document.getElementById('modal-table-rows');
    if (tableRows) {
        tableRows.innerHTML = filtered.length
            ? filtered.slice().reverse().map((h, i) =>
                `<tr class="hover:bg-slate-50"><td class="px-4 py-2 font-mono text-slate-400">${filtered.length - i}</td><td class="px-4 py-2">${h.ts}</td><td class="px-4 py-2 text-right font-mono font-bold">${fmt(h.val)}</td></tr>`
            ).join('')
            : `<tr><td colspan="3" class="px-4 py-6 text-center text-slate-400 text-xs">No readings in this time range.</td></tr>`;
    }
}

function openReportPopup(metric) {
    activeMetric = metric;
    const config = STATIONS_CONFIG[currentStation];
    if (!config || !config.metrics[metric]) return;

    const titleEl = document.getElementById('modal-metric-title');
    if (titleEl) titleEl.textContent = config.metrics[metric].label;

    // Pre-fill time range with the bounds of available data
    const hist = history[metric] || [];
    if (hist.length) {
        const fromEl = document.getElementById('filter-from');
        const toEl   = document.getElementById('filter-to');
        if (fromEl && !fromEl.value && hist[0].t)
            fromEl.value = new Date(hist[0].t).toTimeString().slice(0, 5);
        if (toEl && !toEl.value && hist[hist.length - 1].t)
            toEl.value = new Date(hist[hist.length - 1].t).toTimeString().slice(0, 5);
    }

    renderReportTable(metric);

    const modal = document.getElementById('report-modal');
    if (modal) modal.classList.remove('hidden');
}

function applyTimeFilter() {
    if (activeMetric) renderReportTable(activeMetric);
}

function clearTimeFilter() {
    const fromEl = document.getElementById('filter-from');
    const toEl   = document.getElementById('filter-to');
    if (fromEl) fromEl.value = '';
    if (toEl)   toEl.value   = '';
    if (activeMetric) renderReportTable(activeMetric);
}

function closeReportPopup() {
    const modal = document.getElementById('report-modal');
    if (modal) modal.classList.add('hidden');
    activeMetric = null;
    const fromEl = document.getElementById('filter-from');
    const toEl   = document.getElementById('filter-to');
    if (fromEl) fromEl.value = '';
    if (toEl)   toEl.value   = '';
}

function downloadAllCombinedCSV() {
    const config = STATIONS_CONFIG[currentStation];
    if (!config) return;
    const rows = [config.csvHeaders];
    const maxLen = Math.max(...Object.keys(config.metrics).map(k => history[k].length), 0);
    for (let i = 0; i < maxLen; i++) rows.push(config.csvRowMapping(i));
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.map(r => r.join(',')).join('\n'));
    a.download = config.exportFilename();
    a.click();
}

async function insertSampleData() {
    const config = STATIONS_CONFIG[currentStation];
    if (!config) return;
    try {
        await fetch(config.apiEndpoint, { method: 'POST' });
        alert('Sample telemetry dispatched.');
    } catch (e) {
        console.error(e);
    }
}

// ── Startup Context Bootstrapper ──
document.addEventListener('DOMContentLoaded', () => {
    initClockAndDates();

    const scriptTag = document.querySelector('script[src*="station-manager.js"]');
    if (scriptTag && scriptTag.getAttribute('data-station')) {
        currentStation = scriptTag.getAttribute('data-station');
    } else {
        if (document.getElementById('radonChart')) currentStation = 'basement';
        else if (document.getElementById('solarChart')) currentStation = 'cs-facility';
        else if (document.getElementById('humidityChart')) currentStation = 'rm1962';
    }

    const config = STATIONS_CONFIG[currentStation];
    if (!config) return;

    Object.entries(config.metrics).forEach(([k, m]) => buildChart(k, m));
    
    const modal = document.getElementById('report-modal');
    if (modal) modal.addEventListener('click', function (e) { if (e.target === this) closeReportPopup(); });

    fetchAndUpdate();
    setInterval(fetchAndUpdate, 5000);
});

window.toggleRadiationsMenu   = toggleRadiationsMenu;
window.openReportPopup        = openReportPopup;
window.closeReportPopup       = closeReportPopup;
window.applyTimeFilter        = applyTimeFilter;
window.clearTimeFilter        = clearTimeFilter;
window.downloadAllCombinedCSV = downloadAllCombinedCSV;
window.insertSampleData       = insertSampleData;