# FlyCraft — a fly-brain learning to play Minecraft

A spiking neural network wired like a fruit fly (optic lobe → mushroom body →
central complex → descending motor neurons) embodied as a Minecraft bot, **trained**
with dopamine-style reward plasticity to chop trees and collect wood. A Fabric
client mod renders its live nervous-system activity as an in-game HUD.

```
            +------------------+   ws://127.0.0.1:8765   +------------------+
            |  brain/serve.py  |<------------------------|  bot/bot.js      |
            |  FlyBrain (LIF)  |   obs+reward / action   |  Mineflayer body |
            |  dopamine RPE    |------------------------>|  sense/act/train |
            +--------+---------+                         +--------+---------+
                     | broadcast @10Hz                            | RCON
                     v                                            v
            +--------+---------+                         +--------+---------+
            |  mod/ HUD (your  |                         | server/ Paper or |
            |  game client)    |                         | vanilla 1.21.4   |
            +------------------+                         +------------------+
```

## What "training" means here

No scripts, no waypoints. The mushroom-body layer (600 Kenyon cells, sparse
~5% coding like the real thing) projects to approach/avoid MBONs through
**plastic synapses**. A dopamine-like reward-prediction-error signal gates
plasticity (3-factor rule), so rewarded pathways get stronger. Epsilon-greedy
exploration decays per episode. Weights persist in `brain/weights.npz`.

