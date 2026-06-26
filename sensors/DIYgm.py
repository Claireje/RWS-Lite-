import time
import threading
from gpiozero import PWMOutputDevice, DigitalInputDevice, DigitalOutputDevice
from gpiozero.pins.lgpio import LGPIOFactory


class GeigerCounter:
    def __init__(
            self,
            pwm_pin=18,           # GPIO 18 - High Voltage PWM
            meas_pin=21,          # GPIO 21 - Radiation Pulse Signal
            pullup_pin=12,        # GPIO 12 - Logic Power
            pwm_frequency=1000,   # 1kHz for the high-voltage booster
            pwm_duty_cycle=0.1,   # 10% duty cycle
            conversion_factor=0.0057  # CPM to uSv/h (SBM-20 tube)
    ):
        self.lock = threading.Lock()
        self.counts = 0
        self.conversion_factor = conversion_factor
        self.cpm_history = []
        self.max_history_length = 120

        self.factory = LGPIOFactory()
        self.power = DigitalOutputDevice(pullup_pin, pin_factory=self.factory, initial_value=True)
        self.pwm = PWMOutputDevice(pwm_pin, pin_factory=self.factory, frequency=pwm_frequency, initial_value=pwm_duty_cycle)
        self.signal = DigitalInputDevice(meas_pin, pin_factory=self.factory, pull_up=False)
        self.signal.when_deactivated = self._detection_callback

        self.running = True
        self.processor_thread = threading.Thread(target=self._process_rolling_window, daemon=True)
        self.processor_thread.start()

    def _detection_callback(self) -> None:
        with self.lock:
            self.counts += 1

    def _process_rolling_window(self) -> None:
        while self.running:
            time.sleep(1.0)
            with self.lock:
                current_counts = self.counts
                self.counts = 0
            self.cpm_history.append(current_counts)
            if len(self.cpm_history) > self.max_history_length:
                self.cpm_history.pop(0)

    def read(self) -> dict:
        """Returns CPM and dose rate in uSv/h based on a 120-second rolling window."""
        with self.lock:
            history = list(self.cpm_history)

        if not history:
            return {"counts_last_second": 0, "cps": 0.0, "cpm": 0, "usvh": 0.0}

        total_pulses = sum(history)
        calculated_cpm = int(total_pulses * 60 / len(history))
        calculated_cps = calculated_cpm / 60.0
        calculated_usvh = calculated_cpm * self.conversion_factor

        return {
            "counts_last_second": history[-1] if history else 0,
            "cps": calculated_cps,
            "cpm": calculated_cpm,
            "usvh": calculated_usvh
        }

    def cleanup(self) -> None:
        """Powers down high voltage and releases GPIO pins."""
        self.running = False
        self.pwm.close()
        self.power.close()
        self.signal.close()


if __name__ == "__main__":
    try:
        print("Geiger counter starting...")
        geigerCounter = GeigerCounter()

        while True:
            reading = geigerCounter.read()
            print(
                f"CPM: {reading['cpm']:<4} | "
                f"Dose Rate: {reading['usvh']:.4f} uSv/h | "
                f"Raw Last Sec: {reading['counts_last_second']}"
            )
            time.sleep(1.0)

    except KeyboardInterrupt:
        print("\nShutting down.")
        geigerCounter.cleanup()
