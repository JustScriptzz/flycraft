"""Create GitHub Release v1.0.0 and attach both portable jars.
Usage: python release.py <token>  (repo fixed below; jars by relative path)
Run from the flycraft folder."""
import json
import sys
import urllib.request

TOKEN = sys.argv[1]
REPO = "JustScriptzz/flycraft"
TAG = "v1.0.0"
JARS = [
    ("mod/build/libs/flycraft-hud-1.0.0+1.21.4.jar",
     "flycraft-hud-1.0.0+1.21.4.jar"),
    ("mod-1.20.1/build/libs/flycraft-hud-1.0.0+1.20.1.jar",
     "flycraft-hud-1.0.0+1.20.1.jar"),
]
BODY = (
    "FlyCraft HUD 1.0.0 - live brain overlay + /fly commands, "
    "one portable jar per version (Fabric API embedded, zero extra downloads).\n\n"
    "flycraft-hud-1.0.0+1.21.4.jar - Minecraft 1.21.4, Java 21\n"
    "flycraft-hud-1.0.0+1.20.1.jar - Minecraft 1.20.1, Java 17\n\n"
    "Needs Fabric Loader 0.19.5. Standalone it installs its own brain "
    "(Python 3.10+ once) and shows IDLE activity; with the trainer it shows LIVE thought."
)


def api(url, data=None, method="GET", ctype="application/json"):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "token " + TOKEN)
    req.add_header("Accept", "application/vnd.github+json")
    if ctype:
        req.add_header("Content-Type", ctype)
    with urllib.request.urlopen(req) as r:
        raw = r.read().decode("utf-8")
        return json.loads(raw) if ctype == "application/json" else raw


rel = api(
    f"https://api.github.com/repos/{REPO}/releases",
    data=json.dumps({
        "tag_name": TAG,
        "name": "FlyCraft HUD 1.0.0",
        "body": BODY,
        "draft": False,
        "prerelease": False,
    }).encode("utf-8"),
    method="POST",
)
up = rel["upload_url"].split("{")[0]
print("release:", rel.get("html_url"))
for path, name in JARS:
    with open(path, "rb") as f:
        blob = f.read()
    req = urllib.request.Request(
        f"{up}?name={name}",
        data=blob,
        method="POST",
        headers={
            "Authorization": "token " + TOKEN,
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/java-archive",
        },
    )
    with urllib.request.urlopen(req) as r:
        info = json.loads(r.read().decode("utf-8"))
    print("uploaded:", info.get("name"), info.get("size"), "bytes")
print("RELEASE DONE")
