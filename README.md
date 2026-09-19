# FlyCraft HUD

Live in-game overlay of a drosophila-inspired spiking brain: per-region firing
rates (optic lobe → mushroom body → central complex → giant fiber), current
task, action, reward, episode, and a live dopamine readout (`rpe`). Plus real
slash commands that drive the trainer.

Three portable Fabric builds (API embedded — one jar, zero extra downloads):

| folder | game version | Java | status |
|---|---|---|---|
| `mod/` | 1.21.4 | 21 | released |
| `mod-1.20.1/` | 1.20.1 | 17 | released |
| `mod-26.2/` | 26.2 | 25 | scaffold — blocked: Mojang hasn't published 26.2 mappings yet |

## Install

1. Fabric Loader (≥ 0.19.5) for your version.
2. Drop the matching jar from **Releases** into `mods/`.
3. Launch. The overlay sits top-right. Standalone it installs its own brain
   next to the game (needs Python 3.10+ and internet once for `numpy` +
   `websockets`) and shows honest **[IDLE]** spontaneous activity; paired
   with the FlyCraft trainer it flips to **[LIVE]** thought.

## Commands

`/fly train 50`, `/fly stop`, `/fly status`, `/fly dope [amount]`,
`/fly task chop`, `/fly watch`, `/fly summon [name]`, `/fly play`, `/fly lan`.
Vanilla `/trigger fly set <code>` variants work with no OP.

## Build from source

`cd mod` (or `mod-1.20.1`) → `powershell -ExecutionPolicy Bypass -File setup_mod.ps1`.
26.2 needs JDK 25 first (`../setup_jdk25.ps1` — not included here).

## License

MIT — see LICENSE.
