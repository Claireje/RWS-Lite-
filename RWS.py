# RWS.py - Main sensor data collection script
# Reads from all connected sensors and saves readings to the local SQLite database.
# On Mac, runs in simulation mode with generated values instead of real hardware.

import sys
import random
from datetime import datetime
from zoneinfo import ZoneInfo
import time
import logging
import sqlite3
import os
import importlib

logging.basicConfig(level=logging.ERROR)

IS_MAC = sys.platform == "darwin"

class MockAnalogIn:
    def __init__(self, voltage=0.0):
        self.voltage = voltage

if IS_MAC:
    print("Mac detected: running in simulation mode")
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    try:
        UV_Module = importlib.import_module("sensors.UV")
        Wind_Module = importlib.import_module("sensors.WindDirection")
        print("Sensor modules loaded.")
    except Exception as e:
        print(f"Warning loading sensor modules: {e}")
        UV_Module = None
        Wind_Module = None
else:
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

PI_NUM = 1
DATA_INTERVAL = 5  # seconds between readings
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_FILE = os.path.abspath(os.path.join(BASE_DIR, 'data/sensorData.db'))
verbose = True

if not IS_MAC:
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
    return datetime.now(ZoneInfo("America/Detroit")).strftime("%Y-%m-%d %H:%M:%S")


def main():
    init_db()
    connection = sqlite3.connect(DATABASE_FILE)
    cursor = connection.cursor()

    print(f"RWS collection started (interval: {DATA_INTERVAL}s)")

    try:
        while True:
            current_time = get_time()

            if IS_MAC:
                i_temp = 56.0 + random.uniform(-1.0, 1.0)
                i_humidity = 48.0 + random.uniform(-1.5, 1.5)
                i_pressure, i_gas = 1013.25, 120.0
                percentage, temp = 32.5, 54.0

                simulated_pulses = random.randint(1, 8)
                mph = (simulated_pulses / 2) * 1.492

                if Wind_Module and hasattr(Wind_Module, 'get_direction'):
                    direction = Wind_Module.get_direction(random.uniform(0.1, 3.0))
                else:
                    direction = "N"

                if UV_Module and hasattr(UV_Module, 'voltage_to_uv_index'):
                    uv = UV_Module.voltage_to_uv_index(random.uniform(0.02, 1.1))
                else:
                    uv = 0

                rainIN = random.choice([0.00, 0.00, 0.01, 0.00])
                radon_level, geiger_cpm = 1.2, 14.0
                lux = 450.0 + random.uniform(-30, 30)
            else:
                try: i_temp, i_humidity, i_pressure, i_gas = BME_Indoor.read()
                except: i_temp = i_humidity = i_pressure = i_gas = -1
                try: _, percentage = soilMoist.read()
                except: percentage = -1
                try: temp = soilTemp.read()
                except: temp = -1
                try: mph, count, rainIN = windRain.read() if hasattr(windRain, 'read') else windRain.fullReadWind()
                except: mph = count = rainIN = -1
                try: direction = windDirection.read()
                except: direction = "N/A"
                try:
                    radonData = radon.read()
                    radon_level = radonData.get('radon', -1) if isinstance(radonData, dict) else -1
                except: radon_level = -1
                try:
                    geigerData = geiger.read()
                    geiger_cpm = geigerData.get('cpm', -1) if isinstance(geigerData, dict) else -1
                except: geiger_cpm = -1
                try: uv, lux = UVSensor.read()
                except: uv = lux = -1

            if verbose:
                print(f"\n[{current_time}]")
                print(f"  Temp: {i_temp:.1f}F | Wind: {mph:.2f} mph ({direction}) | UV: {uv}")
                print(f"  Solar: {lux:.1f} lux | Rainfall: {rainIN:.2f} in")

            cursor.execute('''
                INSERT INTO sensor_data
                (pi_num, timestamp, indoor_temp, indoor_humidity, indoor_pressure, indoor_gas,
                 soil_moisture, soil_temperature, wind_speed, wind_direction, rainfall,
                 radon_level, geiger_cpm, UV, lux)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                PI_NUM, current_time, i_temp, i_humidity, i_pressure, i_gas,
                percentage, temp, mph, direction, rainIN,
                radon_level, geiger_cpm, uv, lux
            ))
            connection.commit()
            time.sleep(DATA_INTERVAL)

    except KeyboardInterrupt:
        print("\nStopping data collection.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
