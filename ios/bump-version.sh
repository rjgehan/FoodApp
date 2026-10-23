#!/usr/bin/env bash
# Set the version people see in TestFlight and Settings (1.0, 1.1, …) — the app's and the share
# extension's together, since App Store Connect refuses an extension whose version differs.
#
#   ./bump-version.sh          # next minor version: 1.1 → 1.2
#   ./bump-version.sh 2.0      # exactly this one
#
# The build number needs nothing: release.sh uses the commit count. Bump once per release you
# want people to notice, then commit the change with that release.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$ROOT/MealPlanner.xcodeproj/project.pbxproj"

current=$(sed -n 's/.*MARKETING_VERSION = \([0-9.]*\);.*/\1/p' "$PROJECT" | head -1)
if [[ -z "$current" ]]; then
  echo "No MARKETING_VERSION in $PROJECT" >&2
  exit 1
fi

if [[ $# -ge 1 ]]; then
  next="$1"
  if ! [[ "$next" =~ ^[0-9]+(\.[0-9]+){1,2}$ ]]; then
    echo "A version looks like 1.2 or 1.2.3, not \"$next\"" >&2
    exit 1
  fi
else
  major="${current%%.*}"
  rest="${current#*.}"
  minor="${rest%%.*}"
  next="$major.$((minor + 1))"
fi

# Every target and configuration, in place (BSD and GNU sed take -i differently, so via a copy).
sed "s/MARKETING_VERSION = [0-9.]*;/MARKETING_VERSION = $next;/" "$PROJECT" > "$PROJECT.tmp"
mv "$PROJECT.tmp" "$PROJECT"

echo "Version $current → $next ($(grep -c "MARKETING_VERSION = $next;" "$PROJECT") places)"
