// Drosobot: Mineflayer body for the FlyBrain.
// Each policy tick (200ms): sense -> send obs+reward to brain -> exec action.
// Episodes rotate tasks: chop (tree pad, collect 5+ logs) and beacon
// (reach the glowing pillar). Each episode: teleport, reset, train until
// goal / timeout / fell out of the arena.
//
//   node bot.js [--episodes 50] [--brain ws://127.0.0.1:8765]
import mineflayer from 'mineflayer'
import { Rcon } from 'rcon-client'
import Vec3 from 'vec3'
import { WebSocket } from 'ws'
import pkg from 'prismarine-viewer'
const { mineflayer: mineflayerViewer } = pkg
import fs from 'node:fs'
import net from 'node:net'

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) =>
    a.startsWith('--') ? [a.slice(2), arr[i + 1] ?? true] : []).filter(Boolean))
const MAX_EPISODES = parseInt(args.episodes ?? '1000000', 10)
const BRAIN_URL = args.brain ?? 'ws://127.0.0.1:8765'
const RCON = { host: '127.0.0.1', port: 25575, password: process.env.RCON_PASSWORD ?? 'flyrcon1' }

const TICK_MS = 200
const EP_TIMEOUT_TICKS = 450      // 90 s
const LOG_GOAL = 5
const AXE = 'stone_axe'

// Arena: floor at y=100, 64x64, glass walls. 8 tree pads.
const AY = 100
const PADS = []
for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 2; iz++)
  PADS.push({ x: -24 + ix * 16, z: -8 + iz * 16 })

const LOGS = ['oak_log']
const LOG_RCON = process.env.LOG_RCON === '1'
const TASKS = ['chop', 'beacon', 'craft']
const BEACON = { x: 0, z: 24 }
const CRAFT_PAD = { x: 24, z: 16 }
let dopeMult = 1.0  // reward scale, set live via !dope
let rcon, bot, brain
let episode = 0, t = 0, epReward = 0, logsThisEp = 0, prevDist = 0
let digging = false, targetTree = PADS[0], log
let task = 'chop', target = { x: 0, z: 0 }
let prevPlanks = 0, prevSticks = 0, prevPick = 0
let crafting = false, craftSince = 0
let trainingActive = false, targetEpisodes = Infinity, loopRunning = false
let taskFilter = null, lastBrainState = null
let lastReward = 0, prevLogs = 0, arenaBuilt = false, digSince = 0
let digTargetName = null  // block being dug (diggingCompleted only reports air)
let prevAction = -1, lastMineHadTarget = false  // wasted-effort tracking
let curAction = -1  // persistent controls: re-issue only on change

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// The 3D viewer binds port 3007 async and crashes the process on EADDRINUSE
// (uncaught). Probe first so a stale process only costs us the camera.
function isPortFree(port) {
  return new Promise((res) => {
    const s = net.connect(port, '127.0.0.1')
    s.once('connect', () => { s.end(); res(false) })
    s.once('error', () => res(true))
  })
}

// Teleport packets arrive async; wait until the client-side position
// actually reflects the new location before sensing/acting.
async function awaitTeleport(x, y, z, timeoutMs = 8000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const p = bot.entity.position
    if (Math.abs(p.x - x) < 1.5 && Math.abs(p.z - z) < 1.5 && p.y > AY - 2) return true
    await sleep(200)
  }
  return false
}
function csv(row) {
  fs.appendFileSync('../brain/logs/training.csv', row.join(',') + '\n')
}

// RCON has no multiplexing guarantee under concurrency (trigger poll vs
// training loop); serialize every send through one queue.
let rconQueue = Promise.resolve()
function rsend(cmd) {
  const run = rconQueue.then(() => rcon.send(cmd))
  rconQueue = run.catch(() => {})
  return run
}

async function rc(cmd) {
  const res = await rsend(cmd)
  if (LOG_RCON) console.log('[rcon]', cmd, '->', JSON.stringify(String(res).slice(0, 120)))
  await sleep(60)
  return res
}

async function setupServer() {
  console.log('[bot] server setup (gamerules, op)...')
  await rc('gamerule doDaylightCycle false')
  await rc('gamerule sendCommandFeedback false')
  await rc('time set day')
  await rc('difficulty peaceful')
  await rc('gamerule doImmediateRespawn true')
  await rc('op Drosobot')
  await setupTriggers()
  await installDatapack()
}

