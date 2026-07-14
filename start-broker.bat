@echo off
setlocal

set "ROOT=%~dp0"
set "BROKER_DIR=%ROOT%broker"
set "BROKER_URL=http://127.0.0.1:8788"
set "POSTGRES_CONTAINER=qa-capture-postgres"

title Pinpoint Broker

echo.
echo ========================================
echo  Pinpoint local broker
echo ========================================
echo.

if not exist "%BROKER_DIR%\package.json" (
  echo [ERROR] Could not find the broker folder.
  echo Expected: %BROKER_DIR%
  echo.
  pause
  exit /b 1
)

cd /d "%BROKER_DIR%"

where docker >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker was not found.
  echo Install or start Docker Desktop, then run this script again.
  echo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm.cmd was not found.
  echo Install Node.js, then run this script again.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [ERROR] broker\.env is missing.
  echo.
  echo Create it from broker\.env.example and add your Atlassian OAuth values:
  echo   cd "%BROKER_DIR%"
  echo   Copy-Item .env.example .env
  echo   notepad .env
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo Node dependencies are missing. Installing now...
  echo.
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
  echo.
)

echo Starting PostgreSQL container...
docker start %POSTGRES_CONTAINER% >nul 2>&1
if errorlevel 1 (
  echo Existing PostgreSQL container was not found. Creating it with docker compose...
  docker compose up -d postgres
  if errorlevel 1 (
    echo.
    echo [ERROR] Could not start PostgreSQL.
    echo Make sure Docker Desktop is running.
    pause
    exit /b 1
  )
) else (
  echo PostgreSQL container is running.
)

echo Waiting for PostgreSQL to become ready...
set "DB_READY="
for /l %%i in (1,1,20) do (
  docker exec %POSTGRES_CONTAINER% pg_isready -U qa_capture -d qa_capture >nul 2>&1
  if not errorlevel 1 (
    set "DB_READY=1"
    goto db_ready
  )
  timeout /t 1 /nobreak >nul
)

:db_ready
if not defined DB_READY (
  echo.
  echo [ERROR] PostgreSQL did not become ready in time.
  echo Try opening Docker Desktop and checking the %POSTGRES_CONTAINER% container.
  pause
  exit /b 1
)

echo PostgreSQL is ready.
echo.
echo Checking database status...
call npm.cmd run db:status
if errorlevel 1 (
  echo.
  echo Database status check failed. Running migrations...
  call npm.cmd run db:migrate
  if errorlevel 1 (
    echo.
    echo [ERROR] Database migration failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting Pinpoint broker...
echo Broker URL: %BROKER_URL%
echo Press Ctrl+C to stop.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process '%BROKER_URL%'"
call npm.cmd start

echo.
echo Pinpoint broker stopped.
endlocal
