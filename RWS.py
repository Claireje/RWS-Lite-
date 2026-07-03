# RWS.py
# This is the main script that runs on the Raspberry Pi.
# It reads from all the sensors and saves everything to a local SQLite database.
# If the Pi-only hardware libraries aren't available (wrong machine, nothing
# plugged in, etc.) it just generates fake data instead so you can test
# without the real hardware -- doesn't matter what OS you're running on.

import sys
import random
from datetime import datetime
from zoneinfo import ZoneInfo
import time
import logging
import sqlite3
import os

logging.basicConfig(level=logging.ERROR)

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# try to load the real Pi hardware libraries -- if that fails for any
# reason, fall back to simulation mode instead of crashing
try:
    import board
    from adafruit_ads1x15.ads1115 import ADS1115
    from sensors.BME680 import BME680
    from sensors.SoilMoisture import SoilMoisture
    from sensors.SoilTemp import SoilTemperature
    from sensors.WindDirection import WindDirection
    from sensors.WindSpeedAndRain import WindSpeedRainfallSensor
    from sensors.RadonEyeDriver import RadonEyeP2Tracker
    from sensors.DIYgm import GeigerCounter
    from sensors.UV import UV
    SIMULATION_MODE = False
except ImportError as e:
    print(f"Pi hardware libraries not available ({e}) -- running in simulation mode")
    SIMULATION_MODE = True

PI_NUM = 1        # which Pi this is running on
DATA_INTERVAL = 5 # how often to take a reading (seconds)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_FILE = os.path.abspath(os.path.join(BASE_DIR, 'data/sensorData.db'))

if not SIMULATION_MODE:
    # connect to all the hardware
    i2c = board.I2C()
    ads = ADS1115(i2c)
    BME_Indoor = BME680(I2C=i2c, address=0x77)
    soilMoist = SoilMoisture(I2C=i2c, ads=ads, adc_channel=2)
    soilTemp = SoilTemperature()
    windRain = WindSpeedRainfallSensor()
    windDirection = WindDirection(I2C=i2c, ADC=ads)
    radon = RadonEyeP2Tracker(mac_address="F8:B1:82:B2:36:12")
    geiger = GeigerCounter()
    UVSensor = UV(I2C=i2c)


def init_db():
    # make the data folder if it's not there yet, then create the table if it doesn't exist
    os.makedirs(os.path.dirname(DATABASE_FILE), exist_ok=True)
    conn = sqlite3.connect(DATABASE_FILE)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS sensor_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pi_num INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            indoor_temp REAL, indoor_humidity REAL, indoor_pressure REAL, indoor_gas REAL,
            soil_moisture REAL, soil_temperature REAL,
            wind_speed REAL, wind_direction TEXT, rainfall REAL,
            radon_level REAL, geiger_cpm REAL,
            UV REAL, lux REAL
        )
    ''')
    conn.commit()
    conn.close()


def get_time():
    # always use Ann Arbor time
    return datetime.now(ZoneInfo("America/Detroit")).strftime("%Y-%m-%d %H:%M:%S")


def generate_fake_reading():
    # simulation mode -- makes up realistic-looking numbers so you can
    # test without any real hardware attached
    simulated_pulses = random.randint(1, 8)
    return {
        'i_temp': 56.0 + random.uniform(-1.0, 1.0),
        'i_humidity': 48.0 + random.uniform(-1.5, 1.5),
        'i_pressure': 1013.25,
        'i_gas': 120.0,
        'percentage': 32.5,
        'temp': 54.0,
        'mph': (simulated_pulses / 2) * 1.492,
        'direction': "N",  # placeholder -- no real wind sensor to fake this from
        'uv': 0,           # placeholder -- no real UV sensor to fake this from
        'rainIN': random.choice([0.00, 0.00, 0.01, 0.00]),  # mostly dry, occasional small rain
        'radon_level': 1.2,
        'geiger_cpm': 14.0,
        'lux': 450.0 + random.uniform(-30, 30),
    }


def read_sensors():
    # real hardware mode -- reads each sensor, logging -1 (or "N/A" for
    # direction) if a single sensor fails so one broken sensor never
    # crashes the whole loop
    r = {}

    try: r['i_temp'], r['i_humidity'], r['i_pressure'], r['i_gas'] = BME_Indoor.read()
    except: r['i_temp'] = r['i_humidity'] = r['i_pressure'] = r['i_gas'] = -1

    try: _, r['percentage'] = soilMoist.read()
    except: r['percentage'] = -1

    try: r['temp'] = soilTemp.read()
    except: r['temp'] = -1

    try: r['mph'], _, r['rainIN'] = windRain.read() if hasattr(windRain, 'read') else windRain.fullReadWind()
    except: r['mph'] = r['rainIN'] = -1

    try: r['direction'] = windDirection.read()
    except: r['direction'] = "N/A"

    try:
        radonData = radon.read()
        r['radon_level'] = radonData.get('radon', -1) if isinstance(radonData, dict) else -1
    except: r['radon_level'] = -1

    try:
        geigerData = geiger.read()
        r['geiger_cpm'] = geigerData.get('cpm', -1) if isinstance(geigerData, dict) else -1
    except: r['geiger_cpm'] = -1

    try: r['uv'], r['lux'] = UVSensor.read()
    except: r['uv'] = r['lux'] = -1

    return r


def save_reading(cursor, timestamp, r):
    cursor.execute('''
        INSERT INTO sensor_data
        (pi_num, timestamp, indoor_temp, indoor_humidity, indoor_pressure, indoor_gas,
         soil_moisture, soil_temperature, wind_speed, wind_direction, rainfall,
         radon_level, geiger_cpm, UV, lux)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        PI_NUM, timestamp, r['i_temp'], r['i_humidity'], r['i_pressure'], r['i_gas'],
        r['percentage'], r['temp'], r['mph'], r['direction'], r['rainIN'],
        r['radon_level'], r['geiger_cpm'], r['uv'], r['lux']
    ))


def main():
    init_db()
    connection = sqlite3.connect(DATABASE_FILE)
    cursor = connection.cursor()

    print(f"RWS collection started (interval: {DATA_INTERVAL}s)")

    try:
        while True:
            current_time = get_time()
            reading = generate_fake_reading() if SIMULATION_MODE else read_sensors()

            print(f"\n[{current_time}]")
            print(f"  Temp: {reading['i_temp']:.1f}F | Wind: {reading['mph']:.2f} mph ({reading['direction']}) | UV: {reading['uv']}")
            print(f"  Solar: {reading['lux']:.1f} lux | Rainfall: {reading['rainIN']:.2f} in")

            save_reading(cursor, current_time, reading)
            connection.commit()
            time.sleep(DATA_INTERVAL)

    except KeyboardInterrupt:
        print("\nStopping data collection.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
