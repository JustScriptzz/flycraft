"""Drosophila-inspired spiking controller for the FlyCraft bot.

Architecture mirrors the fly's sensorimotor pathway at demo scale:

  sectors (vision) -> lamina -> medulla -> lobula -> PNs -> Kenyon cells
       proprioception ------------------------------^      |
                                                         MBONs (approach / avoid / vigor)
                                                           |  ^ dopamine RPE (3-factor plasticity)
  yaw/bearing -> central-complex heading ring -> steering  |
  near-field expansion -> giant fiber (loom reflex)  -----/
                                                           v
                                              descending neurons -> 9 actions

Learning ("training") is reward-modulated plasticity on Kenyon-cell ->
MBON synapses plus a dopamine-style reward-prediction-error critic.
Nothing here is a lookup table or script: actions come from spikes.

Wire protocol (JSON over websocket, see serve.py):
  bot -> brain: {"type":"step","episode":int,"t":int,
                 "obs":{"sectors":[...96 floats 0..1...],
                        "proprio":[...10 floats...]},
                 "reward":float,"done":bool}
  brain -> bot: {"type":"action","action":int,"state":{...}}
"""

import numpy as np

ACTIONS = ["noop", "fwd", "back", "left", "right", "jump", "yawL", "yawR", "mine", "craft"]

N_SECTORS = 96   # 8 directions x 3 distance rings x 4 channels(log,leaves,solid,air)
N_PROPRIO = 11   # [sinYaw,cosYaw,pitchN,onGround,logsN,prox,bearSin,bearCos,timeN,speedN,taskN]
TASK_NAMES = ["chop", "beacon", "craft"]
N_MED, N_LOB, N_PN, N_KC, N_MBON, N_CX = 64, 32, 48, 600, 3, 16


class LIF:
    """Leaky integrate-and-fire population with spike traces."""

    def __init__(self, n, tau_m=20.0, v_th=1.0, v_rest=0.0, v_reset=0.0,
                 r_gain=1.0, dt=1.0, t_ref=2.0, tr=25.0):
        self.n = n
        self.tau_m, self.v_th = tau_m, v_th
        self.v_rest, self.v_reset, self.r_gain = v_rest, v_reset, r_gain
        self.dt, self.t_ref = dt, t_ref
        self.tr_decay = float(np.exp(-dt / tr))
        self.v = np.zeros(n)
        self.ref = np.zeros(n)
        self.tr_pre = np.zeros(n)   # presynaptic-style trace of own spikes
        self.reset_state()

    def reset_state(self):
        self.v.fill(self.v_rest)
        self.ref.fill(0.0)
        self.tr_pre.fill(0.0)

    def step(self, I, top_k=None):
        I = np.clip(np.asarray(I, dtype=float).reshape(-1), -6.0, 6.0)
        self.ref = np.maximum(0.0, self.ref - self.dt)
        dv = (-(self.v - self.v_rest) + self.r_gain * I) * self.dt / self.tau_m
        self.v = np.where(self.ref > 0.0, self.v_reset, self.v + dv)
        sp = (self.v >= self.v_th) & (self.ref <= 0.0)
        if top_k is not None and sp.sum() > top_k:
            # sparse coding: keep the K most depolarized winners
            cand = np.flatnonzero(sp)
            keep = cand[np.argsort(self.v[cand])[-top_k:]]
            sp = np.zeros_like(sp)
            sp[keep] = True
        self.v = np.where(sp, self.v_reset, self.v)
        self.ref = np.where(sp, self.t_ref, self.ref)
        self.tr_pre = self.tr_decay * self.tr_pre + sp.astype(float)
        return sp.astype(float)


