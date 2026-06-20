import threading
import time
import board
import busio
from adafruit_ads1x15.ads1115 import ADS1115
from gpiozero import DigitalInputDevice
from gpiozero.pins.lgpio import LGPIOFactory
from adafruit_ads1x15.analog_in import AnalogIn


class WindSpeedRainfallSensor:
    def __init__(self, WIND_SENSOR_PIN = 20, RAIN_SENSOR_PIN = 26, sample_time=5.0):
        self.lock = threading.Lock()
        self.FLOAT_SET_CHECK = 6767674206969 # 6,767,674,206,969 WAFFLE HOUSE INDEX IF PRESENT RUN FOR YOUR LIFE
        self.WIND_SENSOR_PIN = WIND_SENSOR_PIN
        self.RAIN_SENSOR_PIN = RAIN_SENSOR_PIN
        self._factory = LGPIOFactory()

        self.count = 0

        self.wind_count = 0 #Increments every time the sensor is activated
        self.wind_count_snapshot = 0 #Used to compute the difference in counts over a time interval
        self.running = False
        self.wind = DigitalInputDevice(
            self.WIND_SENSOR_PIN,
            pull_up=True,        # internal pull-up, no external resistor needed
            pin_factory=self._factory,
            bounce_time=0.0001
        )
        self.wind.when_activated = self._wind_speed_callback  # fires on FALLING edge (switch closes to GND)

        # WindVars
        self.wind_recorded_speed = self.FLOAT_SET_CHECK
        self.max_history_length = 3
        self.sample_time = sample_time

        #Rain Sensor
        self.rain_count = 0
        self.rain_count_snapshot = 0
        self.rain_CPS = self.FLOAT_SET_CHECK #Counts per second of rain over a sample interval
        self.MM_PER_CPS = 0.2794794
        self.INCHES_PER_CPS = 0.0111
        self.rain = DigitalInputDevice(
            self.RAIN_SENSOR_PIN,
            pull_up=True,
            pin_factory=self._factory,
            bounce_time=0.025
        )
        self.rain.when_activated = self._rain_speed_callback

        self.running = True
        self.processor_thread = threading.Thread(target=self._get_averages, daemon=True)
        self.processor_thread.start()


    # Used in the _init function
    def _wind_speed_callback(self) -> None:
        with self.lock:
            self.wind_count += 1
        print("Wind trigger", self.count)
        self.count += 1

    def _rain_speed_callback(self) -> None:
        with self.lock:
            self.rain_count += 1

    def _get_averages(self) -> None:
        while self.running:
            with self.lock:
                self.wind_count = 0
                self.rain_count = 0
            time.sleep(self.sample_time)

            with self.lock:

                self.wind_count_snapshot = self.wind_count
                self.rain_count_snapshot = self.rain_count
                self.wind_recorded_speed = (self.wind_count_snapshot / self.sample_time) * 1.492  # MPH
                self.rain_CPS = self.rain_count_snapshot / self.sample_time


    def stop(self) -> None:
        self.running = False
        self.processor_thread.join()

    def start(self) -> None:
        #Start if killed (only use to prevent thread-loss if a sensor object broke)
        if not self.running:
            self.running = True
            self.processor_thread = threading.Thread(target=self._get_averages, daemon=True)
            self.processor_thread.start()
        else:
            print("WindSpeedThread is already running")


    def readWind(self) -> float:
        with self.lock:
            if self.wind_recorded_speed == self.FLOAT_SET_CHECK:
                return -1.0
            return self.wind_recorded_speed

    def readRainMM(self) -> float:
        with self.lock:
            if self.rain_CPS is self.FLOAT_SET_CHECK:
                return -1.0
            return self.rain_count_snapshot * self.MM_PER_CPS

    def readRainIN(self) -> float:
        with self.lock:
            if self.rain_CPS is self.FLOAT_SET_CHECK:
                return -1.0
            return self.rain_count_snapshot * self.INCHES_PER_CPS

    def fullReadWind(self) -> tuple[float, int]:
        with self.lock:
            if self.wind_recorded_speed is self.FLOAT_SET_CHECK:
                return -1.0, -1
            return self.wind_recorded_speed, self.wind_count_snapshot

if __name__ == "__main__":
    i2c = board.I2C()
    ads = ADS1115(i2c)
    wind = WindSpeedRainfallSensor(WIND_SENSOR_PIN=20, RAIN_SENSOR_PIN=26, sample_time=5.0)
    #print("-----------------------------")
    while True:
        mph, count = wind.fullReadWind()
        #print(f"Wind Speed: {mph} MPH  |  Count: {count}", "Rainfall: ", wind.readRainMM(), "mm")
        #time.sleep(1)

