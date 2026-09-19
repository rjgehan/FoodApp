#!/usr/bin/env bash
# Build the app and put it somewhere you can look at it.
#
#   ./preview.sh                      # simulator: build, boot, install, launch
#   ./preview.sh --shot look.png      # ...and save a screenshot
#   ./preview.sh --device "iPhone 17 Pro"
#   ./preview.sh --phone              # the plugged-in iPhone, signed
#
# Needs Xcode (not just the Command Line Tools), with the licence accepted once:
#   sudo xcodebuild -license accept && sudo xcodebuild -runFirstLaunch
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

BUNDLE_ID="cloud.gehan.mealplanner"
SCHEME="MealPlanner"
DEVICE=""
SHOT=""
PHONE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device) DEVICE="$2"; shift 2 ;;
    --shot) SHOT="$2"; shift 2 ;;
    --phone) PHONE=1; shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ ! -d "$DEVELOPER_DIR" ]]; then
  echo "Xcode not found at $DEVELOPER_DIR. Install it from the App Store." >&2
  exit 1
fi
if ! xcrun simctl help >/dev/null 2>&1; then
  echo "Xcode is installed but not usable yet. Run this once, then try again:" >&2
  echo "  sudo xcodebuild -license accept && sudo xcodebuild -runFirstLaunch" >&2
  exit 1
fi

# --- A real iPhone ---------------------------------------------------------------------------
# Needs an Apple ID in Xcode (Settings → Accounts) for a signing certificate, Developer Mode on
# in Settings → Privacy & Security, and the phone plugged in and unlocked.
if [[ -n "$PHONE" ]]; then
  xcrun devicectl list devices --json-output /tmp/mp-devices.json >/dev/null 2>&1 || true

  # devicectl's identifier is not the UDID its table prints, so take it from the JSON.
  read -r udid state devmode name < <(python3 "$ROOT/.phone-info.py")

  if [[ -z "${udid:-}" || "$udid" == "none" ]]; then
    echo "No iPhone paired with this Mac. Plug it in, unlock it, and tap Trust." >&2
    exit 1
  fi
  echo "Phone: ${name:-iPhone} ($udid)"
  echo "  connection: $state   developer mode: $devmode"
  if [[ "$state" != "connected" ]]; then
    echo "Paired but not connected. Plug it in and unlock it, then rerun." >&2
    exit 1
  fi
  if [[ "$devmode" == "disabled" ]]; then
    echo "Turn on Settings → Privacy & Security → Developer Mode, then rerun." >&2
    exit 1
  fi

  # The team Xcode already knows beats reading it off a certificate that may have expired.
  TEAM="${DEVELOPMENT_TEAM:-$(defaults read com.apple.dt.Xcode IDEProvisioningTeams 2>/dev/null \
    | sed -n 's/.*teamID = \([A-Z0-9]*\).*/\1/p' | head -1)}"
  if [[ -z "$TEAM" ]]; then
    echo "No development team. In Xcode: Settings → Accounts → + → Apple ID, then rerun." >&2
    exit 1
  fi
  echo "  team: $TEAM"

  # -allowProvisioningUpdates lets Xcode mint a fresh certificate and profile. A free personal
  # team's profile lasts seven days, so this needs rerunning about weekly.
  xcodebuild \
    -project "$ROOT/MealPlanner.xcodeproj" \
    -scheme "$SCHEME" \
    -configuration Debug \
    -destination "id=$udid" \
    -derivedDataPath "$ROOT/.build-device" \
    -allowProvisioningUpdates \
    CODE_SIGNING_ALLOWED=YES \
    CODE_SIGNING_REQUIRED=YES \
    CODE_SIGN_STYLE=Automatic \
    DEVELOPMENT_TEAM="$TEAM" \
    -quiet \
    build

  app="$ROOT/.build-device/Build/Products/Debug-iphoneos/$SCHEME.app"
  [[ -d "$app" ]] || { echo "Build produced no app at $app" >&2; exit 1; }

  xcrun devicectl device install app --device "$udid" "$app"
  xcrun devicectl device process launch --device "$udid" "$BUNDLE_ID"
  echo
  echo "Installed. On the phone: sign-in screen → Server → http://$(ipconfig getifaddr en0 2>/dev/null):8080"
  exit 0
fi

# --- A simulator -----------------------------------------------------------------------------
udid=""
if [[ -n "$DEVICE" ]]; then
  udid=$(xcrun simctl list devices available | grep -F "$DEVICE (" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
  [[ -n "$udid" ]] || { echo "No simulator called '$DEVICE'. Try: xcrun simctl list devices available" >&2; exit 1; }
else
  udid=$(xcrun simctl list devices booted | grep -E "iPhone.*\(Booted\)" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/' || true)
  if [[ -z "$udid" ]]; then
    udid=$(xcrun simctl list devices available | grep -E "^\s+iPhone" | tail -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
  fi
fi
[[ -n "$udid" ]] || {
  echo "No iPhone simulator installed. In Xcode: Settings → Components → iOS Simulator." >&2
  exit 1
}

name=$(xcrun simctl list devices | grep "$udid" | sed -E 's/^\s+(.*) \([0-9A-F-]{36}\).*/\1/')
echo "Simulator: $name"

xcrun simctl boot "$udid" 2>/dev/null || true
open -a Simulator --args -CurrentDeviceUDID "$udid" 2>/dev/null || open -a Simulator

echo "Building…"
xcodebuild \
  -project "$ROOT/MealPlanner.xcodeproj" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "id=$udid" \
  -derivedDataPath "$ROOT/.build" \
  -quiet \
  build

app="$ROOT/.build/Build/Products/Debug-iphonesimulator/$SCHEME.app"
[[ -d "$app" ]] || { echo "Build produced no app at $app" >&2; exit 1; }

xcrun simctl bootstatus "$udid" -b >/dev/null
xcrun simctl install "$udid" "$app"
xcrun simctl launch "$udid" "$BUNDLE_ID" >/dev/null
echo "Running on $name."

if [[ -n "$SHOT" ]]; then
  sleep 3
  xcrun simctl io "$udid" screenshot "$SHOT"
  echo "Screenshot: $SHOT"
fi
