// Shared script for all three station pages (basement, cs-facility, rm1962).
// Detects which page it's on at load time and runs accordingly.

let history = { radon: [], temperature: [], moisture: [], soiltemp: [], wind: [], rainfall: [], solar: [], humidity: [], radiation: [], pressure: [] };
let instances = {};
let activeMetric = null;
let currentStation = 'unknown';
const MAX_PTS = 30;
const HISTORY_INTERVAL_MS = 10 * 60 * 1000;
let lastHistoryLogTime = 0;

// draws a dashed average line across each chart
const avgBaselinePlugin = {
    id: 'avgBaseline',
    afterDatasetsDraw(chart) {
        const data = chart.data.datasets[0]?.data || [];
        if (!data.length) return;

        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const { ctx, chartArea: { left, right }, scales: { y } } = chart;
        const yPos = y.getPixelForValue(avg);

        if (yPos < chart.chartArea.top || yPos > chart.chartArea.bottom) return;

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(left, yPos);
        ctx.lineTo(right, yPos);
        ctx.stroke();

        const yOffset = (yPos - chart.chartArea.top < 15) ? 12 : -5;
        ctx.fillText('AVG ' + avg.toFixed(avg > 10 ? 1 : 2), right - 6, yPos + yOffset);
        ctx.restore();
    }
};

function initClockAndDates() {
    setInterval(() => {
        const el = document.getElementById('top-bar-clock');
        if (el) el.textContent = new Date().toLocaleTimeString();
    }, 1000);

    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const de = document.getElementById('greeting-date');
    const md = document.getElementById('modal-generation-date');
    if (de) de.textContent = dateStr;
    if (md) md.textContent = dateStr;
}

function toggleRadiationsMenu() {
    const submenu = document.getElementById('radiations-submenu');
    const chevron = document.getElementById('radiation-chevron');
    if (submenu) submenu.classList.toggle('hidden');
    if (chevron) chevron.classList.toggle('collapsed');
}

