#!/bin/bash
# Checks for the phone's Apple Intelligence rules in Nutrition facts, Meal plans and receipts (and matching a scanned
# packet to a receipt line), on this Mac, with no app,
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
  MealPlanner/Features/MealPlans/MealPlansModels.swift \
  MealPlanner/Features/MealPlans/MealPlanAssist.swift \
  MealPlanner/Features/Receipts/ReceiptAssist.swift \
  MealPlanner/Features/Receipts/ProductMatch.swift \
  MealPlanner/Features/Receipts/UnitPrice.swift \
  checks/AppTypes.swift \
  checks/MealPlanChecks.swift \
  checks/ReceiptChecks.swift \
  checks/UnitPriceChecks.swift \
  checks/main.swift
"$OUT/checks"