// Datapack (vanilla HUD): copies datapacks/fly-1.21.4 into the world and
// reloads, so bossbars/objectives exist with zero manual steps.
async function installDatapack() {
  try {
    console.log('[bot] installing datapack...')
    fs.cpSync('../datapacks/fly-1.21.4', '../server/world/datapacks/fly', { recursive: true, force: true })
    await rc('reload')
    await rc('datapack enable file/fly')
  } catch (e) { console.log('[bot] datapack install failed:', String(e).slice(0, 120)) }
}

// Vanilla /trigger plumbing: any player can run `/trigger fly set <code>`
// (argument in `/trigger flyArg`) with no OP needed; the bot polls the
// scores over RCON every few seconds and executes them as commands.
async function setupTriggers() {
  console.log('[bot] setting up /trigger commands...')
  await rc('scoreboard objectives add fly trigger')
  await rc('scoreboard objectives add flyArg trigger')
}

async function pollTriggers() {
  try {
    const list = await rsend('list')
    const m = list.match(/:(.*)$/)
    const names = m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : []
    await rsend('scoreboard players enable @a fly')
    await rsend('scoreboard players enable @a flyArg')
    for (const n of names) {
      if (n === bot.username) continue
      let code = 0, arg = 0
      try {
        const m1 = (await rsend(`scoreboard players get ${n} fly`)).match(/has (-?\d+)/)
        if (m1) code = parseInt(m1[1], 10)
      } catch { /* no score yet */ }
      if (!code) continue
      try {
        const m2 = (await rsend(`scoreboard players get ${n} flyArg`)).match(/has (-?\d+)/)
        if (m2) arg = parseInt(m2[1], 10)
      } catch { /* no arg */ }
      await rsend(`scoreboard players set ${n} fly 0`)
      await rsend(`scoreboard players set ${n} flyArg 0`)
      triggerCommand(n, code, arg)
    }
  } catch (e) { if (LOG_RCON) console.log('[trigger] poll:', String(e).slice(0, 100)) }
}

function triggerCommand(user, code, arg) {
  switch (code) {
    case 1: onCommand(user, 'status', []); break
    case 2: onCommand(user, 'stop', []); break
    case 3: onCommand(user, 'train', arg > 0 ? [String(arg)] : []); break
    case 4: onCommand(user, 'task', [arg === 1 ? 'chop' : arg === 2 ? 'beacon' : 'both']); break
    case 5: onCommand(user, 'watch', []); break
    case 6: onCommand(user, 'play', []); break
    case 7: onCommand(user, 'help', []); break
    case 8: onCommand(user, 'summon', []); break
    case 9: onCommand(user, 'dope', []); break
    case 10: onCommand(user, 'dope', arg > 0 ? [String(arg / 10)] : []); break
    default: bot.chat(`[fly] unknown /trigger code ${code}`)
  }
}

// NOTE: fills only work when the chunks are loaded, i.e. while the bot is
// standing in the arena. Called post-teleport, never at spawn.
async function buildArena() {
  console.log('[bot] building arena...')
  await rc(`fill -33 ${AY - 1} -33 33 ${AY - 1} 33 grass_block`)
  await rc(`fill -33 ${AY} -33 33 ${AY + 5} 33 air`)
  // glass walls
  await rc(`fill -33 ${AY} -33 -33 ${AY + 4} 33 glass`)
  await rc(`fill 33 ${AY} -33 33 ${AY + 4} 33 glass`)
  await rc(`fill -33 ${AY} -33 33 ${AY + 4} -33 glass`)
  await rc(`fill -33 ${AY} 33 33 ${AY + 4} 33 glass`)
  // beacon-task pillar (static, built once with the arena)
  await rc(`fill ${BEACON.x} ${AY} ${BEACON.z} ${BEACON.x} ${AY + 8} ${BEACON.z} glowstone`)
  await rc(`setblock ${BEACON.x} ${AY} ${BEACON.z} gold_block`)
}

async function buildTree(p) {
  const { x, z } = p
  await rc(`fill ${x} ${AY} ${z} ${x} ${AY + 4} ${z} oak_log`)
  await rc(`fill ${x - 2} ${AY + 3} ${z - 2} ${x + 2} ${AY + 4} ${z + 2} oak_leaves[persistent=true]`)
  await rc(`fill ${x - 1} ${AY + 5} ${z - 1} ${x + 1} ${AY + 5} ${z + 1} oak_leaves[persistent=true]`)
  await rc(`setblock ${x} ${AY + 5} ${z} oak_leaves[persistent=true]`)
}

