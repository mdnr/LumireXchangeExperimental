# Builds the front-end, merges it into the server's wwwroot, then publishes the
# server to ./publish for upload to a host (Alwaysdata .NET site).
# wwwroot is merged, never wiped: models/ and images/ hold uploaded product
# assets that live there at runtime.
param(
  [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontend = Join-Path $root 'frontend'
$wwwroot = Join-Path $root 'AgoraXchangeExperimental.Server\wwwroot'
$publish = Join-Path $root 'publish'

# npm and dotnet write progress to stderr, which PowerShell 5.1 surfaces as
# terminating errors while ErrorActionPreference is 'Stop'. Relax it around the
# native calls and judge success by the exit code instead.
function Invoke-Native([scriptblock]$cmd, [string]$what) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $cmd } finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)." }
}

Write-Host '1/3  Building the front-end...' -ForegroundColor Cyan
Push-Location $frontend
try { Invoke-Native { npm run build } 'Front-end build' } finally { Pop-Location }

Write-Host '2/3  Merging the build into Server\wwwroot...' -ForegroundColor Cyan
$dist = Join-Path $frontend 'dist'
if (-not (Test-Path -LiteralPath $dist)) { throw "No build output at $dist" }
Copy-Item -Path (Join-Path $dist '*') -Destination $wwwroot -Recurse -Force
# Stale hashed bundles from earlier builds would otherwise pile up in publish.
$builtAssets = @(Get-ChildItem -LiteralPath (Join-Path $dist 'assets') -File -ErrorAction SilentlyContinue)
Get-ChildItem -LiteralPath (Join-Path $wwwroot 'assets') -File -ErrorAction SilentlyContinue |
  ForEach-Object {
    $stale = $_
    if (-not ($builtAssets | Where-Object { $_.Name -eq $stale.Name })) {
      Remove-Item -LiteralPath $stale.FullName -Force
    }
  }

Write-Host '3/3  Publishing the server...' -ForegroundColor Cyan
if (Test-Path -LiteralPath $publish) { Remove-Item -LiteralPath $publish -Recurse -Force }
Invoke-Native { dotnet publish (Join-Path $root 'AgoraXchangeExperimental.Server') -c $Configuration -o $publish } 'Server publish'

# The app refuses to boot outside Development without Jwt:Key, so a host missing
# this file fails at startup rather than at request time. Catch it here instead.
$prodConfig = Join-Path $publish 'appsettings.Production.json'
if (-not (Test-Path -LiteralPath $prodConfig)) {
  throw "appsettings.Production.json is missing from publish output. Create it in AgoraXchangeExperimental.Server (it is gitignored) and re-run."
}

Write-Host ''
Write-Host 'Ready to upload: ' $publish -ForegroundColor Green
Write-Host 'Upload the CONTENTS of that folder to your Alwaysdata site directory, then'
Write-Host 'set the site start command to:  dotnet AgoraXchangeExperimental.Server.dll --urls "http://$IP:$PORT"'
Write-Host 'No environment variables are needed. The JWT signing key ships inside the'
Write-Host 'publish output as appsettings.Production.json; the site directory must be'
Write-Host 'writable so app.db can live beside the app.'
Write-Host 'Outside Development the demo seller/buyer logins are not seeded, and any'
Write-Host 'left over from an earlier deployment are removed on first start.'
Write-Host 'Restart the site in the admin once the upload finishes.'
