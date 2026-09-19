# Watch-path check: verifies the 3D view, dashboard, and live brain broadcast
# mid-training. Run from the server folder WHILE e2e_test is running.
$ErrorActionPreference = 'Continue'
Start-Sleep -Seconds 80
try {
  $v = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3007' -TimeoutSec 10
  Write-Host "viewer HTTP $($v.StatusCode)"
} catch { Write-Host "viewer FAIL: $($_.Exception.Message)" }
try {
  $d = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8766/dashboard.html' -TimeoutSec 10
  Write-Host "dashboard HTTP $($d.StatusCode)"
} catch { Write-Host "dashboard FAIL: $($_.Exception.Message)" }
node ../bot/ws_probe.mjs
