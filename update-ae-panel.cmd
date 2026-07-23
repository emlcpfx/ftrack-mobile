@echo off
REM Double-click to pull latest and deploy the After Effects ftrack panel.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-ae-panel.ps1"
echo.
pause