async function buildTable(p) {
  await rc(`setblock ${p.x} ${AY} ${p.z} crafting_table`)
}

async function resetEpisode() {
  for (let i = 0; i < 20 && bot.health <= 0; i++) await sleep(500)  // wait out death/respawn
  task = taskFilter ?? TASKS[episode % TASKS.length]
  const SD = parseInt(process.env.SPAWN_DIST ?? '6', 10)
  if (task === 'chop') {
    targetTree = PADS[episode % PADS.length]
    target = { x: targetTree.x, z: targetTree.z }
  } else if (task === 'beacon') {
    target = { x: BEACON.x, z: BEACON.z }
  } else {
    target = { x: CRAFT_PAD.x, z: CRAFT_PAD.z }
  }
  const sx = target.x + SD, sz = target.z + SD
  await rc(`tp Drosobot ${sx} ${AY + 1} ${sz} -135 0`) // chunk-loading tp
  await awaitTeleport(sx, AY + 1, sz)
  if (!arenaBuilt) { await buildArena(); arenaBuilt = true }
  if (task === 'chop') await buildTree(targetTree)
  if (task === 'craft') await buildTable(target)
  await rc('clear Drosobot')
  if (task === 'craft') await rc('give Drosobot oak_log 4')
  else await rc(`give Drosobot ${AXE} 1`)
  // Final placement tp AFTER the floor exists (the loader tp above drops the
  // bot into mid-air while fills run; without this it falls through).
  await rc(`tp Drosobot ${sx} ${AY + 1} ${sz} -135 0`)
  const settled = await awaitTeleport(sx, AY + 1, sz)
  bot.entity.velocity.set(0, 0, 0)
  const axe = bot.inventory.items().find(i => i.name === AXE)
  if (axe) {
    try { await bot.equip(axe, 'hand') }
    catch { console.log('[bot] equip failed, digging by hand') }
  }
  const pp = bot.entity.position
  console.log(`[bot] reset settled=${settled} pos=(${pp.x.toFixed(1)},${pp.y.toFixed(1)},${pp.z.toFixed(1)})`)
  t = 0; epReward = 0; logsThisEp = 0; lastReward = 0; prevLogs = 0
  prevPlanks = 0; prevSticks = 0; prevPick = 0
  bot.clearControlStates(); digging = false; digTargetName = null; curAction = -1
  const d = bot.entity.position
  prevDist = Math.hypot(d.x - target.x, d.z - target.z)
  console.log(`[bot] === episode ${episode} [${task}] @ (${target.x},${target.z}) ===`)
}

function nearestLog() {
  return bot.findBlock({ matching: (b) => b && LOGS.includes(b.name), maxDistance: 10 })
}

// obs: 96 sectors (8 dirs x 3 rings x log/leaves/solid/air) + 11 proprio
function sense() {
  const sectors = []
  const pos = bot.entity.position
  const RINGS = [[2, 3], [4, 6], [7, 9]]
  for (let d = 0; d < 8; d++) {
    const ang = (d / 8) * Math.PI * 2
    const dx = -Math.sin(ang), dz = Math.cos(ang)
    for (const [r0, r1] of RINGS) {
      let cnt = [0, 0, 0, 0]
      let n = 0
      for (let r = r0; r <= r1; r++) {
        for (const dy of [0, 1, 2]) {
          const bp = new Vec3(Math.floor(pos.x + dx * r), Math.floor(pos.y + dy - 1), Math.floor(pos.z + dz * r))
          const b = bot.blockAt(bp)
          if (!b) continue
          n++
          if (b.name.includes('log')) cnt[0]++
          else if (b.name.includes('leaves')) cnt[1]++
          else if (b.boundingBox !== 'empty') cnt[2]++
          else cnt[3]++
        }
      }
      sectors.push(...cnt.map(c => (n ? c / n : 0.25)))
    }
  }
  const yaw = bot.entity.yaw, pitch = bot.entity.pitch
  const dx = target.x - pos.x, dz = target.z - pos.z
  const dist = Math.hypot(dx, dz)
  const inv = bot.inventory.items().find(i => i.name.includes('log'))
  const logs = inv ? inv.count : 0
  const proprio = [
    Math.sin(yaw), Math.cos(yaw), pitch / (Math.PI / 2),
    bot.entity.onGround ? 1 : 0, Math.min(1, logs / LOG_GOAL),
    // NOTE: mineflayer yaw ψ faces (-sinψ,-cosψ) (ψ=0 is north/-Z), NOT the
    // ONLINE-minecraft (-sinθ,+cosθ) convention — bearing must use atan2(-dx,-dz).
    1 / (1 + dist / 8), Math.sin(Math.atan2(-dx, -dz)), Math.cos(Math.atan2(-dx, -dz)),
    1 - t / EP_TIMEOUT_TICKS, Math.min(1, bot.entity.velocity.norm() / 5),
    TASKS.indexOf(task) / (TASKS.length - 1),
  ]
  return { sectors, proprio, dist, logs }
}

