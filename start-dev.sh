#!/bin/bash

echo "Starting FoodApp development environment..."

# Move to project root (in case script is run elsewhere)
cd "$(dirname "$0")"

# Activate python venv
source functions/venv/bin/activate

firebase emulators:start