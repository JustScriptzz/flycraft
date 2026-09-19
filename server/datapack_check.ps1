# Datapack check: verifies the vanilla HUD (datapack loaded, bossbar values
# flowing, trigger objectives present) mid-training. Run from the server
# folder WHILE e2e_test is running (separate call).
$ErrorActionPreference = 'Continue'
Start-Sleep -Seconds 80
node ../bot/rcon_test.mjs 'datapack list'
node ../bot/rcon_test.mjs 'bossbar get fly:kc value'
node ../bot/rcon_test.mjs 'scoreboard objectives list'
