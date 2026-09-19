// Usage: node rcon_test.mjs "<command>" — sends one RCON command, prints reply.
import { Rcon } from 'rcon-client'

const cmd = process.argv[2] ?? 'list'
const rcon = await Rcon.connect({
  host: '127.0.0.1',
  port: 25575,
  password: process.env.RCON_PASSWORD ?? 'flyrcon1',
})
console.log('[rcon]', JSON.stringify(cmd), '->', JSON.stringify(await rcon.send(cmd)))
await rcon.end()
