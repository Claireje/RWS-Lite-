/**
 * RWS Station Manager
 * Shared script for the Basement, CS Facility, and Room 1962 dashboard pages.
 */

let history = { radon: [], temperature: [], moisture: [], soiltemp: [], wind: [], rainfall: [], solar: [], humidity: [], radiation: [], pressure: [] };
let instances = {};
let activeMetric = null;
let currentStation = 'unknown';
const MAX_PTS = 30;
const HISTORY_INTERVAL_MS = 10 * 60 * 1000; // log one reading every 10 minutes
let lastHistoryLogTime = 0;

// Custom Chart.js plugin that draws a dashed average line across each chart
const avgBaselinePlugin = {
    id: 'avgBaseline',
    afterDatasetsDraw(chart) {
        // grab the chart's data points, bail if empty
        const data = chart.data.datasets[0]?.data || [];
        if (!data.length) return;

        // calculate the average of all visible data points
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        // pull out the canvas context, left/right edges, and y-axis
        const { ctx, chartArea: { left, right }, scales: { y } } = chart;
        // convert the average value into a pixel position on the y-axis
        const yPos = y.getPixelForValue(avg);

        // skip drawing if the line would land outside the chart area
        if (yPos < chart.chartArea.top || yPos > chart.chartArea.bottom) return;

        ctx.save();
        // style the dashed line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);

        // draw the line from left edge to right edge
        ctx.beginPath();
        ctx.moveTo(left, yPos);
        ctx.lineTo(right, yPos);
        ctx.stroke();

        const yOffset = (yPos - chart.chartArea.top < 15) ? 12 : -5;
        ctx.fillText('AVG ' + avg.toFixed(avg > 10 ? 1 : 2), right - 6, yPos + yOffset);

        // put the canvas style back to what it was before
        ctx.restore();
    }
};

// updates the clock every second and fills in today's date on the page
function initClockAndDates() {
    // tick every second and update the clock in the top bar
    setInterval(() => {
        const el = document.getElementById('top-bar-clock');
        if (el) el.textContent = new Date().toLocaleTimeString();
    }, 1000);

    // fill in the date shown in the greeting banner
    const de = document.getElementById('greeting-date');
    if (de) de.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // fill in the date shown inside the report modal
    const md = document.getElementById('modal-generation-date');
    if (md) md.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// shows/hides the radiations dropdown and spins the arrow
function toggleRadiationsMenu() {
    const submenu = document.getElementById('radiations-submenu');
    const chevron = document.getElementById('radiation-chevron');
    if (submenu) submenu.classList.toggle('hidden');
    if (chevron) chevron.classList.toggle('rotate-180');
}

// Each station has its own config object so the rest of the script stays station-agnostic
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
            soiltemp:    { canvas: 'soiltempChart', color: '#fbbf24', label: 'Soil Temperature',     dec: 1, unit: '°F',    avgId: 'avg-soiltemp' }
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

            const radon = sensor.radon_level ?? 1.2;
            set('current-radon',   radon.toFixed(2));
            set('radon-card-val',  radon.toFixed(2) + ' pCi/L');
            set('current-temp',    t.toFixed(1));
            set('current-moisture', Number(sensor.soil_moisture ?? 32.5).toFixed(1));
            set('current-soiltemp', Number(sensor.soil_temperature ?? 54).toFixed(1));

            // EPA action level is 4.0 pCi/L
            const radonStatusEl = document.getElementById('radon-status-text');
            if (radonStatusEl) {
                radonStatusEl.textContent = radon >= 4.0 ? 'ACTION REQUIRED' : radon >= 2.0 ? 'Monitor' : 'Safe';
                radonStatusEl.className   = radon >= 4.0 ? 'text-2xl font-black text-rose-400' : radon >= 2.0 ? 'text-2xl font-black text-amber-400' : 'text-2xl font-black text-[#22c55e]';
            }
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
            temperature: { canvas: 'tempChart',  color: '#c084fc', label: 'Ambient Temp',    dec: 1, unit: '°F',  avgId: 'avg-temp' },
            wind:        { canvas: 'windChart',  color: '#34d399', label: 'Wind Speed',       dec: 1, unit: ' mph', avgId: 'avg-wind' },
            rainfall:    { canvas: 'rainChart',  color: '#60a5fa', label: 'Rainfall Volume',  dec: 3, unit: ' in',  avgId: 'avg-rain' },
            solar:       { canvas: 'solarChart', color: '#facc15', label: 'Solar Density',    dec: 0, unit: ' lx',  avgId: 'avg-solar' }
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
            temperature: { canvas: 'tempChart',       color: '#c084fc', label: 'Ambient Temperature', dec: 1, unit: '°F',    avgId: 'avg-temp' },
            humidity:    { canvas: 'humidityChart',   color: '#22d3ee', label: 'Relative Humidity',   dec: 1, unit: '%',      avgId: 'avg-humidity' },
            radiation:   { canvas: 'radiationChart',  color: '#34d399', label: 'Ambient Radiation',   dec: 0, unit: ' nSv/h', avgId: 'avg-radiation' },
            pressure:    { canvas: 'pressureChart',   color: '#60a5fa', label: 'Barometric Pressure', dec: 1, unit: ' hPa',   avgId: 'avg-pressure' }
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

// builds a sparkline chart for a metric and saves it so we can update it later
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
                x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 9 }, maxTicksLimit: 6, maxRotation: 0 } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 9 }, maxTicksLimit: 5 } }
            }
        },
        plugins: [avgBaselinePlugin]
    });
}

