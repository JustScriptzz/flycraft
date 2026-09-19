// Read-only trigger probe: asks status via /trigger, changes no training state.
// Server+brain+main bot must be running. Usage: node trigger_probe.mjs
import mineflayer from 'mineflayer'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const t = mineflayer.createBot({
  host: '127.0.0.1', port: 25565, username: 'Probe', version: '1.21.4',
})
await new Promise((res) => t.once('spawn', res))
const deadline = Date.now() + 180000
let ok = false
t.on('chat', (u, m) => {
  if (u === 'Drosobot' && /ep=\d+/.test(m)) {
    console.log('TRIGGER STATUS:', m)
    ok = true
  }
})
while (!ok && Date.now() < deadline) {
  t.chat('/trigger fly set 1')
  await sleep(10000)
}
t.quit()
if (!ok) {
  console.error('trigger probe FAILED')
  process.exit(1)
}
console.log('TRIGGER PROBE OK')
process.exit(0)
