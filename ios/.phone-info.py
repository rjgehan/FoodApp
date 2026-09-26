"""The real iPhone to install on: devicectl identifier, hardware UDID, connection, developer mode, name.

With a name (the first argument), the first paired iPhone whose name contains it, ignoring case.
Without one, the most reachable paired iPhone — a Mac that has ever been paired with a second
phone lists it forever, and "the first one in the list" was often a phone in another room.

Prints "none" in every field when there is no match, so the shell can read five fields either way.
"""
import json
import sys

wanted = (sys.argv[1] if len(sys.argv) > 1 else "").strip().lower()

try:
    devices = json.load(open("/tmp/mp-devices.json"))["result"]["devices"]
except Exception:
    devices = []


def reachability(device):
    """Lower is better. devicectl connects lazily, so "disconnected" over a cable or the local
    network is normal for a phone that is right here; "unavailable" is one that isn't."""
    connection = device.get("connectionProperties", {})
    tunnel = connection.get("tunnelState")
    if tunnel == "connected":
        return 0
    if tunnel == "disconnected" and connection.get("transportType"):
        return 1
    return 2


phones = [
    d for d in devices
    if d.get("hardwareProperties", {}).get("platform") == "iOS"
    # Newer devicectl says "reality": "simulated" and leaves isSimulated empty; check both.
    and d.get("hardwareProperties", {}).get("reality", "physical") == "physical"
    and not d.get("hardwareProperties", {}).get("isSimulated")
    and (not wanted or wanted in (d.get("deviceProperties", {}).get("name") or "").lower())
]
phones.sort(key=reachability)

if phones:
    device = phones[0]
    hardware = device.get("hardwareProperties", {})
    props = device.get("deviceProperties", {})
    print(
        device.get("identifier", "none"),
        # xcodebuild's -destination wants the hardware UDID; devicectl's identifier is a
        # different value that xcodebuild does not recognise.
        hardware.get("udid") or device.get("identifier", "none"),
        device.get("connectionProperties", {}).get("tunnelState", "unknown"),
        props.get("developerModeStatus") or "unknown",
        (props.get("name") or "iPhone").replace(" ", "_"),
    )
else:
    print("none none none none none")
