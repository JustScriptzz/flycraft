// Dope probe: sets multiplier, checks status, pulses, resets to x1.
// Resets the dial so live training is unaffected. Usage: node dope_probe.mjs
import mineflayer from 'mineflayer'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const t = mineflayer.createBot({
  host: '127.0.0.1', port: 25565, username: 'Doper', version: '1.21.4',
})
await new Promise((res) => t.once('spawn', res))
await sleep(3000)

async function ask(msg, re) {
  const p = new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('timeout: ' + msg)), 20000)
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

console.log('SET:', await ask('!dope 3', /x3/))
console.log('STATUS:', await ask('!status', /dope=x3/))
console.log('PULSE:', await ask('!dope', /pulse/))
console.log('RESET:', await ask('!dope 1', /x1/))
console.log('DOPE OK')
t.quit()
process.exit(0)
