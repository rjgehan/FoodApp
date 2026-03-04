@echo off

echo Starting FoodApp development environment...

cd /d %~dp0

call functions\venv\Scripts\activate

firebase emulators:start