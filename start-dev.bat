@echo off
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing packages...
    npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo Killing existing processes on ports 3000 and 3001...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000 "') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3001 "') do taskkill /f /pid %%a >nul 2>&1

echo.
echo UI starting at http://localhost:3000
echo Relay starting at http://localhost:3001
echo.
start "CimeFlow Relay" cmd /k "set RELAY_PORT=3001&& npm run dev:relay"
set NEXT_PUBLIC_CIME_RELAY_HTTP_URL=http://localhost:3001
set NEXT_PUBLIC_CIME_RELAY_WS_URL=ws://localhost:3001
npm run dev:ui
pause
