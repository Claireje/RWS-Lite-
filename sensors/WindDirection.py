from adafruit_ads1x15.analog_in import AnalogIn

# Voltage calibration values measured for each compass direction
WIND_CALIBRATION = {
    "N":  2.538,
    "NE": 1.494,
    "E":  0.304,
    "SE": 0.602,
    "S":  0.934,
    "SW": 2.040,
    "W":  3.044,
    "NW": 2.860,
}


class WindDirection:
    def __init__(self, I2C=None, ADC=None, adc_channel=0):
        if I2C is None or ADC is None:
            raise ValueError("I2C and ADC must be provided")
        self.I2C = I2C
        self.ADC = ADC
        self.adc_channel = adc_channel
        self.direction = AnalogIn(self.ADC, self.adc_channel)

    def read(self) -> str:
        return voltage_to_direction(self.direction.voltage)


def voltage_to_direction(volt: float) -> str:
    """Convert a wind vane voltage reading to the closest compass direction."""
    closest_dir = None
    closest_diff = float("inf")

    for direction, cal_voltage in WIND_CALIBRATION.items():
        diff = abs(cal_voltage - volt)
        if diff < closest_diff:
            closest_diff = diff
            closest_dir = direction

    return closest_dir


if __name__ == "__main__":
    import board
    import busio
    import adafruit_ads1x15.ads1115 as ADS
    import time

    i2c = busio.I2C(board.SCL, board.SDA)
    adc = ADS.ADS1115(i2c)
    wind_dir = WindDirection(I2C=i2c, ADC=adc, adc_channel=0)

    while True:
        voltage = wind_dir.direction.voltage
        direction = wind_dir.read()
        print(f"Voltage: {voltage:.3f} V  |  Direction: {direction}")
        time.sleep(1)
