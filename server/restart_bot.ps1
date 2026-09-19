# Restart only the training bot (server+brain+client keep running).
# Picks up new bot.js without losing brain weights or the world.
# Run from the server folder.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$pidsFile = "$root/server/.pids"
$parts = @()
if (Test-Path $pidsFile) { $parts = (Get-Content $pidsFile).Split(' ') }
while ($parts.Count -lt 3) { $parts += '' }
if ($parts[2] -ne '') {
  try {
    Stop-Process -Id $parts[2] -Force -ErrorAction Stop
    Write-Host "stopped old bot pid=$($parts[2])"
  } catch { Write-Host 'old bot already gone' }
}
Start-Sleep -Seconds 3
$botp = Start-Process -FilePath 'node' -ArgumentList 'bot.js', '--episodes', '200' `
  -WorkingDirectory "$root/bot" -PassThru `
  -RedirectStandardOutput "$root/bot/bot.log" `
  -RedirectStandardError "$root/bot/bot.err.log"
Write-Host "bot restarted pid=$($botp.Id) (fresh episode count, brain weights kept)"
$parts[2] = $botp.Id
($parts -join ' ') | Set-Content $pidsFile
