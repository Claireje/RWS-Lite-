import sqlite3
from database.schema import SCHEMA_SENSOR_DATA
from database.schema import COLUMNS_SENSOR_DATA

DB_PATH = "data/sensorData.db"

TABLE_NAME_SENSOR_DATA = "sensor_data"

INSERT_SQL_SENSOR_DATA = f"""
    INSERT INTO {TABLE_NAME_SENSOR_DATA}
    ({", ".join(COLUMNS_SENSOR_DATA)})
    VALUES ({", ".join(["?"] * len(COLUMNS_SENSOR_DATA))})
    """


def get_connection() -> sqlite3.Connection:
    return sqlite3.connect(DB_PATH)


def initialize_database(connection: sqlite3.Connection, cursor: sqlite3.Cursor) -> None:
    # Add additional tables here if needed
    cursor.executescript(SCHEMA_SENSOR_DATA)
    connection.commit()


def insert_sensor_data(connection: sqlite3.Connection, cursor: sqlite3.Cursor, data: dict) -> None:
    """Insert a sensor reading using a dictionary of column values."""
    values = [data.get(column) for column in COLUMNS_SENSOR_DATA]
    cursor.execute(INSERT_SQL_SENSOR_DATA, values)
    connection.commit()
