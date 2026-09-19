# Fetches the Gradle wrapper from the Fabric example mod (1.20.1 branch),
# syncs shared sources + brain scripts, and builds the portable 1.20.1 mod.
# Run from this folder.
$ErrorActionPreference = 'Stop'
$base = 'https://raw.githubusercontent.com/FabricMC/fabric-example-mod/1.20.1'

New-Item -ItemType Directory -Path 'gradle/wrapper' -Force | Out-Null
foreach ($f in @('gradlew', 'gradlew.bat', 'gradle/wrapper/gradle-wrapper.jar', 'gradle/wrapper/gradle-wrapper.properties')) {
  if (-not (Test-Path $f)) {
    Write-Host "[mod] downloading $f"
    Invoke-WebRequest -Uri "$base/$f" -OutFile $f
  }
}
# Shared with mod/ (identical across versions) + brain scripts for the installer.
New-Item -ItemType Directory -Path 'src/client/java/com/flycraft/hud' -Force | Out-Null
Copy-Item '../mod/src/client/java/com/flycraft/hud/BrainLink.java', '../mod/src/client/java/com/flycraft/hud/BrainInstaller.java', '../mod/src/client/java/com/flycraft/hud/LanOpener.java' -Destination 'src/client/java/com/flycraft/hud/' -Force
New-Item -ItemType Directory -Path 'src/main/resources/brain' -Force | Out-Null
Copy-Item '../brain/flybrain.py', '../brain/serve.py' -Destination 'src/main/resources/brain/' -Force
Write-Host '[mod] building...'
& .\gradlew.bat build
Write-Host '[mod] done. Jar is in build/libs/ - one portable file.'
