<?php
header('Content-Type: application/json'); //JSON data
//CORS header dashboard JavaScript 
//is allowed to call this PHP file without getting blocked.
header('Access-Control-Allow-Origin: *'); 
// the connection details pointing straight at MiServer
$DB_HOST = 'webapps2-db.miserver.it.umich.edu';
$DB_NAME = 'rws_data';
$DB_USER = 'rws_data';
$DB_PASS = 'Im Radioactive#1';

$station = $_GET['station'] ?? 'cs-facility';

try {
    // where it actually tries to connect:
    $pdo = new PDO(
        //mysql: MySQL
        //host: MiServer
        //dbname: which database to open once connected
        //charset=utf8mb4: use standard unicode text encoding
        "mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4",
        $DB_USER,
        $DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    //variable called $row and sets it to null
    $row = null;
    // fetches the latest sensor reading from the cs-facility station
    if ($station === 'cs-facility') {
        // roof_data: AirTC, WS_ms (m/s), Rain_mm (mm), SlrkW_Avg, RH(%)
        $stmt = $pdo->query("
            SELECT
                timestamp,
                (AirTC * 9/5 + 32)         AS indoor_temp,
                (WS_ms * 2.237)             AS wind_speed,
                (Rain_mm * 0.03937)         AS rainfall,
                (SlrkW_Avg * 120000)        AS lux,
                RH                          AS indoor_humidity,
                BP_mbar                     AS indoor_pressure
            FROM roof_data
            ORDER BY timestamp DESC
            LIMIT 1
        ");
        //pulls the result out of the database and into PHP
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
    // fetches the latest sensor reading from the basement station
    } elseif ($station === 'basement') {
        $stmt = $pdo->query("
            SELECT
                timestamp,
                (AirTemp_C * 9/5 + 32)     AS indoor_temp,
                RH_percent                  AS indoor_humidity,
                Pressure_mbar               AS indoor_pressure,
                NULL                        AS radon_level,
                NULL                        AS soil_moisture,
                NULL                        AS soil_temperature
            FROM basement_data
            ORDER BY timestamp DESC
            LIMIT 1
        ");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
    // fetches the latest sensor reading from the Room 1962 station
    } elseif ($station === 'rm1962') {
        $stmt = $pdo->query("
            SELECT
                time                        AS timestamp,
                (in_temp * 9/5 + 32)        AS indoor_temp,
                in_hum                      AS indoor_humidity,
                in_press                    AS indoor_pressure,
                (CPM * 5)                   AS radiation,
                radon                       AS radon_level,
                soil_mois                   AS soil_moisture,
                (soil_temp * 9/5 + 32)      AS soil_temperature,
                windspeed                   AS wind_speed,
                uv                          AS lux
            FROM RC_RWS_Lite
            ORDER BY time DESC
            LIMIT 1
        ");
        // the SQL queries that would pull the real sensor 
        // readings, one per station (CS Facility, Basement, RM1962). 
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
    }
    // the catch block that runs instead, returning 
    // an error JSON. The javascript in station-manager.js 
    // sees that error and falls back to generating fake data.
    echo json_encode(['data' => $row ?: null]);
// error handler
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
