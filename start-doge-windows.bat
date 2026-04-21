@echo off
setlocal EnableExtensions

cd /d "%~dp0"

echo.
echo ==========================================
echo   Doge Code Windows Launcher
echo ==========================================
echo.

where bun >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Bun was not found in PATH.
  echo Install Bun first, then run repair-windows-install.bat or this launcher again.
  exit /b 1
)

set "CLAUDE_CODE_USE_POWERSHELL_TOOL=1"

echo [INFO] PowerShell tool enabled for this session.
echo [INFO] Starting Doge Code...
echo.

bun run dev

echo.
echo [INFO] Doge Code exited.
exit /b %errorlevel%
