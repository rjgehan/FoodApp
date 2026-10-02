#!/bin/bash
# Checks for the phone's Apple Intelligence rules in Nutrition facts, on this Mac, with no app,
# simulator or model: compiles the Foundation-only files with a scripted stand-in and runs them.
#
#   cd ios && ./checks/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
xcrun swiftc -swift-version 5 -D DEBUG -o "$OUT/checks" \
  MealPlanner/Features/Nutrition/NutritionModels.swift \
  MealPlanner/Features/Nutrition/NutritionAssist.swift \
  checks/main.swift
"$OUT/checks"
