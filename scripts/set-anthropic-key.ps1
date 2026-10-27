# Store the Anthropic API key for Pulse's AI board builder (docs/PLAN.md, Stage 5).
#
# Asks for the key without showing it, checks its shape, writes it to .env.local
# (gitignored) and, unless -LocalOnly is passed, adds it to Vercel production.
# The key is never printed; only its length is.
#
#   pwsh -File scripts/set-anthropic-key.ps1
#   pwsh -File scripts/set-anthropic-key.ps1 -LocalOnly

param([switch]$LocalOnly)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = "$HOME\Documents\WindowsPowerShell\Modules;$env:ProgramFiles\WindowsPowerShell\Modules;$PSHOME\Modules"

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env.local'

$secure = Read-Host -AsSecureString 'Paste your Anthropic key (nothing shows while you paste), then press Enter'
$key = [System.Net.NetworkCredential]::new('', $secure).Password
$secure = $null

if ($key -match '\s') { Write-Error 'The key contains spaces or line breaks. Copy it again.'; exit 1 }
if (-not $key.StartsWith('sk-ant-')) { Write-Error "That does not look like an Anthropic key (it should start with sk-ant-). Length was $($key.Length)."; exit 1 }

# Replace an existing line, or append one. Write a temp file, then move it over the original.
$lines = @()
if (Test-Path $envFile) { $lines = @(Get-Content $envFile | Where-Object { $_ -notmatch '^ANTHROPIC_API_KEY=' }) }
$lines += "ANTHROPIC_API_KEY=$key"
$tmp = "$envFile.tmp"
Set-Content -Path $tmp -Value $lines -Encoding utf8NoBOM
Move-Item -Force $tmp $envFile
Write-Host "Saved to .env.local (length $($key.Length))."

if (-not $LocalOnly) {
  Push-Location $root
  try {
    # Never remove a production key here: a remove followed by a failed add would
    # leave production with no key at all. Add only when none exists yet.
    $listing = vercel env list production 2>$null | Out-String
    if ($LASTEXITCODE -ne 0) { Write-Error 'Could not read the Vercel variables (not logged in, or the folder is not linked). Vercel was not changed.'; exit 1 }
    if ($listing -match '(?m)^\s*ANTHROPIC_API_KEY\s') {
      Write-Host 'Vercel production already has ANTHROPIC_API_KEY, so it was left as it is.'
      Write-Host 'To replace it: Vercel > pulse > Settings > Environment Variables > ANTHROPIC_API_KEY > Edit.'
    } else {
      $key | vercel env add ANTHROPIC_API_KEY production | Out-Null
      if ($LASTEXITCODE -ne 0) { Write-Error 'vercel env add failed. Nothing was removed. Add the key in Vercel > Settings > Environment Variables.'; exit 1 }
      Write-Host 'Added to Vercel production. It takes effect on the next deploy.'
    }
  } finally { Pop-Location }
}
$key = $null
