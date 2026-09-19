"""The first real iPhone devicectl knows about: identifier, connection, developer mode, name.

Prints "none" when there is no phone, so the shell can read four fields either way.
"""
import json

try:
    devices = json.load(open("/tmp/mp-devices.json"))["result"]["devices"]
except Exception:
    devices = []

for device in devices:
    hardware = device.get("hardwareProperties", {})
    props = device.get("deviceProperties", {})
    if hardware.get("platform") != "iOS" or hardware.get("isSimulated"):
        continue
    print(
        device.get("identifier", "none"),
        device.get("connectionProperties", {}).get("tunnelState", "unknown"),
        props.get("developerModeStatus") or "unknown",
        (props.get("name") or "iPhone").replace(" ", "_"),
    )
    break
else:
    print("none none none none")
