# Builds the portable 26.2 mod (needs JDK 25 — see ../setup_jdk25.ps1).
# Run from this folder.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$jdk = "$root/.jdk25"
if (-not (Test-Path "$jdk/bin/java.exe")) {
  throw "JDK 25 missing at $jdk - run ../setup_jdk25.ps1 first"
}
# Gradle wrapper (same loom line as mod/, no download needed).
New-Item -ItemType Directory -Path 'gradle/wrapper' -Force | Out-Null
Copy-Item "$root/mod/gradlew", "$root/mod/gradlew.bat" -Destination '.' -Force
Copy-Item "$root/mod/gradle/wrapper/gradle-wrapper.jar", "$root/mod/gradle/wrapper/gradle-wrapper.properties" -Destination 'gradle/wrapper/' -Force
# Shared + brain sources.
New-Item -ItemType Directory -Path 'src/client/java/com/flycraft/hud' -Force | Out-Null
Copy-Item "$root/mod/src/client/java/com/flycraft/hud/BrainLink.java", "$root/mod/src/client/java/com/flycraft/hud/BrainInstaller.java" -Destination 'src/client/java/com/flycraft/hud/' -Force
New-Item -ItemType Directory -Path 'src/main/resources/brain' -Force | Out-Null
Copy-Item "$root/brain/flybrain.py", "$root/brain/serve.py" -Destination 'src/main/resources/brain/' -Force
Write-Host '[mod] building with JDK 25...'
$env:JAVA_HOME = $jdk
& .\gradlew.bat build
Write-Host '[mod] done. Jar is in build/libs/.'
