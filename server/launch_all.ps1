# Full launch: training stack + op watchdog + dev game client with the HUD mod.
# Everything runs in the background; the game window opens when ready
# (first launch downloads game assets, takes several minutes).
# Run from the server folder. Stop with stop_all.ps1.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot

Write-Host '[launch] closing any stale game client...'
$vms = Get-CimInstance Win32_Process -Filter "Name = 'java.exe'"
foreach ($vm in $vms) {
  $cl = $vm.CommandLine
  if ($null -eq $cl) { continue }
  if ($cl -like '*server.jar*') { continue }
  if ($cl -like '*GradleDaemon*') { continue }
  if ($cl -like '*fabric*') {
    Write-Host "[launch] killing stale game client pid=$($vm.ProcessId)"
    Stop-Process -Id $vm.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

Write-Host '[launch] starting server...'
$srv = Start-Process -FilePath 'java' `
  -ArgumentList '-Xmx2G', '-Xms1G', '-jar', 'server.jar', 'nogui' `
  -WorkingDirectory "$root/server" -PassThru
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 5
  if ((Test-Path "$root/server/logs/latest.log") -and
      (Select-String -Path "$root/server/logs/latest.log" -Pattern 'Done \(' -Quiet)) { break }
}

Write-Host '[launch] starting brain...'
$brn = Start-Process -FilePath 'python' -ArgumentList 'serve.py' `
  -WorkingDirectory "$root/brain" -PassThru `
  -RedirectStandardOutput "$root/brain/brain.log" `
  -RedirectStandardError "$root/brain/brain.err.log"

Write-Host '[launch] starting bot (200 episodes)...'
$botp = Start-Process -FilePath 'node' -ArgumentList 'bot.js', '--episodes', '200' `
  -WorkingDirectory "$root/bot" -PassThru `
  -RedirectStandardOutput "$root/bot/bot.log" `
  -RedirectStandardError "$root/bot/bot.err.log"

Write-Host '[launch] starting op watchdog...'
$opw = Start-Process -FilePath 'node' -ArgumentList 'op_watchdog.mjs' `
  -WorkingDirectory "$root/bot" -PassThru `
  -RedirectStandardOutput "$root/bot/op.log" `
  -RedirectStandardError "$root/bot/op.err.log"

Write-Host '[launch] starting game client (assets download on first run)...'
$cli = Start-Process -FilePath "$root/mod/gradlew.bat" -ArgumentList 'runClient' `
  -WorkingDirectory "$root/mod" -PassThru `
  -RedirectStandardOutput "$root/mod/runclient.log"

Write-Host ''
Write-Host 'All processes launched:'
Write-Host "  server pid=$($srv.Id)  brain pid=$($brn.Id)  bot pid=$($botp.Id)  opwatch pid=$($opw.Id)"
Write-Host '  game client is starting (watch mod/runclient.log, window opens in a few minutes)'
Write-Host '  in game: Multiplayer -> Add Server -> localhost -> Join, then /spectate Drosobot'
"$($srv.Id) $($brn.Id) $($botp.Id) $($opw.Id)" | Set-Content "$root/server/.pids"
