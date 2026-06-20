import time
import threading
from gpiozero import PWMOutputDevice, DigitalInputDevice, DigitalOutputDevice
from gpiozero.pins.lgpio import LGPIOFactory

class GeigerCounter:
    def __init__(
            self,
            pwm_pin=18,          # GPIO 18 (Physical pin 12) - High Voltage PWM
            meas_pin=21,         # GPIO 21 (Physical pin 40) - Radiation Pulse Signal
            pullup_pin=12,       # GPIO 12 (Physical pin 32) - Logic Power
            pwm_frequency=1000,  # 1kHz for the high-voltage booster
            pwm_duty_cycle=0.1,  # 10% duty cycle (0.1 in gpiozero decimal format)

            # --- SBM-20 SENSITIVITY CONVERSION FACTOR ---
            # 0.0057 is the standard conversion factor for Soviet SBM-20 / STS-5 tubes.
            conversion_factor=0.0057
    ):
        self.lock = threading.Lock()
        self.counts = 0
        self.conversion_factor = conversion_factor

        # Rolling window history
        self.cpm_history = []
        self.max_history_length = 120

        #modern LGPIO factory for new Pi OS versions
        self.factory = LGPIOFactory()

        #Turn on the low-voltage logic power pin to wake up the board
        self.power = DigitalOutputDevice(pullup_pin, pin_factory=self.factory, initial_value=True)

        # 1. Start the PWM engine for the ~400V high-voltage supply
        self.pwm = PWMOutputDevice(pwm_pin, pin_factory=self.factory, frequency=pwm_frequency, initial_value=pwm_duty_cycle)

        # 2. Attach the pulse listener interrupt (triggers on FALLING edge))
        self.signal = DigitalInputDevice(meas_pin, pin_factory=self.factory, pull_up=False)
        self.signal.when_deactivated = self._detection_callback

        # 3. Start the background tracking thread to manage data loops every second
        self.running = True
        self.processor_thread = threading.Thread(target=self._process_rolling_window, daemon=True)
        self.processor_thread.start()

    def _detection_callback(self) -> None:
        """Fires instantly on every radiation particle strike."""
        with self.lock:
            self.counts += 1

    def _process_rolling_window(self) -> None:
        """Maintains the 120-second data buffer in the background."""
        while self.running:
            time.sleep(1.0)
            with self.lock:
                current_counts = self.counts
                self.counts = 0  # Reset for the next 1-second block

            self.cpm_history.append(current_counts)
            if len(self.cpm_history) > self.max_history_length:
                self.cpm_history.pop(0)

    def read(self) -> dict:
        """
        Calculates CPM and automatically converts it to microSieverts per hour (uSv/h).
        """
        with self.lock:
            history = list(self.cpm_history)

        if not history:
            return {"counts_last_second": 0, "cps": 0.0, "cpm": 0, "usvh": 0.0}

        total_pulses = sum(history)
        calculated_cpm = int(total_pulses * 60 / len(history))
        calculated_cps = calculated_cpm / 60.0

        # Math conversion: CPM * 0.0057 = uSv/h
        calculated_usvh = calculated_cpm * self.conversion_factor

        return {
            "counts_last_second": history[-1] if history else 0,
            "cps": calculated_cps,
            "cpm": calculated_cpm,
            "usvh": calculated_usvh
        }

    def cleanup(self) -> None:
        """Safely powers down high voltage and releases the hardware pins."""
        self.running = False
        self.pwm.close()     # Kills the High Voltage generator
        self.power.close()   # Turns off logic power to the DIYGM board
        self.signal.close()  # Releases the interrupt listener


# Singleton instance so it can be imported elsewhere
if __name__ == "__main__":
    try:
        print("Starting Native GPIOZero Geiger Counter Engine...")
        print("Gathering history packets (22s window)...")
        geigerCounter = GeigerCounter()

        while True:
            reading = geigerCounter.read()
            # This formatted print statement outputs your new live dose rate
            print(
                f"CPM: {reading['cpm']:<4} | "
                f"Dose Rate: {reading['usvh']:.4f} uSv/h | "
                f"Raw Last Sec: {reading['counts_last_second']}"
            )
            time.sleep(1.0)

    except KeyboardInterrupt:
        print("\nSafely shutting down high-voltage systems and exiting...")
        geigerCounter.cleanup()