const STATIONS_CONFIG = {
    'basement': {
        exportFilename: () => `RWS_Basement_${new Date().toISOString().slice(0, 10)}.csv`,
        csvHeaders: ['Timestamp', 'Radon (pCi/L)', 'Temp (°F)', 'Soil Moisture (%)', 'Soil Temp (°F)'],
        csvRowMapping: (i) => [
            history.radon[i]?.ts || '', history.radon[i]?.val?.toFixed(2) || '',
            history.temperature[i]?.val?.toFixed(1) || '', history.moisture[i]?.val?.toFixed(1) || '',
            history.soiltemp[i]?.val?.toFixed(1) || ''
        ],
        metrics: {
            radon:       { canvas: 'radonChart',    color: '#fb7185', label: 'Radon Concentration', dec: 2, unit: ' pCi/L', avgId: 'avg-radon' },
            temperature: { canvas: 'tempChart',     color: '#c084fc', label: 'Ambient Temperature', dec: 1, unit: '°F',     avgId: 'avg-temp' },
            moisture:    { canvas: 'moistureChart', color: '#4ade80', label: 'Soil Moisture',        dec: 1, unit: '%',      avgId: 'avg-moisture' },
            soiltemp:    { canvas: 'soiltempChart', color: '#fbbf24', label: 'Soil Temperature',     dec: 1, unit: '°F',     avgId: 'avg-soiltemp' }
        },
        generateFallbackData: () => ({
            radon_level:      1.2  + (Math.random() * 0.4 - 0.2),
            indoor_temp:      54.0 + (Math.random() * 2 - 1),
            soil_moisture:    32.5 + (Math.random() * 3 - 1.5),
            soil_temperature: 54.0 + (Math.random() * 2 - 1),
            timestamp: new Date().toISOString()
        }),
        updateUI: (sensor) => {
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            const t = Number(sensor.indoor_temp ?? 54);
            set('weather-temp',  t.toFixed(0));
            set('weather-feels', t.toFixed(0));
            set('weather-hi',    (t + 4).toFixed(0) + ' F');
            set('weather-lo',    (t - 5).toFixed(0) + ' F');
            set('nav-temp',      t.toFixed(0) + '°F');
            set('current-radon',    (sensor.radon_level ?? 1.2).toFixed(2));
            set('radon-card-val',   (sensor.radon_level ?? 1.2).toFixed(2) + ' pCi/L');
            set('current-temp',     t.toFixed(1));
            set('current-moisture', Number(sensor.soil_moisture ?? 32.5).toFixed(1));
            set('current-soiltemp', Number(sensor.soil_temperature ?? 54).toFixed(1));

            return { radon: sensor.radon_level, temperature: sensor.indoor_temp, moisture: sensor.soil_moisture, soiltemp: sensor.soil_temperature };
        }
    },
    'cs-facility': {
        exportFilename: () => `RWS_CSFacility_${new Date().toISOString().slice(0, 10)}.csv`,
        csvHeaders: ['Timestamp', 'Temp (°F)', 'Wind (mph)', 'Rainfall (in)', 'Solar (lx)'],
        csvRowMapping: (i) => [
            history.temperature[i]?.ts || '', history.temperature[i]?.val?.toFixed(1) || '',
            history.wind[i]?.val?.toFixed(1) || '', history.rainfall[i]?.val?.toFixed(3) || '',
            history.solar[i]?.val?.toFixed(0) || ''
        ],
        metrics: {
            temperature: { canvas: 'tempChart',  color: '#c084fc', label: 'Ambient Temp',   dec: 1, unit: '°F',   avgId: 'avg-temp' },
            wind:        { canvas: 'windChart',  color: '#4ade80', label: 'Wind Speed',      dec: 1, unit: ' mph', avgId: 'avg-wind' },
            rainfall:    { canvas: 'rainChart',  color: '#38bdf8', label: 'Rainfall Volume', dec: 3, unit: ' in',  avgId: 'avg-rain' },
            solar:       { canvas: 'solarChart', color: '#fbbf24', label: 'Solar Density',   dec: 0, unit: ' lx',  avgId: 'avg-solar' }
        },
        generateFallbackData: () => ({
            indoor_temp: 56.0 + (Math.random() * 2 - 1),
            wind_speed:  Math.max(0, 12 + (Math.random() * 4 - 2)),
            rainfall:    Math.max(0, Math.random() * 0.005),
            lux:         480 + (Math.random() * 60 - 30),
            timestamp:   new Date().toISOString()
        }),
        updateUI: (sensor) => {
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            const t = Number(sensor.indoor_temp ?? 56);
            set('weather-temp',  t.toFixed(0));
            set('weather-feels', t.toFixed(0));
            set('nav-temp',      t.toFixed(0) + '°F');
            set('current-temp',  t.toFixed(1));
            set('current-wind',  Number(sensor.wind_speed ?? 12).toFixed(1));
            set('current-rain',  Number(sensor.rainfall ?? 0).toFixed(3));
            set('current-solar', Number(sensor.lux ?? 480).toFixed(0));
            return { temperature: sensor.indoor_temp, wind: sensor.wind_speed, rainfall: sensor.rainfall, solar: sensor.lux };
        }
    },
    'rm1962': {
        exportFilename: () => `RWS_RM1962_${new Date().toISOString().slice(0, 10)}.csv`,
        csvHeaders: ['Timestamp', 'Temp (°F)', 'Humidity (%)', 'Radiation (nSv/h)', 'Pressure (hPa)'],
        csvRowMapping: (i) => [
            history.temperature[i]?.ts || '', history.temperature[i]?.val?.toFixed(1) || '',
            history.humidity[i]?.val?.toFixed(1) || '', history.radiation[i]?.val?.toFixed(0) || '',
            history.pressure[i]?.val?.toFixed(1) || ''
        ],
        metrics: {
            temperature: { canvas: 'tempChart',      color: '#c084fc', label: 'Ambient Temperature', dec: 1, unit: '°F',    avgId: 'avg-temp' },
            humidity:    { canvas: 'humidityChart',  color: '#38bdf8', label: 'Relative Humidity',   dec: 1, unit: '%',      avgId: 'avg-humidity' },
            radiation:   { canvas: 'radiationChart', color: '#34d399', label: 'Ambient Radiation',   dec: 0, unit: ' nSv/h', avgId: 'avg-radiation' },
            pressure:    { canvas: 'pressureChart',  color: '#60a5fa', label: 'Barometric Pressure', dec: 1, unit: ' hPa',   avgId: 'avg-pressure' }
        },
        generateFallbackData: () => ({
            indoor_temp:     71.0 + (Math.random() * 2 - 1),
            indoor_humidity: 48.0 + (Math.random() * 4 - 2),
            radiation:       82   + (Math.random() * 8 - 4),
            indoor_pressure: 1013 + (Math.random() * 4 - 2),
            timestamp: new Date().toISOString()
        }),
        updateUI: (sensor) => {
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            const t = Number(sensor.indoor_temp ?? 71);
            set('weather-temp',      t.toFixed(0));
            set('weather-feels',     t.toFixed(0));
            set('nav-temp',          t.toFixed(0) + '°F');
            set('current-temp',      t.toFixed(1));
            set('current-humidity',  Number(sensor.indoor_humidity ?? 48).toFixed(1));
            set('current-radiation', Math.round(sensor.radiation ?? 82));
            set('current-pressure',  Number(sensor.indoor_pressure ?? 1013).toFixed(1));
            return { temperature: sensor.indoor_temp, humidity: sensor.indoor_humidity, radiation: sensor.radiation, pressure: sensor.indoor_pressure };
        }
    }
};

