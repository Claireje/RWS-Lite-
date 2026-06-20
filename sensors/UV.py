import time
import board
import adafruit_ltr390
import asyncio


class UV:
    def __init__(self, I2C, address=0x53) -> None:
        self.sensor = adafruit_ltr390.LTR390(I2C, address=address)

    def read(self) -> tuple:
        return self.sensor.uvi or -1, self.sensor.lux or -1,

if __name__ == "__main__":
    # Create I2C connection
    i2c = board.I2C()

    # Connect to LTR390 at default address 0x53
    sensor = adafruit_ltr390.LTR390(i2c)

    while True:
        print("UV Index:  {:.2f}".format(sensor.uvi))
        print("UV Raw:    {}".format(sensor.uvs))
        print("Light:     {} lux".format(sensor.lux))
        print("Light Raw: {}".format(sensor.light))
        print("---------------------------")
        time.sleep(2)