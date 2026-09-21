@echo off
setlocal
set "ROOT=%~dp0"
if not exist "%ROOT%.venv\Scripts\crypto-desk.exe" (
  echo Environment not found. Run scripts\setup.ps1 first.
  pause
  exit /b 1
)
start "Crypto Institutional Desk" /D "%ROOT%" "%ROOT%.venv\Scripts\crypto-desk.exe" --host 127.0.0.1 --port 8787
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8787"
endlocal
