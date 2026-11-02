# Store the Google Health (Fitbit) OAuth keys for Pulse's watch connection.
#
# Asks for the client ID and client secret without showing them, checks their
# shape, and writes them to .env.local (gitignored). It also writes the local
# redirect URI and makes a random state-signing secret if none exists yet.
# Nothing secret is printed; only lengths are.
#
#   pwsh -File scripts/set-googlehealth-keys.ps1

param([string]$EnvFile)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = "$HOME\Documents\WindowsPowerShell\Modules;$env:ProgramFiles\WindowsPowerShell\Modules;$PSHOME\Modules"

# Return $Lines with every line for the given names removed, then the new ones appended.
function Set-EnvLines([string[]]$Lines, [hashtable]$Values) {
  $names = $Values.Keys -join '|'
  $kept = @($Lines | Where-Object { $_ -notmatch "^($names)=" })
  foreach ($k in $Values.Keys) { $kept += "$k=$($Values[$k])" }
  return $kept
}

# Return an error message for a bad value, or $null when it looks right.
function Test-GoogleShape([string]$Id, [string]$Secret) {
  if ($Id -match '\s' -or $Secret -match '\s') { return 'A value contains spaces or line breaks. Copy it again.' }
  if (-not $Id.EndsWith('.apps.googleusercontent.com')) { return "The client ID should end with .apps.googleusercontent.com. Length was $($Id.Length)." }
  if (-not $Secret.StartsWith('GOCSPX-')) { return "The client secret should start with GOCSPX-. Length was $($Secret.Length)." }
  return $null
}

# Dot-sourcing (for tests) only defines the functions above.
if ($MyInvocation.InvocationName -eq '.') { return }

if (-not $EnvFile) { $EnvFile = Join-Path (Split-Path -Parent $PSScriptRoot) '.env.local' }

$s1 = Read-Host -AsSecureString 'Paste the Google CLIENT ID (nothing shows while you paste), then press Enter'
$id = [System.Net.NetworkCredential]::new('', $s1).Password
$s2 = Read-Host -AsSecureString 'Paste the Google CLIENT SECRET (nothing shows while you paste), then press Enter'
$secret = [System.Net.NetworkCredential]::new('', $s2).Password
$s1 = $null; $s2 = $null

$err = Test-GoogleShape $id $secret
if ($err) { Write-Error $err; exit 1 }

$lines = @()
if (Test-Path $EnvFile) { $lines = @(Get-Content $EnvFile) }

$values = [ordered]@{
  GOOGLEHEALTH_CLIENT_ID     = $id
  GOOGLEHEALTH_CLIENT_SECRET = $secret
  GOOGLEHEALTH_REDIRECT_URI  = 'http://localhost:3005/api/googlehealth/callback'
}
# Keep an existing state secret: replacing it would only break a sign-in in flight.
if (-not ($lines | Where-Object { $_ -match '^GOOGLEHEALTH_STATE_SECRET=.+' })) {
  $bytes = New-Object byte[] 36
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $values['GOOGLEHEALTH_STATE_SECRET'] = [Convert]::ToBase64String($bytes)
}

# Write a temp file, then move it over the original, so a crash cannot truncate .env.local.
$out = Set-EnvLines $lines $values
$tmp = "$EnvFile.tmp"
Set-Content -Path $tmp -Value $out -Encoding utf8NoBOM
Move-Item -Force $tmp $EnvFile
Write-Host "Saved to $(Split-Path -Leaf $EnvFile): client ID length $($id.Length), client secret length $($secret.Length)."
$id = $null; $secret = $null
