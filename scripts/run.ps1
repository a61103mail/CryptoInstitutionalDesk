$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
& "$Root\.venv\Scripts\crypto-desk.exe" --host 127.0.0.1 --port 8787

