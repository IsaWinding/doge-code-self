@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

echo.
echo ==========================================
echo   Doge Code Windows Repair Installer
echo ==========================================
echo.
echo This script will:
echo 1. Stop local Bun / Doge processes
echo 2. Remove node_modules
echo 3. Clear Bun cache
echo 4. Reinstall dependencies
echo.
echo Working directory:
echo %cd%
echo.

where bun >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Bun was not found in PATH.
  echo Install Bun first, then run this script again.
  exit /b 1
)

echo [1/5] Stopping possible running processes...
taskkill /F /IM bun.exe >nul 2>nul
taskkill /F /IM doge.exe >nul 2>nul
taskkill /F /IM node.exe >nul 2>nul

echo [2/5] Removing read-only attributes from node_modules...
if exist node_modules (
  attrib -R /S /D node_modules\* >nul 2>nul
)

echo [3/5] Removing node_modules...
if exist node_modules (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "try { Remove-Item -LiteralPath 'node_modules' -Recurse -Force -ErrorAction Stop; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
  if errorlevel 1 (
    echo [WARN] Failed to fully remove node_modules.
    echo Close editors/terminals using this folder, then rerun as Administrator.
    exit /b 1
  )
)

echo [4/5] Clearing Bun cache...
bun pm cache rm
if errorlevel 1 (
  echo [WARN] Bun cache cleanup reported an error. Continuing anyway...
)

echo [5/5] Reinstalling dependencies...
bun install
if errorlevel 1 (
  echo.
  echo [ERROR] bun install still failed.
  echo.
  echo Try these next:
  echo - Run this script as Administrator
  echo - Temporarily disable Windows Defender real-time protection
  echo - Add this folder to Defender exclusions:
  echo   %cd%
  echo - Reboot Windows, then rerun this script
  exit /b 1
)

echo.
echo [OK] Dependencies were repaired successfully.
echo.
echo Recommended next steps:
echo   set CLAUDE_CODE_USE_POWERSHELL_TOOL=1
echo   bun run dev
echo.
exit /b 0