async function act(a, task) {
  if (a !== curAction) {
    bot.clearControlStates()
    if (curAction === 8 && digging) {
      try { bot.stopDigging() } catch { /* already idle */ }
      digging = false; digTargetName = null
    }
    curAction = a
    if (a === 1) bot.setControlState('forward', true)
    else if (a === 2) bot.setControlState('back', true)
    else if (a === 3) bot.setControlState('left', true)
    else if (a === 4) bot.setControlState('right', true)
    else if (a === 5) { bot.setControlState('jump', true); bot.setControlState('forward', true) }
  }
  if (a === 6) await bot.look(bot.entity.yaw + 0.35, bot.entity.pitch, true)
  else if (a === 7) await bot.look(bot.entity.yaw - 0.35, bot.entity.pitch, true)
  else if (a === 8) {
      if (task !== 'chop' && task !== 'craft') return  // mining only where it can help
      lastMineHadTarget = false
      const c = bot.blockAtCursor(4.5)
      let tgt = c && LOGS.includes(c.name) ? c : nearestLog()
      if (process.env.DIG_DEBUG && t < 3) {
        console.log(`[digdbg] t=${t} tgt=${tgt ? tgt.name + '@' + tgt.position : 'NONE'} ` +
          `dist=${tgt ? bot.entity.position.distanceTo(tgt.position).toFixed(2) : '-'} ` +
          `digTime=${tgt ? bot.digTime(tgt) : '-'} onGround=${bot.entity.onGround} ` +
          `y=${bot.entity.position.y.toFixed(2)} digging=${digging}`)
      }
      const eye = bot.entity.position.offset(0, 1.65, 0)
      if (tgt && tgt.position.offset(0.5, 0.5, 0.5).distanceTo(eye) <= 5.1) {
        lastMineHadTarget = true
        await bot.lookAt(tgt.position.offset(0.5, 0.5, 0.5), true)
        if (!digging) {
          digging = true; digSince = Date.now(); digTargetName = tgt.name
          bot.dig(tgt, true).catch(() => {}).finally(() => { digging = false })
        } else if (Date.now() - digSince > 4000) {
          try { bot.stopDigging() } catch { /* already idle */ }
          digging = false; digTargetName = null
        }
      } else if (digging) {
        try { bot.stopDigging() } catch { /* already idle */ }
        digging = false; digTargetName = null
      }
    }
    else if (a === 9) {
      if (task !== 'craft') return  // crafting only exists in craft
      if (!crafting) {
        crafting = true; craftSince = Date.now()
        doCraftStep().catch(() => {}).finally(() => { crafting = false })
      } else if (Date.now() - craftSince > 8000) { crafting = false }
    }
}

function countItem(n) {
  const i = bot.inventory.items().find(x => x.name === n)
  return i ? i.count : 0
}

