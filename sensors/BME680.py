import time
import board
import adafruit_bme680
import asyncio


class BME680:
    def __init__(self, I2C, address) -> None:
        self.sensor = adafruit_bme680.Adafruit_BME680_I2C(I2C, address=address)

    def read(self) -> tuple:
        return self.sensor.temperature or -1, self.sensor.humidity or -1, self.sensor.pressure or -1, self.sensor.gas or -1

if __name__ == "__main__":
    # Create I2C connection
    i2c = board.I2C()

    # Connect to BME680 at address 0x77
    sensor = adafruit_bme680.Adafruit_BME680_I2C(i2c, address=0x77)
    # Optional: adjust for sea level pressure (important for altitude accuracy)
    sensor.sea_level_pressure = 1013.25

    while True:
        print("Temperature: {:.2f} °C".format(sensor.temperature))
        print("Humidity: {:.2f} %".format(sensor.humidity))
        print("Pressure: {:.2f} hPa".format(sensor.pressure))
        print("Gas: {:.2f} ohms".format(sensor.gas))
        print("---------------------------")
        time.sleep(2)