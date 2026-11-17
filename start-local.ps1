$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath 'node_modules/vite/bin/vite.js')) {
    npm install
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
npm run dev
