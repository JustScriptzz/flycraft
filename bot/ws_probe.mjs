// Watch-path probe: connects as a HUD client, prints one live brain_state.
// Usage: node ws_probe.mjs  (brain must be running)
import { WebSocket } from 'ws'

const ws = new WebSocket('ws://127.0.0.1:8765')
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
ws.send(JSON.stringify({ role: 'hud' }))
const raw = await new Promise((res) => ws.once('message', (m) => res(m.toString())))
const o = JSON.parse(raw)
console.log('type=' + o.type,
  'ep=' + o.episode,
  'action=' + o.action_name,
  'reward_sum=' + o.reward_sum,
  'logs=' + o.logs,
  'regions=' + Object.keys(o.regions || {}).join(','))
ws.close()
