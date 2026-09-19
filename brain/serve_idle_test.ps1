# Idle-mode test: serve with no bot -> spontaneous activity labeled idle.
# Run from the brain folder.
$ErrorActionPreference = 'Continue'
$brn = Start-Process -FilePath 'python' -ArgumentList 'serve.py', '--port', '18765', '--no-dashboard', '--weights', 'idle_test_weights.npz' -PassThru
Start-Sleep -Seconds 12
node ../bot/ws_probe.mjs 18765
if ($brn -and -not $brn.HasExited) { Stop-Process -Id $brn.Id -Force }
Remove-Item 'idle_test_weights.npz' -ErrorAction SilentlyContinue
