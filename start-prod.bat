@echo off
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    pause & exit /b 1
)

if not exist "node_modules" (
    echo Installing packages...
    npm install
    if errorlevel 1 ( echo [ERROR] npm install failed. & pause & exit /b 1 )
)

echo Building Next.js...
set NEXT_PUBLIC_CIME_RELAY_HTTP_URL=http://localhost:3001
set NEXT_PUBLIC_CIME_RELAY_WS_URL=ws://localhost:3001
call npm run build
if errorlevel 1 ( echo [ERROR] Build failed. & pause & exit /b 1 )

echo.
echo UI running at http://localhost:3000
echo Relay running at http://localhost:3001
echo.
set NODE_ENV=production
start "CimeFlow Relay" cmd /k "set NODE_ENV=production&& set RELAY_PORT=3001&& npm run start:relay"
npm run start:ui
pause
