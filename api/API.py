#changed so that flask server is running on server and not raspberry pi
#raspberry pi makes post request to server to send data instead of server making get request to pi
#pi code to make the request is in RequestData.py
#server runs this code to store data it receives in db

from flask import Flask, request, send_file, jsonify
import sqlite3
from datetime import datetime

TABLE_PATH = "data/sensorData.db"
app = Flask(__name__)

# @app.route("/all")
# def all():
#     conn = sqlite3.connect(TABLE_PATH)
#     c = conn.cursor()
#     c.execute("SELECT * FROM sensor_data")
#     rows = c.fetchall()
#     conn.close()
#     return jsonify(rows)

# if __name__ == "__main__":
#     app.run(host="127.0.0.1", port=8080)

def validate_timestamp(timestamp_str: str) -> bool:
    try:
        datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
        return True
    except ValueError:
        return False

@app.route('/data/get', methods=['GET'])
def getData():
    startTime = request.args.get('startTime')
    endTime = request.args.get('endTime')
    connection = sqlite3.connect(TABLE_PATH)
    cursor = connection.cursor()
    if ((startTime and endTime) and
        (validate_timestamp(startTime) and validate_timestamp(endTime)) and
        startTime <= endTime):
        cursor.execute('''
                       SELECT *
                       FROM sensor_data
                       WHERE timestamp > ?
                            AND timestamp <= ?
                       ORDER BY timestamp DESC
                       ''',(startTime, endTime))
    elif not startTime and not endTime:
        cursor.execute("SELECT * FROM sensor_data")
    else:
        return jsonify({"error": "Invalid timestamps"}), 400

    rows = cursor.fetchall()
    connection.close()
    return jsonify({"records": rows}), 200

@app.route('/data/delete', methods=['DELETE']) # THIS ROUTE MUST BE PROTECTED DO NOT OPEN ROUTE IF NOT PROTECTED
def delete_data():
    # client_key = request.headers.get('key')
    # if not client_key or client_key != SSH_KEYGEN_PUBLIC_KEY:
    #     return jsonify({"error": "Invalid SSH key"}), 401
    #
    startTime = request.args.get('startTime')
    endTime = request.args.get('endTime')
    connection = sqlite3.connect(TABLE_PATH)
    connection.row_factory = sqlite3.Row
    cursor = connection.cursor()
    if ((startTime and endTime) and
        (validate_timestamp(startTime) and validate_timestamp(endTime)) and
        startTime <= endTime):
        cursor.execute('''
                       DELETE FROM sensor_data
                       WHERE timestamp
                                 BETWEEN ? AND ?
                       RETURNING *
                       ''', (startTime, endTime))
    elif not startTime and not endTime:
        cursor.execute("DELETE FROM sensor_data RETURNING *")
    else:
        return jsonify({"error": "Invalid timestamps"}), 400
    rows = [dict(row) for row in cursor.fetchall()]
    connection.commit()
    connection.close()
    return jsonify({
        "status": "success",
        "deleted_count": len(rows),
        "records_deleted": rows
    }), 200
# @app.route('/data/filter/<startTime>/<endTime>', methods=['POST'])
# def filter_data(startTime, endTime):
#     if not validate_timestamp(startTime) or not validate_timestamp(endTime):
#         return jsonify({"error": "Invalid timestamp format"}), 400
#     if startTime > endTime:
#         return jsonify({"error": "Start time must be before end time"}), 400
#
#     connection = sqlite3.connect(TABLE_PATH)
#     cursor = connection.cursor()
#     cursor.execute('''
#                    SELECT * FRoM sensor_data
#                    WHERE timestamp
#                              BETWEEN ? AND ?
#                    ORDER BY timestamp DESC
#                    ''', (startTime, endTime))
#     rows = cursor.fetchall()
#     connection.close()
#
#     return jsonify({"records": rows})
if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8080)