// grabs latest sensor data from the API (uses fake data if it fails) and updates the charts
async function fetchAndUpdate() {
    const config = STATIONS_CONFIG[currentStation];
    if (!config) return;

    let sensor;
    try {
        // try to get real data from the API
        const res = await fetch(`https://dev-engin-rws.pantheonsite.io/live-data.php?station=${currentStation}`);
        if (!res.ok) throw new Error('API error');
        sensor = (await res.json()).data;
    } catch (_) {
        // API failed, use randomly generated fallback data instead
        sensor = config.generateFallbackData();
    }
    if (!sensor) sensor = config.generateFallbackData();

    // update the displayed values on the page and get back a map of the new readings
    const pushMap = config.updateUI(sensor);
    const readingTime = new Date();
    const ts = readingTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const keys = Object.keys(config.metrics);
    const checkInst = instances[keys[0]];
    // skip if we already pushed a reading at this exact second
    if (!checkInst || !checkInst.data.labels.length || checkInst.data.labels[checkInst.data.labels.length - 1] !== ts) {
        keys.forEach(key => {
            const inst = instances[key];
            const m = config.metrics[key];
            if (!inst) return;

            // add the new value to the chart and drop the oldest one if we're over the limit
            const val = pushMap[key] ?? 0;
            inst.data.labels.push(ts);
            inst.data.datasets[0].data.push(val);
            if (inst.data.labels.length > MAX_PTS) { inst.data.labels.shift(); inst.data.datasets[0].data.shift(); }

            // save a reading to history every 10 minutes for the report table
            if (readingTime.getTime() - lastHistoryLogTime >= HISTORY_INTERVAL_MS) {
                history[key].push({ ts, val, t: readingTime.getTime() });
                if (history[key].length > MAX_PTS) history[key].shift();
            }

            // recalculate and display the average below the chart
            const vals = inst.data.datasets[0].data;
            const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
            const avgEl = document.getElementById(m.avgId);
            if (avgEl) avgEl.textContent = avg.toFixed(m.dec);

            inst.update();
        });
        if (readingTime.getTime() - lastHistoryLogTime >= HISTORY_INTERVAL_MS) {
            lastHistoryLogTime = readingTime.getTime();
        }
        // if the report popup is open, refresh the table with the new reading
        if (activeMetric) renderReportTable(activeMetric);
    }
}

// returns history for a metric, cut down to whatever time range the user picked
function getFilteredHistory(metric) {
    const hist = history[metric] || [];
    // read the from/to time inputs from the filter form
    const fromEl = document.getElementById('filter-from');
    const toEl   = document.getElementById('filter-to');
    const from   = fromEl?.value;
    const to     = toEl?.value;
    // if no filter is set, just return everything
    if (!from && !to) return hist;
    return hist.filter(h => {
        if (!h.t) return true;
        // convert the stored timestamp to HH:MM for comparison
        const hhmm = new Date(h.t).toTimeString().slice(0, 5);
        if (from && hhmm < from) return false;
        if (to   && hhmm > to)   return false;
        return true;
    });
}

