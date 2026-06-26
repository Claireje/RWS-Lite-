import asyncio
import struct
from datetime import datetime
from bleak import BleakClient
import threading
from collections import deque

# RadonEye RD200P2 BLE configuration
RADONEYE_MAC = "F8:B1:82:B2:36:12"

LBS_UUID_CONTROL = "00001524-1212-efde-1523-785feabcd123"
LBS_UUID_MEAS    = "00001525-1212-efde-1523-785feabcd123"

WAKE_UP_PAYLOAD = b'\x50\x11\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'


class RadonEyeP2Tracker:
    def __init__(self, mac_address):
        self.mac_address = mac_address
        self._history = deque(maxlen=5)
        self._history.append({"timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "radon": -1})
        self._lock = threading.Lock()
        self._loop = None
        self._first_val = True
        self._thread = threading.Thread(target=self._run_thread, daemon=True)
        self._thread.start()

    def read(self) -> dict:
        with self._lock:
            return self._history[-1]

    def read_history(self):
        """Return last 5 readings."""
        with self._lock:
            return list(self._history)

    def _run_thread(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self.run_loop())

    async def get_snapshot(self) -> dict:
        async with BleakClient(self.mac_address) as client:
            if not client.is_connected:
                return -1

            await client.write_gatt_char(LBS_UUID_CONTROL, WAKE_UP_PAYLOAD, response=True)
            await asyncio.sleep(0.5)

            measurement = await client.read_gatt_char(LBS_UUID_MEAS)

            if len(measurement) >= 8:
                raw_radon = struct.unpack('<H', measurement[2:4])[0]
                radon_pcil = raw_radon / 37.0
                return {
                    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "radon": radon_pcil
                }
            else:
                raise ValueError("Corrupt packet")

    async def run_loop(self):
        print(f"RadonEye thread started [{self.mac_address}]")
        while True:
            try:
                data = await self.get_snapshot()
                with self._lock:
                    self._history.append(data)
                print(f"{data['timestamp']} | {data['radon']:.2f} pCi/L")
            except Exception as e:
                print(f"{datetime.now()} | ERROR: {e}")
            await asyncio.sleep(30.0)


def main():
    tracker = RadonEyeP2Tracker(RADONEYE_MAC)
    while True:
        latest = tracker.read()
        if latest:
            print("Latest:", latest)
        asyncio.run(asyncio.sleep(10))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nExiting...")
