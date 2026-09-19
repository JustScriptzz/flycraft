"""Websocket bridge: bot <-> FlyBrain <-> HUD mod.

Roles (first message must be {"role":"bot"} or {"role":"hud"}):
  bot: {"type":"step","episode","t","obs":{"sectors":[...],"proprio":[...]},
        "reward","done"} -> {"type":"action","action","state"}
  hud: receives {"type":"brain_state", ...} broadcast at 10 Hz.

Run:  python serve.py [--port 8765] [--weights weights.npz]
"""

import argparse
import asyncio
import functools
import http.server
import json
import os
import signal
import threading

try:
    import websockets
except ImportError:
    raise SystemExit("install deps first:  pip install -r requirements.txt")

from flybrain import FlyBrain

brain = FlyBrain()  # created at import; main() only loads weights into it
LAST = {"logs": 0}
HUDS = set()
SAVE_EVERY_EPS = 10


async def brain_state_msg(extra=None):
    s = brain.state_dict()
    msg = {"type": "brain_state", "logs": LAST["logs"], **s}
    if extra:
        msg.update(extra)
    return json.dumps(msg)


async def broadcast():
    while True:
        await asyncio.sleep(0.1)
        if not HUDS:
            continue
        msg = await brain_state_msg()
        dead = set()
        for ws in HUDS:
            try:
                await ws.send(msg)
            except Exception:
                dead.add(ws)
        HUDS.difference_update(dead)


async def handle_bot(ws):
    last_ep = -1
    async for raw in ws:
        try:
            m = json.loads(raw)
        except Exception:
            continue
        if m.get("type") != "step":
            continue
        LAST["logs"] = int(m.get("logs", 0))
        out = brain.tick(m["obs"]["sectors"], m["obs"]["proprio"],
                         float(m.get("reward", 0.0)), bool(m.get("done", False)))
        ep = int(m.get("episode", 0))
        if ep != last_ep:
            last_ep = ep
            if ep > 0:  # every episode: npz is tiny, crash-safety first
                brain.save(WEIGHTS)
                print(f"[brain] saved weights @ episode {ep}", flush=True)
        await ws.send(json.dumps({"type": "action", "action": out["action"],
                                  "state": brain.state_dict()}))


async def handle_hud(ws):
    HUDS.add(ws)
    print(f"[brain] HUD connected ({len(HUDS)} total)", flush=True)
    try:
        async for _ in ws:
            pass
    finally:
        HUDS.discard(ws)


async def router(ws):
    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=10)
        role = json.loads(raw).get("role")
    except Exception:
        await ws.close()
        return
    if role == "bot":
        await handle_bot(ws)
    elif role == "hud":
        await handle_hud(ws)
    else:
        await ws.close()


async def main(port):
    global WEIGHTS
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=port)
    ap.add_argument("--weights", default="weights.npz")
    ap.add_argument("--dashboard-port", type=int, default=8766)
    ap.add_argument("--no-dashboard", action="store_true")
    args = ap.parse_args()
    WEIGHTS = args.weights
    if not args.no_dashboard:
        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, format, *args):  # noqa: A002 - stdlib signature
                pass

        httpd = http.server.ThreadingHTTPServer(
            ("127.0.0.1", args.dashboard_port),
            functools.partial(Quiet, directory=os.path.dirname(
                os.path.abspath(__file__))))
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        print(f"[brain] watch it train: "
              f"http://127.0.0.1:{args.dashboard_port}/dashboard.html",
              flush=True)
    if os.path.exists(WEIGHTS):
        try:
            brain.load(WEIGHTS)
            print(f"[brain] loaded {WEIGHTS} @ episode {brain.episode}, "
                  f"eps={brain.eps:.3f}", flush=True)
        except Exception as e:
            print(f"[brain] ignoring {WEIGHTS} ({e}); fresh brain", flush=True)
    else:
        print("[brain] fresh brain (no weights file yet)", flush=True)
    async with websockets.serve(router, "127.0.0.1", args.port):
        print(f"[brain] listening on 127.0.0.1:{args.port}", flush=True)
        asyncio.get_running_loop().create_task(broadcast())
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main(8765))
    except KeyboardInterrupt:
        if "brain" in globals() and brain is not None:
            brain.save(WEIGHTS)
            print(f"\n[brain] saved {WEIGHTS}")
