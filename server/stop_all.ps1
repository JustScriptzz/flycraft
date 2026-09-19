# Stop everything started by launch_all.ps1 (by recorded PID only —
# never touches your other java/python/node processes). Run from server folder.
$pidsFile = Join-Path $PSScriptRoot '.pids'
if (Test-Path $pidsFile) {
  $pids = (Get-Content $pidsFile).Split(' ',
    [System.StringSplitOptions]::RemoveEmptyEntries)
  foreach ($p in $pids) {
    try {
      Stop-Process -Id $p -Force -ErrorAction Stop
      Write-Host "killed $p"
    } catch { Write-Host "pid $p already gone" }
  }
  Remove-Item $pidsFile
} else {
  Write-Host 'no .pids file — nothing to stop'
}
Write-Host 'close the game window yourself if it is open'
