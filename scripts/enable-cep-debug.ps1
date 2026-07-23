# Enable Adobe CEP PlayerDebugMode so unsigned extensions load.
$ErrorActionPreference = 'Stop'
foreach ($v in 9..12) {
  $key = "HKCU:\Software\Adobe\CSXS.$v"
  if (-not (Test-Path $key)) {
    New-Item -Path $key -Force | Out-Null
  }
  New-ItemProperty -Path $key -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
  Write-Host "CSXS.$v PlayerDebugMode=1"
}
Write-Host "Done. Restart After Effects."
