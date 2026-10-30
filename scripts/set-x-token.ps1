# Set up the Brand tile's hourly counts (docs/PLAN.md, Stage 9a).
#
# Asks for the X Bearer token without showing it, proves it works with one real
# lookup, makes BRAND_CRON_SECRET, writes both to .env.local (gitignored) and
# Vercel production, then puts supabase/brand.sql plus the Vault secrets on the
# clipboard for the Supabase SQL editor. Secrets are never printed; only lengths.
#
#   pwsh -File scripts/set-x-token.ps1
#   pwsh -File scripts/set-x-token.ps1 -Handle someoneelse -LocalOnly

param(
  [string]$Handle = 'darioguariglia',
  [string]$CollectUrl = 'https://pulse-ochre-zeta-49.vercel.app/api/brand/collect',
  [switch]$LocalOnly
)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = "$HOME\Documents\WindowsPowerShell\Modules;$env:ProgramFiles\WindowsPowerShell\Modules;$PSHOME\Modules"

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env.local'

$secure = Read-Host -AsSecureString 'Paste your X Bearer token (each character shows as *), then press Enter'
$token = [System.Net.NetworkCredential]::new('', $secure).Password
$secure = $null

if ($token -match '\s') { Write-Error 'The token contains spaces or line breaks. Copy it again.'; exit 1 }
if ($token.Length -lt 40) { Write-Error "That is too short for a Bearer token (length $($token.Length)). Copy it again."; exit 1 }

# One real lookup, so a wrong token fails here and not silently every hour.
try {
  $me = Invoke-RestMethod -Uri "https://api.x.com/2/users/by/username/$($Handle)?user.fields=public_metrics" -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 20
} catch {
  $status = $_.Exception.Response.StatusCode.value__
  Write-Error "X refused the token (HTTP $status, token length $($token.Length)). 401 means a wrong token, 402 or 403 usually means no credit on the account. Nothing was saved."
  exit 1
}
if ($null -eq $me.data.public_metrics.followers_count) { Write-Error 'X answered without a follower count. Nothing was saved.'; exit 1 }
Write-Host "X answered: @$($me.data.username) has $($me.data.public_metrics.followers_count) followers."

# Keep an existing secret, so a re-run does not have to change Vault and Vercel.
$lines = @()
if (Test-Path $envFile) { $lines = @(Get-Content $envFile) }
$existing = $lines | Where-Object { $_ -match '^BRAND_CRON_SECRET=' } | Select-Object -First 1
if ($existing) {
  $secret = $existing.Substring('BRAND_CRON_SECRET='.Length)
} else {
  $bytes = [byte[]]::new(32)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $secret = [Convert]::ToHexString($bytes).ToLower()
}

# Replace the lines, write a temp file, then move it over the original.
$lines = @($lines | Where-Object { $_ -notmatch '^(X_BEARER_TOKEN|BRAND_CRON_SECRET)=' })
$lines += "X_BEARER_TOKEN=$token"
$lines += "BRAND_CRON_SECRET=$secret"
$tmp = "$envFile.tmp"
Set-Content -Path $tmp -Value $lines -Encoding utf8NoBOM
Move-Item -Force $tmp $envFile
Write-Host "Saved to .env.local (token length $($token.Length), secret length $($secret.Length))."

if (-not $LocalOnly) {
  Push-Location $root
  try {
    # Never remove a production value here: a remove followed by a failed add
    # would leave production without it. Add only when none exists yet.
    $listing = vercel env list production 2>$null | Out-String
    if ($LASTEXITCODE -ne 0) { Write-Error 'Could not read the Vercel variables (not logged in, or the folder is not linked). Vercel was not changed.'; exit 1 }
    foreach ($pair in @(@('X_BEARER_TOKEN', $token), @('BRAND_CRON_SECRET', $secret))) {
      if ($listing -match "(?m)^\s*$($pair[0])\s") {
        Write-Host "Vercel production already has $($pair[0]), so it was left as it is. To replace it: Vercel > pulse > Settings > Environment Variables."
      } else {
        $pair[1] | vercel env add $pair[0] production | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Error "vercel env add failed for $($pair[0]). Nothing was removed."; exit 1 }
        Write-Host "Added $($pair[0]) to Vercel production."
      }
    }
  } finally { Pop-Location }
}

# The whole setup as one paste: the table, the hourly job, and the Vault secrets.
$sql = (Get-Content -Raw (Join-Path $root 'supabase/brand.sql')) + @"

delete from vault.secrets where name in ('brand_cron_secret', 'brand_collect_url');
select vault.create_secret('$secret', 'brand_cron_secret');
select vault.create_secret('$CollectUrl', 'brand_collect_url');
"@
Set-Clipboard -Value $sql
Write-Host ''
Write-Host 'The SQL is on your clipboard. Go to supabase.com > your project > SQL Editor > New query, paste it, and press Run.'
Read-Host 'After Run shows success, come back here and press Enter (this clears the clipboard, because it holds the secret)' | Out-Null
Set-Clipboard -Value ' '
Write-Host 'Clipboard cleared. Done.'
$token = $null; $secret = $null; $sql = $null
