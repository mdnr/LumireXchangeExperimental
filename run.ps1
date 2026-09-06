# Starts the Lumière server + Vite dev frontend detached, then prints URLs.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $env:TEMP 'opencode'

function Start-Detached([string]$workDir, [string]$cmdLine, [string]$logName) {
  $redirect = Join-Path $logDir $logName
  $cmd = 'cmd /c "cd /d ' + $workDir + ' && ' + $cmdLine + ' > ' + $redirect + ' 2>&1"'
  Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd } |
    Out-Null
}

Start-Detached (Join-Path $root 'AgoraXchangeExperimental.Server') `
  'set ASPNETCORE_ENVIRONMENT=Development&& dotnet run --no-build --urls http://localhost:5582' `
  'server.log'

Start-Detached (Join-Path $root 'frontend') 'npm run dev' 'vite.log'

Write-Host 'Lumière is starting… back-end on http://localhost:5582, front-end on http://localhost:5173'
Start-Sleep -Seconds 12
Write-Host ''
Write-Host 'Open the store:  http://localhost:5173'
Write-Host 'Demo seller:      seller@lumiere.app / Seller123!'
Write-Host 'Demo buyer:       buyer@lumiere.app / Buyer123!'
Write-Host ''
Write-Host 'Logs:' (Join-Path $logDir 'server.log'), (Join-Path $logDir 'vite.log')