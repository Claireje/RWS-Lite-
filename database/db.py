import sqlite3
from database.schema import SCHEMA_SENSOR_DATA
from database.schema import COLUMNS_SENSOR_DATA

DB_PATH = "data/sensorData.db"

TABLE_NAME_SENSOR_DATA = "sensor_data"

# Auto-build INSERT statement
INSERT_SQL_SENSOR_DATA = f"""
    INSERT INTO {TABLE_NAME_SENSOR_DATA}
    ({", ".join(COLUMNS_SENSOR_DATA)})
    VALUES ({", ".join(["?"] * len(COLUMNS_SENSOR_DATA))})
    """


def get_connection() -> sqlite3.Connection:
    return sqlite3.connect(DB_PATH)


def initialize_database(connection: sqlite3.Connection, cursor: sqlite3.Cursor) -> None:
    #Add additional tables when created here
    #EX. cursor.execute(SCHEMA_ADDITIONAL_TABLES)
    cursor.executescript(SCHEMA_SENSOR_DATA)
    connection.commit()


def insert_sensor_data(connection: sqlite3.Connection, cursor: sqlite3.Cursor, data: dict) -> None:
    """
    Insert sensor data using dictionary values.
    Example:
        insert_sensor_data(cursor, {
            "indoor_temp": 22.5,
            "indoor_humidity": 60.0,
            "indoor_pressure": 1013.25,
            "indoor_gas": 100.0,
            "outdoor_temp": 20.0,
            "outdoor_humidity": 55.0,
            "outdoor_pressure": 1012.5,
            "outdoor_gas": 120.0,
            "soil_moisture": 45.0,
            "soil_temperature": 18.0,
            "wind_speed": 5.0,
            "wind_direction": "North",
            "radon_level": 15.0,
            "geiger_cpm": 200.0
        })
    """

    values = [data.get(column) for column in COLUMNS_SENSOR_DATA]

    cursor.execute(INSERT_SQL_SENSOR_DATA, values)
    connection.commit()
