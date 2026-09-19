# Downloads Temurin 25 JDK (~210 MB) for building the 26.2 mod.
# The game itself also needs Java 25+. Run once from the flycraft folder.
$ErrorActionPreference = 'Stop'
$dest = Join-Path $PSScriptRoot '.jdk25'
if (Test-Path "$dest/bin/java.exe") {
  Write-Host '[jdk] already present.'
  & "$dest/bin/java.exe" -version
  return
}
$zip = Join-Path ([IO.Path]::GetTempPath()) 'temurin25.zip'
Write-Host '[jdk] downloading Temurin 25 (~210 MB)...'
Invoke-WebRequest -Uri 'https://api.adoptium.net/v3/binary/latest/25/ga/windows/x64/jdk/hotspot/normal/eclipse' -OutFile $zip
Write-Host '[jdk] extracting...'
New-Item -ItemType Directory -Path "$dest-tmp" -Force | Out-Null
Expand-Archive -Path $zip -DestinationPath "$dest-tmp" -Force
$inner = Get-ChildItem "$dest-tmp" -Directory | Select-Object -First 1
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Copy-Item "$($inner.FullName)/*" -Destination $dest -Recurse -Force
Remove-Item "$dest-tmp" -Recurse -Force
Remove-Item $zip -Force
& "$dest/bin/java.exe" -version
Write-Host "[jdk] ready at $dest"
