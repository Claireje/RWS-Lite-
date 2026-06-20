import time
from typing import Optional

from w1thermsensor import W1ThermSensor


class SoilTemperature:
    def __init__(self) -> None:
        self.sensor = W1ThermSensor()

    def read(self) -> float:
        """Read soil temperature in °C. Returns None on failure."""
        temp = self.sensor.get_temperature()
        if temp is not None:
            return temp
        return -1

    def stream(self, interval: float = 1.0) -> None:
        """Continuously print soil temperature at a set interval."""
        try:
            while True:
                temp = self.read()

                if temp is not None:
                    print(f"Temp: {temp:.2f} °C")
                else:
                    print("Temp: error reading sensor")

                time.sleep(interval)

        except KeyboardInterrupt:
            print("\nStopping...")


def main() -> None:
    soil_temp = SoilTemperature()
    soil_temp.stream()


if __name__ == "__main__":
    main()