Tasks: **chop** (collect 5 logs), **beacon** (reach the pillar, +2),
**craft** (wooden pickaxe: +0.05 per planks/sticks, +2 pickaxe).
**craft** (wooden pickaxe: +0.05 per planks/sticks, +2 pickaxe).
Dopamine (reward): +1 per log broken, +0.05 per pickup, approach shaping,
+2 goal/arrival bonus. Punishment (signals it doesn't like): −0.3 for
digging the wrong block (−1.0 for arena glass, −0.1 leaves), −0.01 per
mine-swing at nothing, −0.02 for roaming past 25 blocks, −0.002 per step,
−1 for falling/dying. Watch the live dopamine (reward-prediction error)
as `rpe` in both UIs.

## Train (one command)

```powershell
cd flycraft/server
powershell -ExecutionPolicy Bypass -File train.ps1 -Episodes 200
```

Starts the server + brain in the background if needed (reuses them if already
up) and trains in the foreground. Episodes alternate two tasks: **chop**
(collect 5 logs from the tree) and **beacon** (reach the glowing pillar).
The current task rides along in the brain input, the CSV, and both UIs
(browser dashboard + in-game HUD are both compact now).

## Friends on the same Wi-Fi (no mods needed on their side)

1. On the host: right-click `server/open_lan.ps1` → Run as Administrator
   (opens the firewall, prints your LAN IP).
2. Friends join `<your-LAN-IP>:25565`. Offline-mode server: any username
   works, but names must be DISTINCT (duplicates kick each other).
3. They get auto-opped on join (for `/watch` spectating); de-op them after
   with `/deop <name>` so they can't grief the arena. Set `OPWATCH_ALLOW`
   (comma-separated names) on the next backend restart to only ever auto-op
   those. Set `COMMANDERS` to gate who can run training commands.
4. Up to 8 players total (bot takes one slot). More players = more load on
   an already busy machine; close the 3D viewer tab if it stutters.
5. Friends across the internet: easiest is playit.gg (TCP tunnel, free tier)
   pointed at 127.0.0.1:25565 — no router changes. Alternative: forward
   port 25565 in your router to this PC.

## Control training in game

Real `/` commands (vanilla `/trigger`, no OP needed; the bot polls them over
RCON). Set `flyArg` first when a value is needed:

| command | effect |
|---|---|
| `/trigger fly set 1` | status (episode, task, reward, brain eps) |
| `/trigger fly set 2` | pause after this episode |
| `/trigger flyArg set 50` then `/trigger fly set 3` | train 50 more episodes |
| `/trigger flyArg set 1` then `/trigger fly set 4` | lock task (0=both, 1=chop, 2=beacon) |
| `/trigger fly set 5` | spectate the bot (needs OP — auto-granted by op watchdog) |
| `/trigger fly set 6` | back to survival |
| `/trigger fly set 7` | help |
| `/trigger fly set 8` | spawn a pet fly at your side (training bot undisturbed) |
| `/trigger fly set 9` | dopamine pulse +1 right now (watch it flare) |
| `/trigger flyArg set 20` then `/trigger fly set 10` | dopamine dial x2.0 (arg/10, 0–10) |

`!`-chat versions (`!train 50`, `!stop`, `!status`, …) do the same thing.
With the HUD mod loaded you also get real slash commands: `/fly train 50`,
`/fly stop`, `/fly status`, `/fly task chop`, `/fly watch`, `/fly play`.
Set the `COMMANDERS` env var on the bot to a comma-separated allowlist to
restrict who can control it. The bot announces goals, arrivals, starts and
stops in chat.

## Run order (3 terminals, manual alternative)

```powershell
# 1. server (downloads vanilla 1.21.4 jar once, ~50 MB)
cd flycraft/server
powershell -ExecutionPolicy Bypass -File setup_server.ps1
powershell -File start_server.ps1

# 2. brain
cd flycraft/brain
pip install -r requirements.txt
python serve.py

# 3. bot (trains headless — no game purchase needed for this part)
cd flycraft/bot
npm install
node bot.js --episodes 200
```

Learning curves land in `brain/logs/training.csv` (episode, ticks, logs, reward).

## Watch it train (no game purchase needed)

The bot streams a live first-person 3D view and the brain serves a neural
dashboard. With all three processes running, open:

- **http://127.0.0.1:8766/dashboard.html** — 3D view side-by-side with live
  firing bars per brain region, current action, reward, episode, log count.
- http://127.0.0.1:3007 — fullscreen 3D view.

## Vanilla HUD (datapack, no mods, any client)

The bot auto-installs `datapacks/fly-1.21.4` into the world (1.20.1 variant
included) and mirrors the brain into **bossbars** — one per region — plus an
actionbar status line and GOAL titles. Any vanilla client on any version sees
it; no Fabric, no downloads. `/trigger` commands work through the same
datapack objectives.

## In-game HUD (needs Minecraft: Java Edition + Fabric)

1. Install Fabric Loader 0.19.5 for 1.21.4 + Fabric API.
2. `cd flycraft/mod` → `powershell -ExecutionPolicy Bypass -File setup_mod.ps1`
   (first build downloads Minecraft + deps, takes a few minutes).
3. Drop `build/libs/flycraft-hud-1.0.0.jar` into your `mods` folder.
4. Join the training server (`localhost`, offline mode) and spectate `Drosobot`.
   The top-left panel shows live region firing, current action, reward, episode.

No game purchase? `cd flycraft/server` →
`powershell -ExecutionPolicy Bypass -File launch_all.ps1` starts the whole
stack (server, brain, 200-episode training bot, auto-op watchdog) plus a
developer game client with the mod loaded — no account needed. In game:
Multiplayer → Add Server → `localhost` → Join, then `/spectate Drosobot`.
Stop everything with `stop_all.ps1`.

## Protocol

- bot → brain: `{"type":"step","episode","t","obs":{"sectors":[96],"proprio":[10]},"reward","done","logs"}`
- brain → bot: `{"type":"action","action","state"}`
- brain → hud: `{"type":"brain_state","logs","regions":{lamina,medulla,lobula,kc,mbon,mbon_app,mbon_av,cx,gf},"mbon","action","action_name","eps","rpe","episode","reward_sum"}` @10Hz

Sectors: 8 compass directions × 3 distance rings × (log, leaves, solid, air).
Proprio: `[sinYaw,cosYaw,pitchN,onGround,logsN,proximity,bearSin,bearCos,timeN,speedN]`.
Actions: `noop fwd back left right jump yawL yawR mine`.
