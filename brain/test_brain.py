"""Sanity + learning tests for FlyBrain. Run:  python test_brain.py"""

import numpy as np

from flybrain import FlyBrain, ACTIONS, N_SECTORS, N_PROPRIO


def rand_obs(rng):
    return rng.random(N_SECTORS) * 0.3, rng.normal(0, 0.3, N_PROPRIO)


def test_no_nans_and_valid_actions():
    b = FlyBrain(seed=1)
    rng = np.random.default_rng(0)
    for t in range(60):
        s, p = rand_obs(rng)
        out = b.tick(s, p, float(rng.normal(0, 0.1)), done=(t == 59))
        assert out["action"] in range(len(ACTIONS)), out
    for arr in (b.W_km, b.wv, np.array(list(b.rates.values()), float)):
        assert np.all(np.isfinite(arr)), "NaN/Inf detected"
    st = b.state_dict()
    assert set(st["regions"]) == {"lamina", "medulla", "lobula", "kc", "mbon",
                                  "cx", "gf", "mbon_app", "mbon_av"}
    assert st["task"] == 0 and st["task_name"] == "chop"
    print("ok: 60 ticks, no NaNs, actions valid, state complete")


def pattern(kind):
    s = np.zeros(N_SECTORS)
    if kind == "A":
        s[0:24] = 0.9   # strong log signal, near ring, ahead
    else:
        s[48:72] = 0.9  # same strength, different direction
    p = np.zeros(N_PROPRIO)
    p[1] = 1.0  # cosYaw
    p[4] = 0.2
    return s, p


def approach_to(b, kind, n=10):
    s, p = pattern(kind)
    vals = []
    for _ in range(n):
        out = b.tick(s, p, 0.0, done=False)
        vals.append(b.rates["mbon_app"])
    b.tick(s, p, 0.0, done=True)
    return float(np.mean(vals[-5:]))


def test_reward_learning():
    # brain 1: pattern A always rewarded. brain 2 (same seed): never rewarded.
    b1, b2 = FlyBrain(seed=42, eps0=0.0), FlyBrain(seed=42, eps0=0.0)
    sA, pA = pattern("A")
    for _ in range(40):
        b1.tick(sA, pA, 1.0, done=False)
        b2.tick(sA, pA, 0.0, done=False)
    b1.tick(sA, pA, 1.0, done=True)
    b2.tick(sA, pA, 0.0, done=True)
    r1, r2 = approach_to(FlyBrain(seed=0), "A"), None
    a1 = approach_to(b1, "A")
    # fresh reference response:
    ref = approach_to(FlyBrain(seed=42, eps0=0.0), "A")
    print(f"approach(A): rewarded={a1:.4f} unrewarded-ref={ref:.4f}")
    assert a1 > ref + 0.005, "reward did not strengthen approach response"
    assert np.all(b1.W_km >= 0) and np.all(b1.W_km <= 0.6001)
    print("ok: dopamine-gated plasticity strengthens rewarded pathway")


def test_steering_turns_toward_target():
    # yaw=0 (facing +Z), target at bearing +90deg (diff>0) must prefer
    # action 6 (yaw+); mirrored target must prefer 7; aligned must walk (1).
    from collections import Counter
    s = np.zeros(N_SECTORS)
    results = {}
    for name, (bs, bc) in {"left": (1.0, 0.0), "right": (-1.0, 0.0),
                           "ahead": (0.0, 1.0)}.items():
        b = FlyBrain(seed=0, eps0=0.0)
        p = np.zeros(N_PROPRIO)
        p[1] = 1.0   # cosYaw=1 -> yaw=0
        p[5] = 0.5   # mid proximity
        p[6], p[7] = bs, bc
        acts = Counter(b.tick(s, p, 0.0, done=False)["action"]
                       for _ in range(12))
        b.tick(s, p, 0.0, done=True)
        results[name] = acts.most_common(1)[0][0]
    print("steering:", results)
    assert results["left"] == 6, results
    assert results["right"] == 7, results
    assert results["ahead"] == 1, results
    print("ok: compass turns toward the target and walks when aligned")


def test_save_load(tmp="tmp_w.npz"):
    import os
    b = FlyBrain(seed=5)
    rng = np.random.default_rng(3)
    for _ in range(10):
        s, p = rand_obs(rng)
        b.tick(s, p, 0.5, done=False)
    b.save(tmp)
    c = FlyBrain(seed=99)
    c.load(tmp)
    assert np.allclose(b.W_km, c.W_km) and c.episode == b.episode
    os.remove(tmp)
    print("ok: weights save/load roundtrip")


if __name__ == "__main__":
    test_no_nans_and_valid_actions()
    test_reward_learning()
    test_steering_turns_toward_target()
    test_save_load()
    print("ALL BRAIN TESTS PASSED")
