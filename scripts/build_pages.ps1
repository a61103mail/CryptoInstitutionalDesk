$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Docs = Join-Path $Root "docs"
$Static = Join-Path $Docs "static"

New-Item -ItemType Directory -Force -Path $Static | Out-Null
Copy-Item -LiteralPath "$Root\src\crypto_desk\templates\index.html" -Destination "$Docs\index.html" -Force
Copy-Item -LiteralPath "$Root\src\crypto_desk\static\styles.css" -Destination "$Static\styles.css" -Force
Copy-Item -LiteralPath "$Root\src\crypto_desk\static\app.js" -Destination "$Static\app.js" -Force
Copy-Item -LiteralPath "$Root\src\crypto_desk\static\auto_engine.js" -Destination "$Static\auto_engine.js" -Force
Set-Content -LiteralPath "$Docs\.nojekyll" -Value "" -Encoding ascii
Write-Host "GitHub Pages files built in $Docs"
