// Summon debug: opped tester runs the exact execute-summon itself and prints
// everything the server says back, so NBT/syntax errors become visible.
// Usage: node summon_debug.mjs (server running, opwatch running)
import mineflayer from 'mineflayer'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const t = mineflayer.createBot({
  host: '127.0.0.1', port: 25565, username: 'Debuggy', version: '1.21.4',
})
t.on('chat', (u, m) => console.log(`[chat] <${u}> ${m}`))
t.on('message', (m) => console.log('[sys]', String(m)))
await new Promise((res) => t.once('spawn', res))
console.log('spawned, waiting 25s to be opped...')
await sleep(25000)
t.chat(`/execute as Debuggy at @s run summon minecraft:allay ~ ~1 ~ {CustomName:'"Test"',CustomNameVisible:1,PersistenceRequired:1b}`)
await sleep(8000)
const n = Object.values(t.entities).filter(
  (e) => (e.name || '').toLowerCase() === 'allay').length
console.log('allays visible:', n)
t.quit()
process.exit(0)
