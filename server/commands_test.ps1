# Commands E2E: full stack + training main bot, then a tester bot drives the
# in-game chat commands and asserts replies. Run from the server folder.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$srv = Start-Process -FilePath 'java' `
  -ArgumentList '-Xmx2G', '-Xms1G', '-jar', 'server.jar', 'nogui' `
  -WorkingDirectory "$root/server" -PassThru
try {
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 5
    if ((Test-Path "$root/server/logs/latest.log") -and
        (Select-String -Path "$root/server/logs/latest.log" -Pattern 'Done \(' -Quiet)) { break }
  }
  $brn = Start-Process -FilePath 'python' -ArgumentList 'serve.py' `
    -WorkingDirectory "$root/brain" -PassThru
  Start-Sleep -Seconds 5
  $botp = Start-Process -FilePath 'node' -ArgumentList 'bot.js', '--episodes', '100' `
    -WorkingDirectory "$root/bot" -PassThru
  Write-Host '[test] waiting for main bot to spawn + start training...'
  Start-Sleep -Seconds 60
  node ../bot/test_commands.mjs
  if ($LASTEXITCODE -ne 0) { throw 'test_commands failed' }
  Write-Host '[test] COMMANDS E2E PASSED'
} finally {
  node ../bot/rcon_test.mjs 'stop'
  if ($brn -and -not $brn.HasExited) { Stop-Process -Id $brn.Id -Force }
  if ($botp -and -not $botp.HasExited) { Stop-Process -Id $botp.Id -Force }
  $srv | Wait-Process -Timeout 60 -ErrorAction SilentlyContinue
}
