CREATE TABLE IF NOT EXISTS sensor_roof (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ambient_temp REAL,
    wind_speed REAL,
    wind_direction TEXT,
    rainfall REAL,
    solar_radiation REAL,
    air_pressure REAL
);

CREATE TABLE IF NOT EXISTS sensor_rm1962 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    indoor_temp REAL,
    indoor_humidity REAL,
    radon_level_nsv REAL
);

CREATE TABLE IF NOT EXISTS sensor_basement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ambient_temp REAL,
    radon_level_pci REAL
);