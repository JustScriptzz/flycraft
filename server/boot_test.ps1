# Boot test: starts the server, waits for "Done", probes RCON, stops it.
$ErrorActionPreference = 'Stop'
$proc = Start-Process -FilePath 'java' `
  -ArgumentList '-Xmx2G', '-Xms1G', '-jar', 'server.jar', 'nogui' -PassThru
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 5
  if ((Test-Path 'logs/latest.log') -and
      (Select-String -Path 'logs/latest.log' -Pattern 'Done \(' -Quiet)) {
    $ok = $true
    break
  }
}
Write-Host "booted=$ok"
node ../bot/rcon_test.mjs 'list'
node ../bot/rcon_test.mjs 'stop'
$proc | Wait-Process -Timeout 60
Write-Host "exit=$($proc.ExitCode)"
