# database/db.py

def insert_roof_data(connection, cursor, data):
    cursor.execute("""
        INSERT INTO sensor_roof (pi_num, timestamp, wind_speed, wind_direction, rainfall, solar_radiation, air_pressure)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (data['pi_num'], data['timestamp'], data['wind_speed'], data['wind_direction'], data['rainfall'], data['lux'], data['indoor_pressure']))
    connection.commit()

def insert_rm1962_data(connection, cursor, data):
    cursor.execute("""
        INSERT INTO sensor_rm1962 (pi_num, timestamp, indoor_temp, indoor_humidity, indoor_gas, geiger_cpm, radon_level_nsv)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (data['pi_num'], data['timestamp'], data['indoor_temp'], data['indoor_humidity'], data['indoor_gas'], data['geiger_cpm'], data['radon_level_nsv']))
    connection.commit()

def insert_basement_data(connection, cursor, data):
    cursor.execute("""
        INSERT INTO sensor_basement (pi_num, timestamp, soil_moisture, soil_temperature, radon_level_pci)
        VALUES (?, ?, ?, ?, ?)
    """, (data['pi_num'], data['timestamp'], data['soil_moisture'], data['soil_temperature'], data['radon_level']))
    connection.commit()