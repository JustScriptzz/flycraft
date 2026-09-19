"""Check whether Mojang publishes mappings for 26.2 (upstream truth)."""
import json
import urllib.request

manifest = json.load(urllib.request.urlopen(
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"))
v = next((x for x in manifest["versions"] if x["id"] == "26.2"), None)
if v is None:
    print("26.2 NOT in Mojang manifest")
else:
    print("manifest entry:", v["id"], v["type"], v["url"])
    meta = json.load(urllib.request.urlopen(v["url"]))
    print("downloads keys:", sorted(meta.get("downloads", {}).keys()))