function buildChart(key, m) {
    const ctx = document.getElementById(m.canvas);
    if (!ctx) return;
    instances[key] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{ data: [], borderColor: m.color, backgroundColor: m.color + '14', borderWidth: 2, tension: 0.4, pointRadius: 0, fill: true }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            layout: { padding: { top: 12, bottom: 4 } },
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        maxTicksLimit: 6, maxRotation: 0,
                        // "Now" is bigger + white so it stands out from the regular
                        // gray timestamp labels
                        color: (ctx) => ctx.tick.value === ctx.scale.getLabels().length - 1 ? '#ffffff' : '#64748b',
                        font: (ctx) => ctx.tick.value === ctx.scale.getLabels().length - 1
                            ? { size: 11, weight: 'bold' }
                            : { size: 9 },
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
        const res = await fetch(`https://dev-engin-rws.pantheonsite.io/live-data.php?station=${currentStation}`);
        if (!res.ok) throw new Error('bad response');
        sensor = (await res.json()).data;
    } catch (_) {
        sensor = config.generateFallbackData();
    }
    if (!sensor) sensor = config.generateFallbackData();

    const pushMap = config.updateUI(sensor);
    const now = new Date();
    const ts = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const keys = Object.keys(config.metrics);
    const first = instances[keys[0]];
    const labels = first?.data.labels;

    // skip duplicate timestamps
    if (!first || !labels.length || labels[labels.length - 1] !== ts) {
        keys.forEach(key => {
            const inst = instances[key];
            const m = config.metrics[key];
            if (!inst) return;

            const val = pushMap[key] ?? 0;
            inst.data.labels.push(ts);
            inst.data.datasets[0].data.push(val);
            if (inst.data.labels.length > MAX_PTS) {
                inst.data.labels.shift();
                inst.data.datasets[0].data.shift();
            }

            if (now.getTime() - lastHistoryLogTime >= HISTORY_INTERVAL_MS) {
                history[key].push({ ts, val, t: now.getTime() });
                if (history[key].length > MAX_PTS) history[key].shift();
            }

            const vals = inst.data.datasets[0].data.filter(v => !isNaN(v) && v !== null);
            const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
            const avgEl = document.getElementById(m.avgId);
            if (avgEl) avgEl.textContent = avg.toFixed(m.dec);

            inst.update();
        });

        if (now.getTime() - lastHistoryLogTime >= HISTORY_INTERVAL_MS) lastHistoryLogTime = now.getTime();
        if (activeMetric) renderReportTable(activeMetric);
    }
}

function getFilteredHistory(metric) {
    const hist = history[metric] || [];
    const from = document.getElementById('filter-from')?.value;
    const to   = document.getElementById('filter-to')?.value;
    if (!from && !to) return hist;
    return hist.filter(h => {
        if (!h.t) return true;
        const hhmm = new Date(h.t).toTimeString().slice(0, 5);
        if (from && hhmm < from) return false;
        if (to   && hhmm > to)   return false;
        return true;
    });
}

function renderReportTable(metric) {
    const config = STATIONS_CONFIG[currentStation];
    if (!config || !config.metrics[metric]) return;

    const meta     = config.metrics[metric];
    const filtered = getFilteredHistory(metric);
    const vals     = filtered.map(h => h.val);
    const fmt      = v => Number(v).toFixed(meta.dec) + meta.unit;

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setVal('modal-stat-current', vals.length ? fmt(vals[vals.length - 1])                         : '--');
    setVal('modal-stat-min',     vals.length ? fmt(Math.min(...vals))                              : '--');
    setVal('modal-stat-max',     vals.length ? fmt(Math.max(...vals))                              : '--');
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

    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = config.exportFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => {
    initClockAndDates();

    if (document.getElementById('radonChart'))         currentStation = 'basement';
    else if (document.getElementById('solarChart'))    currentStation = 'cs-facility';
    else if (document.getElementById('humidityChart')) currentStation = 'rm1962';

    const config = STATIONS_CONFIG[currentStation];
    if (!config) return;

    Object.entries(config.metrics).forEach(([k, m]) => buildChart(k, m));

    const modal = document.getElementById('report-modal');
    if (modal) modal.addEventListener('click', function(e) { if (e.target === this) closeReportPopup(); });

    fetchAndUpdate();
    setInterval(fetchAndUpdate, 5000);
});

window.toggleRadiationsMenu   = toggleRadiationsMenu;
window.openReportPopup        = openReportPopup;
window.closeReportPopup       = closeReportPopup;
window.applyTimeFilter        = applyTimeFilter;
window.clearTimeFilter        = clearTimeFilter;
window.downloadAllCombinedCSV = downloadAllCombinedCSV;
