from collections import deque
from pathlib import Path
from PIL import Image
import shutil

ROOT = Path(r"C:/Users/Tan19/AppData/Local/hermes/desktop-plugins/polis-of-hermes/assets")
ROOT.mkdir(parents=True, exist_ok=True)
BACKGROUND = Path(r"C:/Users/Tan19/AppData/Local/hermes/cache/images/openai_codex_gpt-image-2-medium_20260826_201540_9ef53449.png")
SHEET = Path(r"C:/Users/Tan19/AppData/Local/hermes/cache/images/openai_codex_gpt-image-2-medium_20260826_201357_613a2639.png")

# Preserve the generated source sheet and create a compact 16:9 background.
shutil.copy2(SHEET, ROOT / "generated-building-sheet.png")
bg = Image.open(BACKGROUND).convert("RGB")
w, h = bg.size
crop_h = round(w * 9 / 16)
top = max(0, (h - crop_h) // 2)
bg = bg.crop((0, top, w, top + crop_h)).resize((960, 540), Image.Resampling.NEAREST)
bg.save(ROOT / "polis-terraces.png", optimize=True)
bg.save(ROOT / "polis-terraces.webp", format="WEBP", quality=88, method=6)

sheet = Image.open(SHEET).convert("RGBA")
cell_w = sheet.width // 3
cell_h = sheet.height // 2
names = ["herald", "blacksmith", "scholar", "merchant", "warrior", "scribe"]

for index, name in enumerate(names):
    col, row = index % 3, index // 3
    cell = sheet.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
    px = cell.load()
    candidate = [[False] * cell.width for _ in range(cell.height)]
    for y in range(cell.height):
        for x in range(cell.width):
            r, g, b, _ = px[x, y]
            candidate[y][x] = max(r, g, b) - min(r, g, b) <= 18 and min(r, g, b) >= 205

    seen = [[False] * cell.width for _ in range(cell.height)]
    queue = deque()
    for x in range(cell.width):
        queue.append((x, 0)); queue.append((x, cell.height - 1))
    for y in range(cell.height):
        queue.append((0, y)); queue.append((cell.width - 1, y))
    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= cell.width or y >= cell.height or seen[y][x] or not candidate[y][x]:
            continue
        seen[y][x] = True
        queue.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))

    for y in range(cell.height):
        for x in range(cell.width):
            if seen[y][x]:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)

    alpha = cell.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError(f"No foreground found for {name}")
    left, top, right, bottom = bbox
    margin = 6
    left = max(0, left - margin); top = max(0, top - margin)
    right = min(cell.width, right + margin); bottom = min(cell.height, bottom + margin)
    sprite = cell.crop((left, top, right, bottom))
    sprite.save(ROOT / f"building-{name}.png", optimize=True)
    compact = sprite.copy()
    compact.thumbnail((270, 225), Image.Resampling.LANCZOS)
    compact.save(ROOT / f"building-{name}.webp", format="WEBP", quality=90, method=6)
    print(name, sprite.size, compact.size)

print("background", bg.size)

# Slice the generated occupation-character sheet and remove its baked checkerboard.
CHARACTER_SHEET = Path(r"C:/Users/Tan19/AppData/Local/hermes/cache/images/openai_codex_gpt-image-2-medium_20260826_205009_d129229d.png")
shutil.copy2(CHARACTER_SHEET, ROOT / "generated-character-sheet.png")
characters = Image.open(CHARACTER_SHEET).convert("RGBA")
char_cell_w = characters.width // 3
char_cell_h = characters.height // 2
for index, name in enumerate(names):
    col, row = index % 3, index // 3
    cell = characters.crop((col * char_cell_w, row * char_cell_h, (col + 1) * char_cell_w, (row + 1) * char_cell_h))
    px = cell.load()
    candidate = [[False] * cell.width for _ in range(cell.height)]
    for y in range(cell.height):
        for x in range(cell.width):
            r, g, b, _ = px[x, y]
            candidate[y][x] = max(r, g, b) - min(r, g, b) <= 18 and min(r, g, b) >= 205

    seen = [[False] * cell.width for _ in range(cell.height)]
    queue = deque()
    for x in range(cell.width):
        queue.append((x, 0)); queue.append((x, cell.height - 1))
    for y in range(cell.height):
        queue.append((0, y)); queue.append((cell.width - 1, y))
    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= cell.width or y >= cell.height or seen[y][x] or not candidate[y][x]:
            continue
        seen[y][x] = True
        queue.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))

    for y in range(cell.height):
        for x in range(cell.width):
            if seen[y][x]:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)

    bbox = cell.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError(f"No character foreground found for {name}")
    left, top, right, bottom = bbox
    margin = 5
    sprite = cell.crop((max(0, left - margin), max(0, top - margin), min(cell.width, right + margin), min(cell.height, bottom + margin)))
    sprite.save(ROOT / f"character-{name}.png", optimize=True)
    compact = sprite.copy()
    compact.thumbnail((96, 118), Image.Resampling.LANCZOS)
    compact.save(ROOT / f"character-{name}.webp", format="WEBP", quality=92, method=6)
    print(f"character-{name}", sprite.size, compact.size)
