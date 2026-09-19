# FlyCraft HUD — Modrinth release notes (paste into the project/version pages)

## Title
FlyCraft HUD

## Short description
Live in-game overlay of a drosophila-inspired spiking brain learning to play
Minecraft: per-region firing rates, current action, task, reward, dopamine.

## Long description (paste as body)
This is the in-game display for **FlyCraft** — a spiking neural network wired
like a fruit fly (optic lobe → mushroom body → central complex → motor
neurons) embodied as a Minecraft bot and trained with dopamine-style reward
plasticity to chop trees and reach beacons.

The overlay renders top-right, live:
- firing bars for lamina, medulla, lobula, Kenyon cells, MBONs,
  approach/avoid, compass, giant fiber
- current task (chop / beacon), action, reward, episode, log count
- live dopamine readout (`rpe` = reward-prediction error)

It also adds real slash commands that drive the trainer:
`/fly train 50`, `/fly stop`, `/fly status`, `/fly dope [amount]`,
`/fly task chop`, `/fly watch`, `/fly summon [name]`, `/fly play`, `/fly lan`
(opens LAN: firewall rule if admin, else prints your join address) (plus vanilla
`/trigger fly set <code>` variants that need no OP).

**Standalone**, the mod installs its own brain next to the game on first
launch (needs Python 3.10+ and internet once for two tiny packages) and shows
its spontaneous activity, honestly labeled **[IDLE]**. Pair it with the
open-source FlyCraft stack (server + Python brain + Mineflayer bot) and the
same overlay flips to **[LIVE]** thought during real training. No telemetry,
no tracking, MIT licensed.

## Project settings on Modrinth
- Loaders: **Fabric** only
- Game versions: **1.21.4**
- Environment: **Client only**
- Dependencies: none extra — Fabric API is embedded inside the jar
  (needs only Fabric Loader ≥ 0.19.5 on the target machine)
- License: **MIT**
- Icon: upload `mod/icon.png` as the project icon
- File to upload: `mod/build/libs/flycraft-hud-1.0.0.jar`
  (NOT the `-sources.jar`)

## Upload steps
1. Log in to Modrinth → **New project** → **Mod**.
2. Upload `flycraft-hud-1.0.0.jar`, set loader = Fabric, game version = 1.21.4,
   environment = Client.
3. Paste the texts above, upload `icon.png` as icon, license = MIT.
4. Submit for review (usually approved within a day). No dependency to
   declare — the API ships inside the jar.
