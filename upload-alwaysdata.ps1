# Uploads publish/wwwroot to Alwaysdata over SFTP.
#
# Prefers key auth, and falls back to a password. The key is the good path: the
# private key never leaves ~/.ssh, there is no secret to copy around, and the
# password can be rotated without breaking deploys.
#
# The fallback exists because the key is only useful once it has been added in
# the Alwaysdata admin panel. The password is never passed on a command line and
# never written into the repo: it is read from a file that this script deletes
# afterwards, and OpenSSH for Windows reads it back through SSH_ASKPASS.
#
# Only files are uploaded, and only the ones listed. Nothing on the server is
# deleted, which is what keeps app.db, wwwroot/models/ and wwwroot/images/ safe.
param(
  [string]$Remote = 'mdnr@ssh-mdnr.alwaysdata.net',
  [string]$RemoteRoot = '/home/mdnr/www/wwwroot',
  [string]$IdentityFile = "$env:USERPROFILE\.ssh\id_ed25519_alwaysdata",
  [string]$PasswordFile = "$env:TEMP\opencode\ad-pass.txt",
  # Set to use the password even when a key is present, e.g. while adding one.
  [switch]$ForcePassword
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$publish = Join-Path $root 'publish\wwwroot'

if (-not (Test-Path -LiteralPath (Join-Path $publish 'index.html'))) {
  throw "No publish output at $publish. Run deploy.ps1 first."
}

$useKey = -not $ForcePassword -and (Test-Path -LiteralPath $IdentityFile)
if (-not $useKey -and -not (Test-Path -LiteralPath $PasswordFile)) {
  throw "No usable credential. Either add the public key at $IdentityFile.pub in the`n" +
        "Alwaysdata admin panel, or create $PasswordFile containing the password."
}
if ($useKey) {
  Write-Host "Authenticating with key $IdentityFile" -ForegroundColor Cyan
} else {
  Write-Host 'No key found, falling back to the password file.' -ForegroundColor Yellow
}

$assets = @(Get-ChildItem -LiteralPath (Join-Path $publish 'assets') -File)
$roots = @('index.html') + @(Get-ChildItem -LiteralPath $publish -File |
  Where-Object { $_.Name -ne 'index.html' } | ForEach-Object { $_.Name })

# Forward slashes, because sftp's lcd is not happy with backslashes.
$slash = { param($p) $p -replace '\\', '/' }

$batch = Join-Path $env:TEMP 'opencode\ad-upload.txt'
$lines = @("lcd $(& $slash $publish)", "cd $RemoteRoot")
$lines += $roots | ForEach-Object { "put $_" }
$lines += "lcd $(& $slash (Join-Path $publish 'assets'))", "cd $RemoteRoot/assets"
$lines += $assets | ForEach-Object { "put $($_.Name)" }
$lines += 'bye'
Set-Content -LiteralPath $batch -Value $lines -Encoding ASCII

Write-Host "Uploading $($roots.Count) root files and $($assets.Count) assets" -ForegroundColor Cyan
$lines | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

# SSH_ASKPASS_REQUIRE=force is what makes this work with no TTY at all.
#
# Every -o must come BEFORE -b. sftp handles -b inline while it is still parsing
# arguments: it opens the connection there and then, so a later -o has not taken
# effect yet. With BatchMode=no after -b, the connection is made with the default
# BatchMode=yes, which suppresses password and askpass prompting entirely, and the
# upload dies with "Permission denied" on a password that is perfectly correct.
# Put -o first and the option is applied before anything connects.
$ask = Join-Path $env:TEMP 'opencode\ad-askpass.cmd'
$sshArgs = @('-o', 'StrictHostKeyChecking=accept-new')
if ($useKey) {
  # BatchMode=yes, so a key that is not yet registered fails immediately with a
  # permission error instead of silently falling back to prompting for a
  # password that nothing is there to answer.
  $sshArgs += @('-i', $IdentityFile, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes')
} else {
  Set-Content -LiteralPath $ask -Encoding ASCII -Value @(
    '@echo off',
    "type `"$PasswordFile`""
  )
  $env:SSH_ASKPASS = $ask
  $env:SSH_ASKPASS_REQUIRE = 'force'
  $env:DISPLAY = 'alwaysdata'
  $sshArgs += @('-o', 'BatchMode=no')
}
$sshArgs += @('-b', $batch)

try {
  & sftp @sshArgs $Remote
  $code = $LASTEXITCODE
} finally {
  # The password is on disk for as short a time as possible.
  Remove-Item -LiteralPath $PasswordFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $ask -Force -ErrorAction SilentlyContinue
  Remove-Item Env:\SSH_ASKPASS, Env:\SSH_ASKPASS_REQUIRE, Env:\DISPLAY -ErrorAction SilentlyContinue
}

if ($code -ne 0) { throw "sftp failed (exit $code)" }
Write-Host 'Upload finished.' -ForegroundColor Green
