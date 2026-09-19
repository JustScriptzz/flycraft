# Creates GitHub Release v1.0.0 with both portable jars attached.
# Usage: powershell -ExecutionPolicy Bypass -File release.ps1 -Token ghp_XXX
param([string]$Token, [string]$Repo = 'JustScriptzz/flycraft', [string]$Tag = 'v1.0.0')
$ErrorActionPreference = 'Stop'
$h = @{ Authorization = "token $Token"; Accept = 'application/vnd.github+json' }
$body = @'
FlyCraft HUD 1.0.0 — live brain overlay + /fly commands, one portable jar per version (Fabric API embedded, zero extra downloads).

flycraft-hud-1.0.0+1.21.4.jar — Minecraft 1.21.4, Java 21
flycraft-hud-1.0.0+1.20.1.jar — Minecraft 1.20.1, Java 17

Needs Fabric Loader 0.19.5. Standalone it installs its own brain (Python 3.10+ once) and shows IDLE activity; with the trainer it shows LIVE thought.
'@
$rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases" -Method Post -Headers $h -Body (@{ tag_name = $Tag; name = 'FlyCraft HUD 1.0.0'; body = $body; draft = $false; prerelease = $false } | ConvertTo-Json)
$up = $rel.upload_url -replace '\{\?.*\}', ''
foreach ($jar in @(
  "$PSScriptRoot/mod/build/libs/flycraft-hud-1.0.0+1.21.4.jar",
  "$PSScriptRoot/mod-1.20.1/build/libs/flycraft-hud-1.0.0+1.20.1.jar")) {
  $name = Split-Path $jar -Leaf
  Write-Host "uploading $name..."
  Invoke-RestMethod -Uri "$up?name=$name" -Method Post -Headers @{ Authorization = "token $Token"; 'Content-Type' = 'application/java-archive' } -InFile $jar | Out-Null
}
Write-Host "release done"
