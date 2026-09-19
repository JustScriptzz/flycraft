"""Makes a simple project icon for the Modrinth page (not bundled in the jar)."""
from PIL import Image, ImageDraw

W, H = 512, 512
img = Image.new("RGB", (W, H), (16, 16, 16))
d = ImageDraw.Draw(img)
# panel
d.rounded_rectangle([56, 56, 456, 456], radius=48, fill=(24, 28, 34),
                    outline=(255, 200, 97), width=10)
# title bar
d.text((96, 100), "FLY BRAIN", fill=(255, 200, 97))
# firing bars
levels = [0.85, 0.55, 0.7, 0.35, 0.9, 0.6, 0.25, 0.75, 0.45]
y = 190
for v in levels:
    d.rectangle([96, y, 360, y + 22], fill=(42, 42, 42))
    d.rectangle([96, y, 96 + int(264 * v), y + 22], fill=(124, 252, 0))
    y += 30
d.text((96, 400), "[LIVE]", fill=(124, 252, 0))
img.save("icon.png")
print("icon.png written")
