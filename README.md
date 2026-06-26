# RWS-Lite

Live sensor dashboard for the U-M Radiation Weather Station. Three locations: CS Facility roof, Room 1962, and the basement. No framework, no build step — just HTML, CSS, and JS.

---

## How it works

The Raspberry Pi runs `RWS.py` on a loop, reads all the sensors every 5 seconds, and saves to a local SQLite database. That data gets synced up to MiServer, and the dashboard pulls from `live-data.php` every 5 seconds to update the charts. If the API is down or returns nothing it just uses fake placeholder data so the page doesn't look broken.

```
Sensors → Pi (RWS.py) → MiServer → live-data.php → Dashboard
```

---

## What's in here

```
public/      HTML pages + JS
styles/      CSS, one file per page
api/         live-data.php (talks to MiServer)
sensors/     Python drivers for each sensor
database/    DB helpers and schema
data/        Local SQLite file for testing
RWS.py       Main sensor loop, runs on the Pi
```

---

## The pages

- `index.html` — homepage, overview of all three stations
- `cs-facility.html` — roof: temp, wind, solar, rainfall
- `rm1962.html` — room 1962: temp, humidity, radiation, air pressure
- `basement.html` — basement: radon, temp, soil moisture, soil temp

---

## Files worth knowing

**`station-manager.js`** — shared script for all three station pages. figures out which station it's on, polls the API, updates charts, handles CSV export and the report popup.

**`dashboard.js`** — powers the homepage. station map, environment overview, radiation info popup.

**`live-data.php`** — queries MiServer and returns the latest sensor row as JSON. usage: `?station=rm1962`

**`RWS.py`** — runs on the Pi, reads sensors, writes to SQLite. if you run it on a Mac it auto-detects and generates fake data instead so you can test without the hardware.

**`sensors/`** — one file per sensor (BME680, soil moisture, soil temp, wind/rain, wind direction, Geiger counter, RadonEye Bluetooth).

---

## Running locally

Just open `public/index.html` in a browser. It'll load with fallback data since there's no local API. If you want to test `RWS.py` on a Mac:

```bash
python RWS.py
```

It'll run in simulation mode automatically.
