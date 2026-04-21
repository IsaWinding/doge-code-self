@echo off
setlocal EnableExtensions

cd /d "%~dp0"

echo.
echo ==========================================
echo   Doge Code + DeepSeek Launcher
echo ==========================================
echo.

:: 设置 DeepSeek 兼容的 max_tokens (DeepSeek 最大支持 8192)
set CLAUDE_CODE_MAX_OUTPUT_TOKENS=8192

where bun >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Bun was not found in PATH.
  echo Install Bun first, then run this launcher again.
  exit /b 1
)

echo [INFO] CLAUDE_CODE_MAX_OUTPUT_TOKENS=8192
echo [INFO] Starting Doge Code with DeepSeek...
echo.

bun run dev

echo.
echo [INFO] Doge Code exited.
exit /b %errorlevel%
