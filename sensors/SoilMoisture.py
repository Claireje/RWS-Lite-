import time
import board
import RPi.GPIO as GPIO

from adafruit_ads1x15.ads1115 import ADS1115
from adafruit_ads1x15.analog_in import AnalogIn


class SoilMoisture:
    def __init__(
        self,
        power_pin=17,
        ads=None,
        adc_channel=2,
        settle_time=1.0,
        I2C=None,
    ):
        self.power_pin = power_pin
        self.settle_time = settle_time

        GPIO.setmode(GPIO.BCM)
        GPIO.setup(self.power_pin, GPIO.OUT)
        GPIO.output(self.power_pin, GPIO.LOW)

        self.i2c = I2C or board.I2C()
        self.ads = ads or ADS1115(self.i2c)
        self.chan = AnalogIn(self.ads, adc_channel)

    def read(self) -> float:
        """Powers the sensor, waits for it to stabilize, then returns the voltage reading."""
        GPIO.output(self.power_pin, GPIO.HIGH)
        time.sleep(self.settle_time)
        voltage = self.chan.voltage
        GPIO.output(self.power_pin, GPIO.LOW)
        return voltage

    def cleanup(self) -> None:
        GPIO.cleanup()
