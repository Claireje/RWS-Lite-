# RWS-Lite

This is the live dashboard for the U-M Radiation Weather Station. It shows real-time sensor readings from three locations on North Campus: the CS Facility roof, Room 1962, and the basement. It's plain HTML/CSS/JS — no framework, no build step, just open the files in a browser or drop them on a web server and it works.

---

## How the data flows

```
Sensors → Raspberry Pi (RWS.py) → MiServer database → live-data.php → Dashboard
```

The Raspberry Pi runs `RWS.py` in a loop, reads all the sensors every 5 seconds, and saves everything to a local SQLite database. From there, data gets synced to MiServer (the U-M web database). The dashboard polls `live-data.php` every 5 seconds and updates the charts. If the API is down or returns nothing, it falls back to randomly generated placeholder data so the page doesn't look broken.

---

## Folder structure

```
RWS-Lite-/
  public/        ← HTML pages and JS
  styles/        ← CSS files (one per page + shared ones)
  api/           ← live-data.php, connects the dashboard to MiServer
  sensors/       ← Python drivers for each physical sensor
  database/      ← DB helpers and schema
  data/          ← Local SQLite file used for testing
  app/           ← Old Flask server, was used during early local dev
  RWS.py         ← Main sensor loop, this is what runs on the Pi
```

---

## Pages

| File | What it shows |
|------|---------------|
| `public/index.html` | Main homepage — overview of all three stations |
| `public/cs-facility.html` | CS Facility roof: temp, wind, solar, rainfall |
| `public/rm1962.html` | Room 1962: temp, humidity, radiation, air pressure |
| `public/basement.html` | Basement: radon, temp, soil moisture, soil temp |

---

## Files worth knowing about

**`public/js/station-manager.js`**
Shared script for all three station pages. It figures out which station it's on by checking which chart canvases exist in the HTML, then pulls the right config from `STATIONS_CONFIG`. Polls the API every 5 seconds, updates the live charts, keeps a rolling window of 30 readings, and handles CSV exports and the report modal.

**`public/js/dashboard.js`**
Powers the main homepage (index.html). Handles the station map, environment overview cards, and the "what is background radiation" popup.

**`api/live-data.php`**
Queries MiServer and returns the latest sensor row as JSON. Pass a station name like `?station=rm1962`. This lives on the MiServer web root — it's not bundled with the frontend files.

**`RWS.py`**
Runs on the Raspberry Pi. Reads all the connected sensors and writes to SQLite every 5 seconds. If you run it on a Mac it detects that and just generates fake data instead, which is handy for testing.

**`sensors/`**
One file per physical sensor:
- `BME680.py` — indoor temperature, humidity, air pressure
- `SoilMoisture.py` — soil moisture percentage
- `SoilTemp.py` — soil temperature
- `WindSpeedAndRain.py` — wind speed and rainfall accumulation
- `WindDirection.py` — wind direction via ADC
- `DIYgm.py` — Geiger counter (CPM)
- `RadonEyeDriver.py` — connects to the RadonEye P2 over Bluetooth

---

## Current sensor status

As of mid-2026 the Pi isn't actively pushing to MiServer, so the dashboard is running on fallback data for most stations. RM1962 was the last one to push real data (May 2026). CS Facility stopped in March 2024. Basement never successfully pushed. Getting the Pi reconnected and the MiServer sync working again is the main thing left to fix.

---

## Running locally

No setup needed. Just open `public/index.html` in a browser. The dashboard will load with fallback data since you won't have the API running locally. If you want to test with real data, you'd need to point `live-data.php` at a local MySQL instance with the right schema (see `database/schema.py`).

To run the sensor script on a Mac for testing:

```bash
python RWS.py
```

It'll detect macOS and run in simulation mode automatically.
