@echo off
setlocal

set "HARNESS_ROOT=D:\CC\AiAutoCoding2.0"
set "TARGET_ROOT=%~dp0"
set "AGENT=%~1"

if "%AGENT%"=="" set "AGENT=codex"

if not exist "%HARNESS_ROOT%\start-ralph.bat" (
    echo [ERROR] Ralph harness not found at %HARNESS_ROOT%
    exit /b 1
)

call "%HARNESS_ROOT%\start-ralph.bat" "%AGENT%" "%TARGET_ROOT%"
exit /b %ERRORLEVEL%