class FlyBrain:
    def __init__(self, seed=7, eps0=0.35, eps_floor=0.05, eps_decay=0.985,
                 eta=0.03, eta_v=0.08, gamma=0.95):
        self.rng = np.random.default_rng(seed)
        self.eps, self.eps_floor, self.eps_decay = eps0, eps_floor, eps_decay
        self.eta, self.eta_v, self.gamma = eta, eta_v, gamma

        # --- populations ---
        self.lamina = LIF(N_SECTORS, r_gain=1.6, v_th=0.7)
        self.medulla = LIF(N_MED, r_gain=1.6)
        self.lobula = LIF(N_LOB, r_gain=1.6, v_th=0.7)
        self.pn = LIF(N_PN, r_gain=1.8)
        self.kc = LIF(N_KC, tau_m=15.0, r_gain=1.5, v_th=0.5)
        self.mbon = LIF(N_MBON, tau_m=10.0, r_gain=2.2, v_th=0.5)

        # --- structured wiring: retinotopic pooling in the optic lobe
        # (like the real lamina/medulla cartridges — positive local pooling
        # preserves drive from sparse spikes), sparse random PN -> KC like
        # the mushroom-body calyx (~7 inputs per KC).
        # Sectors are laid out [8 dirs x 3 rings x 4 channels].
        sec_dir = np.array([(j // 4) // 3 for j in range(N_SECTORS)])
        med_dir = np.repeat(np.arange(8), N_MED // 8)  # 8 medulla / dir
        lob_dir = np.repeat(np.arange(8), N_LOB // 8)  # 4 lobula / dir
        pn_dir = np.repeat(np.arange(8), N_PN // 8)    # 6 PN / dir

        def topo(n_post, post_dir, n_pre, pre_dir,
                 same_lo=0.9, same_hi=1.5, adj=0.15):
            W = np.zeros((n_post, n_pre))
            for i in range(n_post):
                dd = np.abs(post_dir[i] - pre_dir) % 8
                dd = np.minimum(dd, 8 - dd)
                W[i] = np.where(
                    dd == 0,
                    self.rng.uniform(same_lo, same_hi, n_pre),
                    np.where(dd == 1, adj, 0.0))
            return W

        self.W_lm = topo(N_MED, med_dir, N_SECTORS, sec_dir)
        self.W_ml = topo(N_LOB, lob_dir, N_MED, med_dir)
        W_lob = topo(N_PN, pn_dir, N_LOB, lob_dir,
                     same_lo=0.7, same_hi=1.3, adj=0.2)
        W_pro = self.rng.normal(0.0, 0.9, (N_PN, N_PROPRIO))
        self.W_vp = np.concatenate([W_lob, W_pro], axis=1)
        # sparse PN -> KC like the real mushroom-body calyx (~7 inputs per KC)
        self.W_pk = np.zeros((N_KC, N_PN))
        for i in range(N_KC):
            j = self.rng.choice(N_PN, 7, replace=False)
            self.W_pk[i, j] = self.rng.normal(4.0, 0.8, 7)
        self.kc_inh = 0.9  # global inhibitory feedback gain (APL-like)

        # --- plastic KC -> MBON (excitatory, dopamine-gated) ---
        self.W_km = self.rng.uniform(0.06, 0.15, (N_MBON, N_KC))
        self.elig = np.zeros_like(self.W_km)
        self.wmax, self.wsum_cap = 0.6, 14.0

        # --- dopamine critic: value from KC activity ---
        self.wv = np.zeros(N_KC)
        self.bv = 0.0

        # --- fixed MBON -> action map (approach fwd/mine, avoid back/turn) ---
        self.W_ma = np.array([
            [0.1, 0.9, 0.0, 0.2, 0.2, 0.3, 0.3, 0.3, 1.0, 0.8],   # approach
            [0.1, 0.0, 0.8, 0.4, 0.4, 0.2, 0.6, 0.6, 0.0, 0.0],   # avoid
            [0.0, 0.3, 0.0, 0.0, 0.0, 0.9, 0.1, 0.1, 0.2, 0.3],   # vigor
        ])

        # --- central-complex heading state ---
        self.cx_phase = 0.0
        self.cx_bump = np.zeros(N_CX)

        self.substeps = 120
        self.rate_alpha = 0.15
        self.mb_mean = np.zeros(N_MBON)
        self.task = 0
        self.last_reward = 0.0
        self.dope_mult = 1.0
        self.rates = {k: 0.0 for k in
                      ("lamina", "medulla", "lobula", "kc", "mbon",
                       "cx", "gf", "mbon_app", "mbon_av")}
        self.prev = None       # stored transition for the RPE update
        self.last_action = 0
        self.last_rpe = 0.0
        self.gf_level = 0.0
        self.near_prev = 0.0
        self.episode = 0
        self.reward_sum = 0.0

    # -- helpers ------------------------------------------------------
    @staticmethod
    def _sig(x):
        return 1.0 / (1.0 + np.exp(-np.clip(x, -30, 30)))

    @staticmethod
    def _rate(pop):
        """Low-passed firing-rate estimate from a population's spike trace
        (graded-potential-style transmission between early visual layers)."""
        return pop.tr_pre * (1.0 - pop.tr_decay)

    def _value(self, kc_ema):
        return self._sig(self.wv @ kc_ema - self.bv)

    def reset_fast(self):
        for p in (self.lamina, self.medulla, self.lobula, self.pn,
                  self.kc, self.mbon):
            p.reset_state()
        self.elig.fill(0.0)
        self.prev = None
        self.cx_bump.fill(0.0)
        self.gf_level = 0.0
        self.near_prev = 0.0

    # -- main step ----------------------------------------------------
    def tick(self, sectors, proprio, reward, done, dope_mult=1.0):
        sectors = np.asarray(sectors, dtype=float).reshape(-1)
        proprio = np.asarray(proprio, dtype=float).reshape(-1)
        assert sectors.size == N_SECTORS and proprio.size == N_PROPRIO
        self.task = int(np.clip(round(float(proprio[10])), 0, len(TASK_NAMES) - 1))
        self.reward_sum += reward
        self.last_reward = float(reward)
        self.dope_mult = float(dope_mult)

        kc_ema = self.prev["kc_ema"] if self.prev else np.zeros(N_KC)

        # 1) dopamine RPE update on the *previous* transition
        if self.prev is not None:
            V_prev = self._value(self.prev["kc_ema"])
            V_now = self._value(kc_ema) * (0.0 if done else 1.0)
            rpe = reward + self.gamma * V_now - V_prev
            self.last_rpe = float(rpe)
            self.wv += self.eta_v * rpe * self.prev["kc_ema"]
            self.bv -= self.eta_v * 0.1 * rpe
            self.W_km += self.eta * rpe * self.prev["elig_snapshot"]
            np.clip(self.W_km, 0.0, self.wmax, out=self.W_km)
            col = self.W_km.sum(axis=1, keepdims=True)
            self.W_km *= np.minimum(1.0, self.wsum_cap / np.maximum(col, 1e-6))

        if done:
            self.episode += 1
            self.eps = max(self.eps_floor, self.eps * self.eps_decay)
            self.reward_sum = 0.0
            self.reset_fast()
            return {"action": 0, "reset": True}

        # 2) run the spiking network
        kc_spikes = np.zeros(N_KC)
        mbon_spikes = np.zeros(N_MBON)
        acc = {k: 0.0 for k in ("lamina", "medulla", "lobula", "kc", "mbon")}
        for _ in range(self.substeps):
            lam = self.lamina.step(sectors * 1.2)
            med = self.medulla.step(self.W_lm @ self._rate(self.lamina))
            lob = self.lobula.step(self.W_ml @ self._rate(self.medulla))
            pn = self.pn.step(
                self.W_vp @ np.concatenate([self._rate(self.lobula), proprio]))
            kc_in = (self.W_pk @ self._rate(self.pn)
                     - self.kc_inh * self.kc.tr_pre.mean() * 2.0)
            kc = self.kc.step(kc_in, top_k=30)
            mb = self.mbon.step(self.W_km @ kc)
            kc_spikes += kc
            mbon_spikes += mb
            acc["lamina"] += lam.mean()
            acc["medulla"] += med.mean()
            acc["lobula"] += lob.mean()
            acc["kc"] += kc.mean()
            acc["mbon"] += mb.mean()
        n = float(self.substeps)
        kc_bin = (kc_spikes > 0).astype(float)
        mb_bin = (mbon_spikes > 0).astype(float)
        kc_ema = (1 - 0.3) * kc_ema + 0.3 * kc_spikes / n

        # eligibility trace: co-active KC->MBON pairs stay tagged
        self.elig = 0.55 * self.elig + np.outer(kc_bin, mb_bin).T
        self.prev = {"kc_ema": kc_ema.copy(), "elig_snapshot": self.elig.copy()}

        # 3) giant-fiber looming reflex (fixed circuit, like the real escape)
        near = float(sectors.reshape(8, 3, 4)[:, 0, :3].mean())
        loom = max(0.0, near - self.near_prev)
        self.near_prev = near
        self.gf_level = 0.7 * self.gf_level + 0.3 * min(1.0, loom * 8.0)
        gf_fire = self.gf_level > 0.45

        # 4) central-complex steering: bump tracks yaw, bias turns to bearing
        yaw = float(np.arctan2(proprio[0], proprio[1]))
        self.cx_phase = yaw
        want = float(np.arctan2(proprio[6], proprio[7]))
        diff = (want - yaw + np.pi) % (2 * np.pi) - np.pi
        self.cx_bump = np.exp(2.5 * np.cos(
            np.linspace(-np.pi, np.pi, N_CX, endpoint=False) - 0.0))
        prox = float(np.clip(proprio[5], 0, 1))

        # 5) descending neurons -> action preferences
        mb_rate = mbon_spikes / n
        # adaptive baseline: only DEVIATIONS from average MBON drive steer.
        # (Untrained MBONs fire tonically and would otherwise drown the
        # compass reflex — measured prefs ~0.2-0.4 vs steering ~0.1-0.4.)
        self.mb_mean = 0.98 * self.mb_mean + 0.02 * mb_rate
        prefs = self.W_ma.T @ (mb_rate - self.mb_mean)
        steer = float(np.clip(diff * 2.0, -1.0, 1.0)) * (0.4 + 0.6 * prox)
        # NOTE sign: diff>0 needs yaw+ (action 6); this was backwards once
        # and the bot spun away from the tree forever.
        prefs[6] += max(0.0, steer) * 1.2
        prefs[7] += max(0.0, -steer) * 1.2
        # walk when facing the tree, drift toward it otherwise
        prefs[1] += 0.25 * prox + (1.0 if abs(diff) < 0.4 else 0.0)
        if self.rng.random() < self.eps:
            action = int(self.rng.integers(len(ACTIONS)))
        else:
            action = int(np.argmax(prefs + self.rng.normal(0, 0.02, len(prefs))))
        if gf_fire:
            action = 5  # jump/flee overrides everything
        self.last_action = action

        # 6) display rates
        inst = {k: acc[k] / n for k in acc}
        inst["mbon_app"] = float(mb_rate[0])
        inst["mbon_av"] = float(mb_rate[1])
        inst["cx"] = float(np.clip(abs(diff) / np.pi, 0, 1) * prox + 0.05)
        inst["gf"] = float(self.gf_level)
        for k, v in inst.items():
            self.rates[k] = (1 - self.rate_alpha) * self.rates[k] + \
                self.rate_alpha * v
        return {"action": action, "reset": False}

    def state_dict(self):
        return {
            "regions": {k: round(float(v), 4) for k, v in self.rates.items()},
            "mbon": [round(float(x), 4) for x in
                     (self.mbon.tr_pre / max(1.0, self.mbon.tr_pre.max()))],
            "action": self.last_action,
            "action_name": ACTIONS[self.last_action],
            "eps": round(self.eps, 4),
            "rpe": round(self.last_rpe, 4),
            "episode": self.episode,
            "reward_sum": round(self.reward_sum, 3),
            "task": self.task,
            "task_name": TASK_NAMES[self.task],
            "last_reward": round(self.last_reward, 3),
            "dope_mult": round(self.dope_mult, 3),
        }

    def save(self, path):
        np.savez(path, v=2, W_km=self.W_km, wv=self.wv, bv=self.bv,
                 eps=self.eps, episode=self.episode)

    def load(self, path):
        d = np.load(path)
        ver = int(d["v"]) if "v" in d.files else 1
        if ver != 2:
            raise ValueError(
                f"weights v{ver} incompatible with {N_PROPRIO}-dim proprio (need v2)")
        self.W_km[:] = d["W_km"]
        self.wv[:] = d["wv"]
        self.bv = float(d["bv"])
        self.eps = float(d["eps"])
        self.episode = int(d["episode"])
