@echo off
setlocal

cd /d "%~dp0broker"

echo Starting Pinpoint broker dependencies...
docker start qa-capture-postgres >nul 2>&1

echo.
echo Starting Pinpoint broker...
echo Broker URL: http://127.0.0.1:8788
echo Press Ctrl+C to stop.
echo.

npm.cmd start

endlocal
