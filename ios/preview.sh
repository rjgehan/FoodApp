#!/usr/bin/env bash
# Build the app and put it on a simulator, in one command.
#
#   ./preview.sh                 # build, boot a simulator, install, launch
#   ./preview.sh --shot look.png # ...and save a screenshot
#   ./preview.sh --device "iPhone 17 Pro"
#
# Needs Xcode (not just the Command Line Tools) and the licence accepted once:
#   sudo xcodebuild -license accept && sudo xcodebuild -runFirstLaunch
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

BUNDLE_ID="cloud.gehan.mealplanner"
SCHEME="MealPlanner"
DEVICE=""
SHOT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device) DEVICE="$2"; shift 2 ;;
    --shot) SHOT="$2"; shift 2 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
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

# A booted simulator wins; otherwise the newest available iPhone.
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
