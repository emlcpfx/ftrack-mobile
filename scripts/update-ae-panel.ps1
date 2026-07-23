# Pull latest ftrack-mobile and deploy the After Effects CEP panel.
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File scripts/update-ae-panel.ps1
# Or double-click: update-ae-panel.cmd

$ErrorActionPreference = 'Stop'

$repo = Split-Path $PSScriptRoot -Parent
Set-Location $repo

function Assert-Cmd($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $name"
  }
}

Write-Host ""
Write-Host "=== ftrack panel update ===" -ForegroundColor Cyan
Write-Host "Repo: $repo"
Write-Host ""

Assert-Cmd git
Assert-Cmd npm
Assert-Cmd node

# --- git pull ---
Write-Host "[1/5] git pull..." -ForegroundColor Yellow
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if (-not $branch) { throw "Not a git repo / no branch" }

git fetch origin
$behind = 0
try {
  $behind = [int](git rev-list --count "HEAD..origin/$branch" 2>$null)
} catch {
  $behind = 0
}

git pull --ff-only origin $branch
if ($LASTEXITCODE -ne 0) {
  Write-Host "Fast-forward failed. Trying merge pull..." -ForegroundColor DarkYellow
  git pull origin $branch
  if ($LASTEXITCODE -ne 0) { throw "git pull failed - resolve conflicts then re-run" }
}

$version = 'unknown'
try {
  $pkg = Get-Content (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json
  $version = $pkg.version
} catch {}

Write-Host "      on $branch @ v$version"
Write-Host ""

# --- deps ---
Write-Host "[2/5] npm install..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
Write-Host ""

# --- CEP debug mode (unsigned extensions) ---
Write-Host "[3/5] PlayerDebugMode..." -ForegroundColor Yellow
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'enable-cep-debug.ps1')
if ($LASTEXITCODE -ne 0) { throw "enable-cep-debug failed" }
Write-Host ""

# --- junction ---
Write-Host "[4/5] CEP extension link..." -ForegroundColor Yellow
$src = Join-Path $repo 'ae-panel'
$destDir = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$dest = Join-Path $destDir 'com.cleanplatefx.ftrack'

New-Item -ItemType Directory -Force -Path $destDir | Out-Null

$needsLink = $true
if (Test-Path $dest) {
  $item = Get-Item $dest -Force
  $isJunction = ($item.LinkType -eq 'Junction') -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
  if ($isJunction) {
    # Already linked - refresh if target drifted
    $target = $null
    try { $target = $item.Target } catch {}
    if ($target -and ($target -eq $src -or $target -contains $src)) {
      Write-Host "      already linked -> $src"
      $needsLink = $false
    } else {
      Write-Host "      refreshing junction..."
      cmd /c "rmdir `"$dest`""
    }
  } else {
    throw "Destination exists and is not a junction: $dest - remove it manually"
  }
}

if ($needsLink) {
  cmd /c "mklink /J `"$dest`" `"$src`""
  if ($LASTEXITCODE -ne 0) { throw "mklink failed" }
  Write-Host "      linked $dest"
  Write-Host "           -> $src"
}
Write-Host ""

# --- build ---
Write-Host "[5/5] build:cep..." -ForegroundColor Yellow
npm run build:cep
if ($LASTEXITCODE -ne 0) { throw "build:cep failed" }

$www = Join-Path $src 'www\index.html'
if (-not (Test-Path $www)) {
  throw "Build succeeded but missing $www"
}

Write-Host ""
Write-Host "=== Done: ftrack panel v$version ===" -ForegroundColor Green
Write-Host "Reopen the panel in AE (or restart AE):"
Write-Host "  Window -> Extensions (Legacy) -> ftrack panel"
Write-Host ""
