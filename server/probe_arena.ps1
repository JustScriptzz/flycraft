# Probe: boot server, run arena diagnostics, shut down. Run from server folder.
$ErrorActionPreference = 'Stop'
$srv = Start-Process -FilePath 'java' `
  -ArgumentList '-Xmx2G', '-Xms1G', '-jar', 'server.jar', 'nogui' -PassThru
try {
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 5
    if ((Test-Path 'logs/latest.log') -and
        (Select-String -Path 'logs/latest.log' -Pattern 'Done \(' -Quiet)) { break }
  }
  node ../bot/probe_arena.mjs
} finally {
  node ../bot/rcon_test.mjs 'stop'
  $srv | Wait-Process -Timeout 60 -ErrorAction SilentlyContinue
}
