# ================================================
# RWS.py - Main Hardware Collection Script (Mac Enhanced Calibration)
# ================================================

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

# Dynamic Mock Drivers for Mac Stability
class MockAnalogIn:
    def __init__(self, voltage=0.0):
        self.voltage = voltage

if IS_MAC:
    print("💻 Mac detected: Running in SENSOR INTEGRATION MODE")
    # Add the current directory to path so python can find the sensors folder
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    
    # Dynamically load your team's actual sensor algorithms
    try:
        UV_Module = importlib.import_module("sensors.UV")
        Wind_Module = importlib.import_module("sensors.WindDirection")
        print("✅ Successfully linked to production sensor logic modules.")
    except Exception as e:
        print(f"⚠️ Warning loading sensor modules: {e}")
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

# ========================= CONFIG =========================
PI_NUM = 1
DATA_INTERVAL = 5  # seconds
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_FILE = os.path.abspath(os.path.join(BASE_DIR, 'data/sensorData.db'))
verbose = True

# ======================= SETUP =======================
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

# ======================= DATABASE =======================
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

# ======================= MAIN LOOP =======================
def main():
    init_db()
    connection = sqlite3.connect(DATABASE_FILE)
    cursor = connection.cursor()

    print(f"🚀 MRWS Sensor-Linked Pipeline Started (Interval: {DATA_INTERVAL}s)")

    try:
        while True:
            current_time = get_time()

            if IS_MAC:
                # 1. Base Ambient Metrics
                i_temp = 56.0 + random.uniform(-1.0, 1.0)
                i_humidity = 48.0 + random.uniform(-1.5, 1.5)
                i_pressure, i_gas = 1013.25, 120.0
                percentage, temp = 32.5, 54.0
                
                # 2. Wind Speed calculation from team's wind.py formula
                simulated_pulses = random.randint(1, 8)
                mph = (simulated_pulses / 2) * 1.492  # Uses the exact 1.492 scaling ratio
                
                # 3. Wind Direction processed via team's real function
                if Wind_Module and hasattr(Wind_Module, 'get_direction'):
                    mock_direction_voltage = random.uniform(0.1, 3.0)
                    direction = Wind_Module.get_direction(mock_direction_voltage)
                else:
                    direction = "N"

                # 4. UV Index processed via team's real conversion table
                if UV_Module and hasattr(UV_Module, 'voltage_to_uv_index'):
                    mock_uv_voltage = random.uniform(0.02, 1.1)
                    uv = UV_Module.voltage_to_uv_index(mock_uv_voltage)
                else:
                    uv = 0
                
                rainIN = random.choice([0.00, 0.00, 0.01, 0.00])
                radon_level, geiger_cpm = 1.2, 14.0
                lux = 450.0 + random.uniform(-30, 30)
            else:
                # Real hardware paths execution branch
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
                print(f"\n[{current_time}] Sensor Matrix Ingestion:")
                print(f"  Temp: {i_temp:.1f}°F | Wind: {mph:.2f} mph ({direction}) | UV Index: {uv}")
                print(f"  Solar: {lux:.1f} Lux | Rain Logged: {rainIN:.2f} in")

            # Store computed framework attributes directly to DB
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
        print("\n\n🛑 Stopping system collection gracefully...")
    finally:
        connection.close()

if __name__ == "__main__":
    main()