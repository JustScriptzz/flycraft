# Fetches the Gradle wrapper from the Fabric example mod and builds the HUD mod.
# First run downloads Minecraft + mappings + deps (several minutes). Run from this folder.
$ErrorActionPreference = 'Stop'
$base = 'https://raw.githubusercontent.com/FabricMC/fabric-example-mod/1.21.4'

New-Item -ItemType Directory -Path 'gradle/wrapper' -Force | Out-Null
foreach ($f in @('gradlew', 'gradlew.bat', 'gradle/wrapper/gradle-wrapper.jar', 'gradle/wrapper/gradle-wrapper.properties')) {
  if (-not (Test-Path $f)) {
    Write-Host "[mod] downloading $f"
    Invoke-WebRequest -Uri "$base/$f" -OutFile $f
  }
}
# Refresh the brain scripts bundled inside the mod jar (re-copy on brain changes).
New-Item -ItemType Directory -Path 'src/main/resources/brain' -Force | Out-Null
Copy-Item '../brain/flybrain.py', '../brain/serve.py' -Destination 'src/main/resources/brain/' -Force
Write-Host '[mod] building...'
& .\gradlew.bat build
Write-Host '[mod] done. Jar is in build/libs/ - drop it into your Fabric 1.21.4 mods folder.'
