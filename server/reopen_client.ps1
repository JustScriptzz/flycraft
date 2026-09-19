# Restart only the dev game client (picks up mod changes).
# Server+brain+bot keep running. Run from the server folder.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$vms = Get-CimInstance Win32_Process -Filter "Name = 'java.exe'"
foreach ($vm in $vms) {
  $cl = $vm.CommandLine
  if ($null -eq $cl) { continue }
  if ($cl -like '*server.jar*') { continue }
  if ($cl -like '*GradleDaemon*') { continue }
  if ($cl -like '*fabric*') {
    Write-Host "killing game client pid=$($vm.ProcessId)"
    Stop-Process -Id $vm.ProcessId -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Seconds 3
Start-Process -FilePath "$root/mod/gradlew.bat" -ArgumentList 'runClient' `
  -WorkingDirectory "$root/mod" -PassThru `
  -RedirectStandardOutput "$root/mod/runclient.log" | Out-Null
Write-Host 'game client relaunching (window in ~1-2 min, assets cached)'