// One rung of the wood-age ladder: planks -> sticks -> wooden pickaxe.
// Guarded by the crafting flag like digging (async, timeouts, no overlap).
async function doCraftStep() {
  const R = bot.registry
  if (!R || !R.itemsByName) throw new Error('no registry')
  const id = (n) => R.itemsByName[n].id
  const table = bot.findBlock({ matching: (b) => b && b.name === 'crafting_table', maxDistance: 4 })
  if (countItem('wooden_pickaxe') > 0) return
  if (countItem('stick') < 2 && countItem('oak_planks') >= 2) {
    const rec = bot.recipesFor(id('stick'), null, 1, null)[0]
    if (rec) await bot.craft(rec, 1, null)
    return
  }
  if (countItem('oak_planks') < 3 && countItem('oak_log') >= 1) {
    const rec = bot.recipesFor(id('oak_planks'), null, 1, null)[0]
    if (rec) await bot.craft(rec, 1, null)
    return
  }
  if (table && countItem('oak_planks') >= 3 && countItem('stick') >= 2) {
    const rec = bot.recipesFor(id('wooden_pickaxe'), null, 1, table)[0]
    if (rec) await bot.craft(rec, 1, table)
  }
}

// Vanilla HUD mirror: brain regions -> bossbars, status -> actionbar.
// This is what players WITHOUT the mod see (works on any version).
async function mirrorBrain() {
  const s = lastBrainState
  if (!s || !s.regions) return
  const R = s.regions
  const bars = [['lamina', R.lamina], ['medulla', R.medulla], ['lobula', R.lobula], ['kc', R.kc], ['mbon', R.mbon], ['app', R.mbon_app], ['av', R.mbon_av], ['cx', R.cx], ['gf', R.gf]]
  for (const [k, v] of bars) {
    const pct = Math.max(0, Math.min(100, Math.round((v || 0) * 100)))
    await rsend(`bossbar set fly:${k} value ${pct}`)
    await rsend(`bossbar set fly:${k} players @a`)
  }
}

async function actionbar() {
  const s = lastBrainState
  if (!s) return
  await rsend(`title @a actionbar {"text":"[${task}] ${s.action_name} R${epReward.toFixed(1)} ep${episode} logs${logsThisEp} rpe${s.rpe}","color":"green"}`)
}

async function loop() {
  if (loopRunning) return
  loopRunning = true
  while (trainingActive && episode < targetEpisodes && episode < MAX_EPISODES) {
    await resetEpisode()
    let done = false, minDist = 1e9
    const actCounts = new Array(10).fill(0)
    while (!done) {
      const { sectors, proprio, dist, logs } = sense()
      // reward: shaping on approach + log events + time pressure
      let r = 0.05 * Math.max(-1, Math.min(1, (prevDist - dist) * 2)) - 0.002
      r += lastReward; lastReward = 0
      const gained = Math.max(0, logs - prevLogs); prevLogs = logs
      r += 0.05 * gained  // pickup bonus from inventory delta (robust)
      if (task === 'craft') {
        const pl = countItem('oak_planks'), st = countItem('stick'), pk = countItem('wooden_pickaxe')
        r += 0.05 * Math.max(0, pl - prevPlanks) + 0.05 * Math.max(0, st - prevSticks)
        if (pk > prevPick) { r += 2; done = true; console.log(`[bot] ep ${episode} t=${t} CRAFTED`); bot.chat(`[fly] crafted a wooden pickaxe in ${t} ticks (ep ${episode})`) }
        prevPlanks = pl; prevSticks = st; prevPick = pk
      }
      prevDist = dist
      if (dist > 25) r -= 0.02  // don't roam the walls
      const fell = bot.entity.position.y < AY - 4
      if (fell) { r -= 1; done = true; console.log(`[bot] ep ${episode} t=${t} FELL y=${bot.entity.position.y}`) }
      if (bot.health <= 0) { r -= 1; done = true; console.log(`[bot] ep ${episode} t=${t} DIED`) }
      if (task === 'chop' && logs >= LOG_GOAL) { r += 2; done = true; console.log(`[bot] ep ${episode} t=${t} GOAL`); bot.chat(`[fly] chopped ${LOG_GOAL} logs in ${t} ticks (ep ${episode})`); rc('title @a title {"text":"GOAL +2","color":"gold"}').catch(() => {}) }
      if (task === 'beacon' && dist < 2.5) { r += 2; done = true; console.log(`[bot] ep ${episode} t=${t} ARRIVED`); bot.chat(`[fly] reached the beacon in ${t} ticks (ep ${episode})`); rc('title @a title {"text":"BEACON +2","color":"aqua"}').catch(() => {}) }
      if (t >= EP_TIMEOUT_TICKS) { done = true; console.log(`[bot] ep ${episode} TIMEOUT`) }
      const t0 = Date.now()
      const brainAction = await brainStep({ sectors, proprio }, r, done)
      // FORCE_MINE=1: mechanics-test hook — always mine (brain still ticks/learns)
      const action = process.env.FORCE_MINE ? 8 : brainAction
      if (dopeMult !== 1.0) r *= dopeMult  // live dopamine dial
      if (prevAction === 8 && !lastMineHadTarget) r -= 0.01  // swinging at nothing
      prevAction = action
      if (process.env.DIG_DEBUG && t < 15) {
        const brg = Math.atan2(proprio[6], proprio[7])
        console.log(`[navdbg] t=${t} yaw=${bot.entity.yaw.toFixed(2)} want=${brg.toFixed(2)} dist=${dist.toFixed(1)} act=${action}`)
      }
      actCounts[action]++
      minDist = Math.min(minDist, dist)
      if (t % 10 === 0) await mirrorBrain()
      if (t % 20 === 0) await actionbar()
      epReward += r
      if (!done) await act(action, task)
      t++
      await sleep(Math.max(0, TICK_MS - (Date.now() - t0)))
      if (bot.entity.position.y < AY - 4) { done = true; console.log(`[bot] ep ${episode} t=${t} FELL-LATE y=${bot.entity.position.y}`) }
    }
    csv([episode, t, logsThisEp, epReward.toFixed(3), new Date().toISOString(), task])
    console.log(`[bot] ep ${episode} [${task}]: ticks=${t} logs=${logsThisEp} reward=${epReward.toFixed(2)} minDist=${minDist.toFixed(1)} acts=[${actCounts.join(',')}]`)
    episode++
  }
  console.log('[bot] training loop exited @ ep', episode)
  loopRunning = false
  trainingActive = false
  const doneAll = episode >= targetEpisodes || episode >= MAX_EPISODES
  console.log(`[bot] training ${doneAll ? 'complete' : 'paused'} @ ep ${episode}`)
  bot.chat(`[fly] training ${doneAll ? 'complete' : 'paused'} @ ep ${episode}`)
  if (doneAll && MAX_EPISODES < 1000000) process.exit(0)
}

