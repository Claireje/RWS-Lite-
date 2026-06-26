# RWS-Lite

A live sensor dashboard for the U-M Radiation Weather Station. Shows real-time readings from three locations: the CS Facility roof, Room 1962, and the basement.

---

## Folder Structure

```
RWS-Lite-/
  public/        ← HTML pages and JavaScript
  styles/        ← CSS files, one per page
  api/           ← live-data.php (connects dashboard to MiServer)
  sensors/       ← Python drivers for each physical sensor
  database/      ← Database helper functions and schema
  data/          ← Local SQLite database for testing
  app/           ← Old Flask server used during local development
  RWS.py         ← Main sensor loop that runs on the Raspberry Pi
```

---

## Pages

| File | What it shows |
|------|--------------|
| public/index.html | Homepage with all three station cards |
| public/cs-facility.html | CS roof: temp, wind, solar, humidity, pressure, rainfall |
| public/rm1962.html | Room 1962: temp, humidity, pressure, radiation, radon, soil |
| public/basement.html | Basement: temp, humidity, pressure, radon, soil |

---

## Key Files

**public/js/station-manager.js**
Shared script for all three station pages. Checks the API every 5 seconds, updates the charts, tracks the last 30 readings, draws the dashed average line, and handles CSV downloads. Falls back to fake data if the API fails.

**api/live-data.php**
Connects to MiServer (webapps2-db.miserver.it.umich.edu) and returns the latest sensor row as JSON. Pass it a station name in the URL like `?station=basement`.

**RWS.py**
Runs on the Raspberry Pi. Reads all connected sensors every 5 seconds and saves to a local SQLite database.

**sensors/**
One Python file per sensor: BME680 (temp/humidity/pressure), SoilMoisture, SoilTemp, WindSpeedAndRain, WindDirection, DIYgm (Geiger counter), RadonEyeDriver (Bluetooth radon sensor).

---

## How the Data is Supposed to Work

```
Sensor → Raspberry Pi (RWS.py) → MiServer Database → live-data.php → Dashboard
```
