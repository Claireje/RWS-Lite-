#The schema for the database
#defines structures of all tables in a database (currently and mostly likely only sensor_data)
SCHEMA_SENSOR_DATA = """
    CREATE TABLE IF NOT EXISTS sensor_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pi_num INTEGER,
        timestamp DATETIME,
    
        indoor_temp REAL,
        indoor_humidity REAL,
        indoor_pressure REAL,
        indoor_gas REAL,
        
        soil_moisture REAL,
        soil_temperature REAL,
    
        wind_speed REAL,
        wind_direction TEXT,
        rainfall REAL,
    
        radon_level REAL,
        geiger_cpm REAL,
        
        UV REAL,
        lux REAL
    );
    """
COLUMNS_SENSOR_DATA = [
    "pi_num",
    "timestamp",

    "indoor_temp",
    "indoor_humidity",
    "indoor_pressure",
    "indoor_gas",

    "soil_moisture",
    "soil_temperature",

    "wind_speed",
    "wind_direction",
    "rainfall",

    "radon_level",
    "geiger_cpm",

    "UV",
    "lux",
]