// Op watchdog: ops every human player that joins so they can spectate the
// bot (/gamemode spectator + /tp Drosobot). Runs forever; launch alongside
// the training stack. Usage: node op_watchdog.mjs
import { Rcon } from 'rcon-client'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const opped = new Set(['Drosobot'])

for (;;) {
  try {
    const rcon = await Rcon.connect({
      host: '127.0.0.1',
      port: 25575,
      password: process.env.RCON_PASSWORD ?? 'flyrcon1',
    })
    console.log('[opwatch] connected')
    for (;;) {
      const list = await rcon.send('list')
      const m = list.match(/:(.*)$/)
      const names = m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : []
      for (const n of names) {
        if (opped.has(n)) continue
        console.log(`[opwatch] op ${n}: ${await rcon.send(`op ${n}`)}`)
        opped.add(n)
      }
      await sleep(15000)
    }
  } catch (e) {
    console.log('[opwatch] retrying:', String(e).slice(0, 120))
    await sleep(15000)
  }
}
