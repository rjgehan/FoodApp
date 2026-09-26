#!/usr/bin/env bash
# Put the current app on every iPhone paired with this Mac — over Wi-Fi where a phone can be
# reached that way, over the cable where it is plugged in — and say plainly which ones it could
# not reach, so they can be plugged in and this run again.
#
#   ./update-phones.sh            # every paired phone
#   ./update-phones.sh jen ryan   # only the phones whose names contain one of these
#
# A free personal team's apps stop opening seven days after they were signed, and this re-signs
# them, so running it at least weekly keeps everybody's phone working. It never opens the app on
# anybody's phone: an update should not pop up in the middle of someone's day.
#
# Wi-Fi needs the phone on the same network as this Mac, and to have been plugged in once since
# it was paired (that is when Xcode turns on connecting over the network).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
SCHEME="MealPlanner"
WORK="$(mktemp -d /tmp/mp-update.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

xcrun devicectl list devices --json-output "$WORK/devices.json" >/dev/null 2>&1 || true

# identifier <tab> name <tab> how it was last seen — every real iPhone, filtered by any names given.
python3 - "$WORK/devices.json" "$@" > "$WORK/phones.tsv" <<'PY'
import json, sys
try:
    devices = json.load(open(sys.argv[1]))["result"]["devices"]
except Exception:
    devices = []
wanted = [w.lower() for w in sys.argv[2:]]
for d in devices:
    hw, props, conn = d.get("hardwareProperties", {}), d.get("deviceProperties", {}), d.get("connectionProperties", {})
    if hw.get("platform") != "iOS" or hw.get("isSimulated") or (hw.get("reality") or "physical") != "physical":
        continue
    name = props.get("name") or "iPhone"
    if wanted and not any(w in name.lower() for w in wanted):
        continue
    print(f"{d.get('identifier')}\t{name}\t{conn.get('transportType') or 'not seen'}")
PY

if [[ ! -s "$WORK/phones.tsv" ]]; then
  echo "No paired iPhone${*:+ matching: $*}. Plug one in, unlock it and tap Trust, then run this again." >&2
  exit 1
fi

reachable=()
needs_cable=()

echo "Looking for phones…"
while IFS=$'\t' read -r id name transport; do
  # devicectl connects lazily, so asking the phone something is the only real test of whether
  # it can be reached right now. Twenty seconds is plenty over Wi-Fi; a phone that is off,
  # asleep for a long time or on another network just times out.
  if xcrun devicectl -t 20 device info details --device "$id" > "$WORK/$id.info" 2>&1; then
    how=$(sed -n 's/.*Transport Type: //p' "$WORK/$id.info" | head -1)
    echo "  ✓ $name (${how:-$transport})"
    reachable+=("$id"$'\t'"$name")
  else
    if grep -q "Developer Mode is turned off" "$WORK/$id.info"; then
      why="Developer Mode is off (Settings → Privacy & Security → Developer Mode)"
    else
      why="not reachable over Wi-Fi"
    fi
    echo "  ✗ $name — $why"
    needs_cable+=("$name — $why")
  fi
done < "$WORK/phones.tsv"

updated=()
failed=()

if [[ ${#reachable[@]} -gt 0 ]]; then
  # The team Xcode already knows beats reading it off a certificate that may have expired.
  TEAM="${DEVELOPMENT_TEAM:-$(defaults read com.apple.dt.Xcode IDEProvisioningTeams 2>/dev/null \
    | sed -n 's/.*teamID = \([A-Z0-9]*\).*/\1/p' | head -1)}"
  if [[ -z "$TEAM" ]]; then
    echo "No development team. In Xcode: Settings → Accounts → + → Apple ID, then run this again." >&2
    exit 1
  fi

  # One build for every phone: a team's development profile covers every phone registered to the
  # team, so a generic device build installs on all of them. A phone that has never been
  # registered is the exception — see the failure message below.
  echo
  echo "Building…"
  if ! xcodebuild \
      -project "$ROOT/MealPlanner.xcodeproj" \
      -scheme "$SCHEME" \
      -configuration Debug \
      -destination 'generic/platform=iOS' \
      -derivedDataPath "$ROOT/.build-device" \
      -allowProvisioningUpdates \
      CODE_SIGNING_ALLOWED=YES \
      CODE_SIGNING_REQUIRED=YES \
      CODE_SIGN_STYLE=Automatic \
      "CODE_SIGN_IDENTITY=Apple Development" \
      DEVELOPMENT_TEAM="$TEAM" \
      -quiet \
      build > "$WORK/build.log" 2>&1; then
    grep -E "error:" "$WORK/build.log" | head -5 >&2
    echo "The build failed; nothing was installed." >&2
    exit 1
  fi
  app="$ROOT/.build-device/Build/Products/Debug-iphoneos/$SCHEME.app"

  echo
  echo "Installing…"
  for entry in "${reachable[@]}"; do
    id="${entry%%$'\t'*}"
    name="${entry#*$'\t'}"
    if xcrun devicectl -t 300 device install app --device "$id" "$app" > "$WORK/$id.install" 2>&1; then
      echo "  ✓ $name"
      updated+=("$name")
    else
      if grep -qiE "provisioning profile|not registered|doesn.t include" "$WORK/$id.install"; then
        why="not registered with the team yet — plug it in once and run ./preview.sh --phone \"$name\""
      else
        why=$(grep -iE "error|failed|reason" "$WORK/$id.install" | tail -1 | sed 's/^[[:space:]]*//')
      fi
      echo "  ✗ $name — $why"
      failed+=("$name — $why")
    fi
  done
fi

echo
echo "Updated: ${#updated[@]}"
for n in ${updated[@]+"${updated[@]}"}; do echo "  • $n"; done
if [[ ${#needs_cable[@]} -gt 0 || ${#failed[@]} -gt 0 ]]; then
  echo "Plug these in (and unlock them), then run this again:"
  for n in ${needs_cable[@]+"${needs_cable[@]}"} ${failed[@]+"${failed[@]}"}; do echo "  • $n"; done
  exit 2
fi
