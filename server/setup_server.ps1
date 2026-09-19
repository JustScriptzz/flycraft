# Downloads the vanilla 1.21.4 server, accepts the EULA, writes config.
# Run once from this folder:  powershell -ExecutionPolicy Bypass -File setup_server.ps1
$ErrorActionPreference = 'Stop'

if (-not (Test-Path 'server.jar')) {
  Write-Host '[server] resolving 1.21.4 download URL...'
  $manifest = Invoke-RestMethod 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
  $v = $manifest.versions | Where-Object { $_.id -eq '1.21.4' }
  $meta = Invoke-RestMethod $v.url
  $url = $meta.downloads.server.url
  Write-Host "[server] downloading (~50 MB)..."
  Invoke-WebRequest -Uri $url -OutFile 'server.jar'
}
if (-not (Test-Path 'eula.txt')) { Set-Content 'eula.txt' 'eula=true' }

$props = @"
server-port=25565
online-mode=false
enable-rcon=true
rcon.port=25575
rcon.password=flyrcon1
difficulty=peaceful
gamemode=survival
spawn-protection=0
view-distance=8
simulation-distance=6
max-players=8
motd=FlyCraft training arena
level-seed=flycraft1337
"@
Set-Content 'server.properties' $props
Write-Host '[server] ready. Start with:  powershell -File start_server.ps1'
Write-Host '[server] RCON password is flyrcon1 (override in bot via $env:RCON_PASSWORD)'
