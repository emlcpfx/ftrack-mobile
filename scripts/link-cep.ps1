# Junction ae-panel into the per-user Adobe CEP extensions folder.
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$src = Join-Path $repo 'ae-panel'
$destDir = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$dest = Join-Path $destDir 'com.cleanplatefx.ftrack'

if (-not (Test-Path $src)) {
  throw "Missing ae-panel at $src"
}

New-Item -ItemType Directory -Force -Path $destDir | Out-Null

if (Test-Path $dest) {
  $item = Get-Item $dest -Force
  if ($item.LinkType -eq 'Junction' -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    cmd /c "rmdir `"$dest`""
  } else {
    throw "Destination exists and is not a junction: $dest - remove it manually"
  }
}

cmd /c "mklink /J `"$dest`" `"$src`""
if ($LASTEXITCODE -ne 0) { throw "mklink failed" }

Write-Host "Linked:"
Write-Host "  $dest"
Write-Host "  -> $src"
Write-Host "Build with: npm run build:cep"
Write-Host "Then restart AE -> Window -> Extensions (Legacy) -> ftrack panel"
