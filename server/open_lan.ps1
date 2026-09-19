# Opens the LAN so friends on the same Wi-Fi can join.
# RUN AS ADMINISTRATOR (right-click -> Run as Administrator).
# Then friends join with <your-LAN-IP>:25565 (addresses printed below).
$ErrorActionPreference = 'Continue'
try {
  New-NetFirewallRule -DisplayName 'FlyCraft Minecraft (25565)' -Direction Inbound -Protocol TCP -LocalPort 25575, 25565 -Action Allow -ErrorAction Stop | Out-Null
  Write-Host 'Firewall open.'
} catch {
  Write-Host 'Could not set firewall rule (run as Administrator to fix). IPs anyway:'
}
Write-Host 'Firewall open. Your LAN addresses:'
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  ForEach-Object { Write-Host "  $($_.IPAddress):25565 ($($_.InterfaceAlias))" }
Write-Host 'Server is offline-mode: any username works, but everyone needs a DISTINCT name.'
Write-Host 'Guests: !watch to spectate the brain. Host: /deop <name> after they arrive to keep them off OP.'