function startTraining(n) {
  if (n !== undefined) targetEpisodes = episode + n
  else targetEpisodes = MAX_EPISODES
  const scope = targetEpisodes >= 1000000 ? 'until stopped' : `to ep ${targetEpisodes}`
  trainingActive = true
  bot.chat(`[fly] training ${scope} (task: ${taskFilter ?? 'chop+beacon'})`)
  loop().catch(e => { console.error(e); process.exit(1) })
}

function onCommand(user, cmd, args) {
  console.log(`[bot] command !${cmd} from ${user} ${args.join(' ')}`)
  const list = (process.env.COMMANDERS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (list.length > 0 && !list.includes(user.toLowerCase())) {
    bot.chat(`[fly] sorry ${user}, not on the commanders list`)
    return
  }
  switch (cmd) {
    case 'train': {
      const n = parseInt(args[0] ?? '', 10)
      startTraining(Number.isFinite(n) && n > 0 ? n : undefined)
      break
    }
    case 'stop': case 'pause':
      if (loopRunning && trainingActive) {
        trainingActive = false
        bot.chat('[fly] pausing after this episode (weights save on the boundary)')
      } else bot.chat('[fly] not training right now')
      break
    case 'status': {
      const s = lastBrainState
      bot.chat(`[fly] ep=${episode} task=${task} t=${t} R=${epReward.toFixed(2)} logs=${logsThisEp} dist=${prevDist.toFixed(1)} eps=${s?.eps ?? '?'} act=${s?.action_name ?? '?'} dope=x${dopeMult}`)
      break
    }
    case 'task': {
      const v = (args[0] ?? '').toLowerCase()
      if (v === 'chop' || v === 'beacon') { taskFilter = v; bot.chat(`[fly] task locked: ${v}`) }
      else if (v === 'both' || v === '') { taskFilter = null; bot.chat('[fly] tasks alternating') }
      else bot.chat('[fly] usage: !task chop|beacon|both')
      break
    }
    case 'watch': {
      const p = bot.entity.position
      bot.chat(`/gamemode spectator ${user}`)
      bot.chat(`/tp ${user} ${p.x.toFixed(1)} ${p.y + 1} ${p.z.toFixed(1)}`)
      bot.chat(`[fly] ${user} is now spectating the brain`)
      break
    }
    case 'play':
      bot.chat(`/gamemode survival ${user}`)
      break
    case 'dope': {
      const v = parseFloat(args[0] ?? '')
      if (Number.isFinite(v)) {
        dopeMult = Math.max(0, Math.min(10, v))
        bot.chat(`[fly] dopamine dial set to x${dopeMult} (watch rpe flare)`)
      } else {
        lastReward += 1.0
        bot.chat('[fly] dopamine pulse +1.0 (watch approach flare)')
      }
      break
    }
    case 'summon': {
      // spawn a named pet fly at the requester; the training bot stays on task
      const name = args.join(' ').replace(/[^a-zA-Z0-9_ ]/g, '').slice(0, 16) || 'Drosobot Jr'
      bot.chat(`/execute as ${user} at @s run summon minecraft:allay ~ ~1 ~ {CustomName:'"${name}"',CustomNameVisible:1,PersistenceRequired:1b}`)
      bot.chat(`[fly] spawned ${name} for ${user}`)
      break
    }
    case 'help':
      bot.chat('[fly] !train [N] !stop !status !dope [x] !task chop|beacon|craft|both !watch !summon [name] !play')
      break
    default:
      bot.chat(`[fly] unknown !${cmd} (try !help)`)
  }
}

function brainStep(obs, reward, done) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('brain timeout')), 5000)
    brain.send(JSON.stringify({ type: 'step', episode, t, obs, reward, done, logs: logsThisEp, dope: dopeMult }))
    brain.once('message', (raw) => {
      clearTimeout(to)
      try { const o = JSON.parse(raw.toString()); lastBrainState = o.state ?? null; resolve(o.action ?? 0) }
      catch { resolve(0) }
    })
  })
}

