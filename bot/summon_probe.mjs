// Summon probe: joins live training, asks !summon, asserts the bot arrives.
// Read-only except one teleport of the training bot (it walks back after).
// Usage: node summon_probe.mjs  (server+brain+bot must be running)
import mineflayer from 'mineflayer'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const t = mineflayer.createBot({
  host: '127.0.0.1', port: 25565, username: 'SummonTester', version: '1.21.4',
})
await new Promise((res) => t.once('spawn', res))
await sleep(3000)

const reply = await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('timeout waiting summon reply')), 20000)
  const h = (u, m) => {
    if (u === 'Drosobot' && /spawned .* for/.test(m)) {
      clearTimeout(to)
      t.removeListener('chat', h)
      res(m)
    }
  }
  t.on('chat', h)
  t.chat('!summon')
})
console.log('SUMMON reply:', reply)

// allays never spawn naturally, so any nearby allay is our spawned fly
const countAllays = () => Object.values(t.entities).filter((e) => {
  return (e.name || '').toLowerCase() === 'allay' &&
    e.position.distanceTo(t.entity.position) < 12
}).length
console.log('allays nearby before:', countAllays())
const deadline = Date.now() + 20000
let after = 0
while (Date.now() < deadline) {
  after = countAllays()
  if (after > 0) break
  await sleep(1000)
}
console.log('allays nearby after:', after)
t.quit()
if (after < 1) {
  console.error('SUMMON FAILED: no fly spawned')
  process.exit(1)
}
console.log('SUMMON OK')
process.exit(0)
