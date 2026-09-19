// Arena diagnostics: checks whether the floor/trees actually exist.
// Usage: node probe_arena.mjs  (server must be running, RCON on)
import { Rcon } from 'rcon-client'

const rcon = await Rcon.connect({
  host: '127.0.0.1',
  port: 25575,
  password: process.env.RCON_PASSWORD ?? 'flyrcon1',
})
const cmds = [
  'execute if block -18 99 -2 grass_block',
  'execute if block 0 99 0 grass_block',
  'execute if block -24 100 -8 oak_log',
  'execute if block -24 103 -8 oak_leaves[persistent=true]',
  'fill -33 99 -33 33 99 33 grass_block',
]
for (const cmd of cmds) {
  try {
    console.log(JSON.stringify(cmd), '=>', JSON.stringify(await rcon.send(cmd)))
  } catch (e) {
    console.log(JSON.stringify(cmd), '=> ERROR', String(e).slice(0, 200))
  }
}
await rcon.end()