async function main() {
  fs.mkdirSync('../brain/logs', { recursive: true })
  if (!fs.existsSync('../brain/logs/training.csv'))
    fs.writeFileSync('../brain/logs/training.csv', 'episode,ticks,logs,reward,time,task\n')
  rcon = await Rcon.connect(RCON)
  console.log('[bot] RCON connected')
  bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'Drosobot', version: '1.21.4' })
  bot.on('spawn', async () => {
    console.log('[bot] spawned')
    await setupServer()
    brain = new WebSocket(BRAIN_URL)
    await new Promise((res, rej) => { brain.onopen = res; brain.onerror = rej })
    brain.send(JSON.stringify({ role: 'bot' }))
    console.log('[bot] brain connected')
    if (await isPortFree(3007)) {
      try {
        mineflayerViewer(bot, { port: 3007, firstPerson: true })
        console.log('[bot] first-person view on http://127.0.0.1:3007')
      } catch (e) { console.log('[bot] viewer failed:', String(e).slice(0, 120)) }
    } else console.log('[bot] viewer port 3007 busy (stale process?), skipping 3D view')
    bot.on('chat', (username, message) => {
      if (username === bot.username || !message.startsWith('!')) return
      const [cmd, ...rest] = message.slice(1).split(' ')
      onCommand(username, cmd.toLowerCase(), rest)
    })
    setInterval(() => { pollTriggers().catch(() => {}) }, 3000)
    startTraining(MAX_EPISODES)
  })
  bot.on('diggingCompleted', () => {
    if (process.env.DIG_DEBUG) console.log('[digdbg] COMPLETED target was', digTargetName)
    if (digTargetName && digTargetName.includes('log')) { lastReward += 1.0; logsThisEp++ }
    else if (digTargetName) {
      // punishment: digging anything that isn't the goal
      const bad = digTargetName.includes('glass') ? 1.0
        : digTargetName.includes('leaves') ? 0.1 : 0.3
      lastReward -= bad
      if (process.env.DIG_DEBUG) console.log(`[digdbg] punished ${bad} for ${digTargetName}`)
    }
    digTargetName = null
  })
  bot.on('diggingAborted', () => { digTargetName = null })
  bot.on('kicked', console.log); bot.on('error', console.log)
  bot.on('death', () => console.log('[bot] died (instant respawn on, episode will reset)'))
  bot.on('playerJoined', (p) => {
    if (p.username === bot.username) return
    console.log(`[bot] player joined: ${p.username}`)
    bot.chat(`[fly] welcome ${p.username}! /fly watch to spectate the brain, /fly status to command it, /fly for more`)
  })
}

main()