// fills in the stats (min/max/avg) and history table inside the report popup
function renderReportTable(metric) {
    const config = STATIONS_CONFIG[currentStation];
    if (!config || !config.metrics[metric]) return;
    const meta     = config.metrics[metric];
    // get the readings filtered by whatever time range the user set
    const filtered = getFilteredHistory(metric);
    const vals     = filtered.map(h => h.val);
    // helper to format a number with the right decimal places and unit label
    const fmt      = v => Number(v).toFixed(meta.dec) + meta.unit;

    // fill in the stat boxes at the top of the popup
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setVal('modal-stat-current', vals.length ? fmt(vals[vals.length - 1])                             : '--');
    setVal('modal-stat-min',     vals.length ? fmt(Math.min(...vals))                                  : '--');
    setVal('modal-stat-max',     vals.length ? fmt(Math.max(...vals))                                  : '--');
    setVal('modal-stat-avg',     vals.length ? fmt(vals.reduce((a, b) => a + b, 0) / vals.length)     : '--');

    // build the table rows, newest reading first
    const tableRows = document.getElementById('modal-table-rows');
    if (tableRows) {
        tableRows.innerHTML = filtered.length
            ? filtered.slice().reverse().map((h, i) =>
                `<tr class="hover:bg-slate-50"><td class="px-4 py-2 font-mono text-slate-400">${filtered.length - i}</td><td class="px-4 py-2">${h.ts}</td><td class="px-4 py-2 text-right font-mono font-bold">${fmt(h.val)}</td></tr>`
            ).join('')
            : `<tr><td colspan="3" class="px-4 py-6 text-center text-slate-400 text-xs">No readings in this time range.</td></tr>`;
    }
}

// opens the report popup for a metric and pre-fills the time filter with the available range
function openReportPopup(metric) {
    activeMetric = metric;
    const config = STATIONS_CONFIG[currentStation];
    if (!config || !config.metrics[metric]) return;

    // set the popup title to the metric name
    const titleEl = document.getElementById('modal-metric-title');
    if (titleEl) titleEl.textContent = config.metrics[metric].label;

    // pre-fill the time filter with the earliest and latest readings we have
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

    // show the modal
    const modal = document.getElementById('report-modal');
    if (modal) modal.classList.remove('hidden');
}

// re-renders the table when the user hits apply on the time filter
function applyTimeFilter() {
    if (activeMetric) renderReportTable(activeMetric);
}

// clears the time filter and shows all readings again
function clearTimeFilter() {
    const fromEl = document.getElementById('filter-from');
    const toEl   = document.getElementById('filter-to');
    if (fromEl) fromEl.value = '';
    if (toEl)   toEl.value   = '';
    if (activeMetric) renderReportTable(activeMetric);
}

// closes the report popup and resets everything back to empty
function closeReportPopup() {
    const modal = document.getElementById('report-modal');
    if (modal) modal.classList.add('hidden');
    activeMetric = null;
    const fromEl = document.getElementById('filter-from');
    const toEl   = document.getElementById('filter-to');
    if (fromEl) fromEl.value = '';
    if (toEl)   toEl.value   = '';
}

// packages all stored history into a csv and downloads it
function downloadAllCombinedCSV() {
    const config = STATIONS_CONFIG[currentStation];
    if (!config) return;
    // start with the header row, then add one row per reading
    const rows = [config.csvHeaders];
    const maxLen = Math.max(...Object.keys(config.metrics).map(k => history[k].length), 0);
    for (let i = 0; i < maxLen; i++) rows.push(config.csvRowMapping(i));
    // create a temporary link and click it to trigger the download
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.map(r => r.join(',')).join('\n'));
    a.download = config.exportFilename();
    a.click();
}


// Detect which station page we're on by checking which chart canvas elements exist
document.addEventListener('DOMContentLoaded', () => {
    initClockAndDates();

    if (document.getElementById('radonChart'))         currentStation = 'basement';
    else if (document.getElementById('solarChart'))    currentStation = 'cs-facility';
    else if (document.getElementById('humidityChart')) currentStation = 'rm1962';

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
