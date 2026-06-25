<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$DB_HOST = 'webapps2-db.miserver.it.umich.edu';
$DB_NAME = 'rws_data';
$DB_USER = 'rws_data';
$DB_PASS = 'Im Radioactive#1';

$station = $_GET['station'] ?? 'cs-facility';

try {
    $pdo = new PDO(
        "mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4",
        $DB_USER,
        $DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $row = null;

    if ($station === 'cs-facility') {
        // roof_data: AirTC (°C), WS_ms (m/s), Rain_mm (mm), SlrkW_Avg (kW/m²), RH (%)
        // Convert all to imperial/display units the JS expects
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
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

    } elseif ($station === 'basement') {
        // basement_data: AirTemp_C (°C), RH_percent (%), Pressure_mbar (mbar)
        // NOTE: radon_level, soil_moisture, soil_temperature not in this table yet.
        // Those will come from RWSLite_data once the basement Pi is registered.
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

    } elseif ($station === 'rm1962') {
        // RWSLite_data pi_num=1 — likely the main_lab Pi.
        // Confirm by running: SELECT * FROM RWSLite_data ORDER BY timestamp DESC LIMIT 1;
        // Update pi_num below if it turns out to be a different number.
        // pi_num=1 confirmed as RM1962 (BME680 + DIYgm Geiger counter)
        // temp is in Celsius → convert to °F
        // geiger_cpm → nSv/h using ×5 approximation (adjust if tube differs from SBM-20)
        // radon_level is -1 on this Pi (sensor not attached), so the JS fallback shows --
        $stmt = $pdo->prepare("
            SELECT
                timestamp,
                (temp * 9/5 + 32)           AS indoor_temp,
                humidity                    AS indoor_humidity,
                pressure                    AS indoor_pressure,
                (geiger_cpm * 5)            AS radiation,
                radon_level,
                soil_moisture,
                (soil_temperature * 9/5 + 32) AS soil_temperature,
                wind_speed,
                rainfall,
                lux
            FROM RWSLite_data
            WHERE pi_num = 1
            ORDER BY timestamp DESC
            LIMIT 1
        ");
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
    }

    echo json_encode(['data' => $row ?: null]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
