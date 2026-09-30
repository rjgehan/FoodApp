#!/usr/bin/env bash
# Build the app for TestFlight and upload it to App Store Connect.
#
#   ./release.sh            # archive, then upload
#   ./release.sh --no-upload  # archive and export only, to check signing without sending anything
#
# Needs the paid team in Xcode (Settings → Accounts) and the app created in App Store Connect
# with bundle id cloud.gehan.mealplanner. Uploads with the Apple ID Xcode is signed in with.
#
# The build number is the number of commits on this branch, so every upload is higher than the
# last without anybody remembering to bump it — App Store Connect refuses a number it has seen.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
SCHEME="MealPlanner"
UPLOAD=1
[[ "${1:-}" == "--no-upload" ]] && UPLOAD=0

# The paid team: the first team Xcode knows that is not a free personal one. DEVELOPMENT_TEAM
# overrides it for an account in more than one paid team.
TEAM="${DEVELOPMENT_TEAM:-$(defaults read com.apple.dt.Xcode IDEProvisioningTeams 2>/dev/null | python3 -c '
import re, sys
text = sys.stdin.read()
for block in re.findall(r"\{[^{}]*\}", text):
    if "isFreeProvisioningTeam = 1" in block:
        continue
    found = re.search(r"teamID = (\w+);", block)
    if found:
        print(found.group(1))
        break
')}"
# An individual enrollment keeps the team ID it had as a free personal team, and Xcode's cached
# list can go on calling it "Personal Team" for a while — so fall back to the one team it knows.
if [[ -z "$TEAM" ]]; then
  TEAM=$(defaults read com.apple.dt.Xcode IDEProvisioningTeams 2>/dev/null | sed -n 's/.*teamID = \([A-Z0-9]*\).*/\1/p' | head -1)
fi
if [[ -z "$TEAM" ]]; then
  echo "No paid team in Xcode yet. Xcode → Settings → Accounts: the Apple ID should list a team" >&2
  echo "without \"(Personal Team)\" after enrolling. Then run this again." >&2
  exit 1
fi

BUILD=$(git -C "$ROOT" rev-list --count HEAD)
WORK="$ROOT/.build-release"
ARCHIVE="$WORK/MealPlanner.xcarchive"
rm -rf "$WORK"
mkdir -p "$WORK"

echo "Team $TEAM, build $BUILD"
echo "Archiving…"
xcodebuild \
  -project "$ROOT/MealPlanner.xcodeproj" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM" \
  CODE_SIGN_STYLE=Automatic \
  CURRENT_PROJECT_VERSION="$BUILD" \
  -quiet \
  archive

# app-store-connect with destination "upload" sends it straight from the export; "export" only
# writes the .ipa, which is what --no-upload wants.
cat > "$WORK/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$([[ $UPLOAD == 1 ]] && echo upload || echo export)</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>testFlightInternalTestingOnly</key><false/>
</dict>
</plist>
PLIST

echo "$([[ $UPLOAD == 1 ]] && echo Uploading… || echo Exporting…)"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$WORK/export" \
  -exportOptionsPlist "$WORK/ExportOptions.plist" \
  -allowProvisioningUpdates \
  -quiet

if [[ $UPLOAD == 1 ]]; then
  echo "Uploaded build $BUILD. App Store Connect takes 5–15 minutes to process it; it then shows"
  echo "in TestFlight, where internal testers get it automatically."
else
  echo "Exported to $WORK/export (not uploaded)."
fi
