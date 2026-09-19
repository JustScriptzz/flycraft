// Commands E2E: drives the in-game chat commands (!status !stop !train !watch)
// with a tester bot and asserts Drosobot obeys. Server+brain+main bot must be
// running with training active. Usage: node test_commands.mjs
import mineflayer from 'mineflayer'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const t = mineflayer.createBot({
  host: '127.0.0.1', port: 25565, username: 'Tester', version: '1.21.4',
})
await new Promise((res) => t.once('spawn', res))
await sleep(3000)

async function ask(msg, re) {
  const p = new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('timeout waiting reply to ' + msg)), 20000)
    const h = (u, m) => {
      if (u === 'Drosobot' && re.test(m)) {
        clearTimeout(to)
        t.removeListener('chat', h)
        res(m)
      }
    }
    t.on('chat', h)
  })
  t.chat(msg)
  return p
}

console.log('STATUS:', await ask('!status', /ep=\d+/))
console.log('STOP:', await ask('!stop', /paus|not training/i))
await sleep(3000)
console.log('TRAIN:', await ask('!train 1', /training/i))
const before = t.entity.position.clone()
t.chat('!watch')
await sleep(5000)
const moved = t.entity.position.distanceTo(before)
console.log('WATCH moved blocks:', moved.toFixed(1))
if (moved < 3) throw new Error('!watch did not teleport tester')
await sleep(4000) // let the trigger poll enable objectives for Tester
console.log('TRIGGER:', await ask('/trigger fly set 1', /ep=\d+/))
console.log('SUMMON:', await ask('!summon', /spawned .* for/))
console.log('COMMANDS OK')
t.quit()
process.exit(0)
