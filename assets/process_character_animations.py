from collections import Counter, deque
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(r"C:/Users/Tan19/AppData/Local/hermes/desktop-plugins/polis-of-hermes/assets")
SOURCES = {
    "herald": Path(r"C:/Users/Tan19/AppData/Local/hermes/cache/images/openai_codex_gpt-image-2-medium_20260827_191425_7020675f.png"),
    "blacksmith": Path(r"C:/Users/Tan19/AppData/Local/hermes/cache/images/openai_codex_gpt-image-2-medium_20260827_191425_c710b433.png"),
    "scholar": Path(r"C:/Users/Tan19/AppData/Local/hermes/cache/images/openai_codex_gpt-image-2-medium_20260827_191422_8843705c.png"),
    "merchant": Path(r"C:/Users/Tan19/AppData/Local/hermes/cache/images/openai_codex_gpt-image-2-medium_20260827_191424_a1194a51.png"),
    "warrior": Path(r"C:/Users/Tan19/AppData/Local/hermes/cache/images/openai_codex_gpt-image-2-medium_20260827_191524_d97dda15.png"),
    "scribe": Path(r"C:/Users/Tan19/AppData/Local/hermes/cache/images/openai_codex_gpt-image-2-medium_20260827_191528_cfc30420.png"),
}
COLS, ROWS = 4, 3
CELL_W, CELL_H = 96, 118
PAD_X, PAD_Y = 5, 4


def dominant_corner(cell: Image.Image) -> tuple[int, int, int]:
    px = cell.convert("RGB")
    w, h = px.size
    samples = []
    for ox, oy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        for y in range(max(0, oy - 4), min(h, oy + 5)):
            for x in range(max(0, ox - 4), min(w, ox + 5)):
                samples.append(px.getpixel((x, y)))
    return Counter(samples).most_common(1)[0][0]


def remove_background(cell: Image.Image) -> Image.Image:
    rgba = cell.convert("RGBA")
    key = dominant_corner(rgba)
    saturated = max(key) - min(key) > 100
    px = rgba.load()
    w, h = rgba.size

    def candidate(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        if a < 16:
            return True
        if saturated:
            return ((r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2) ** 0.5 < 105
        # Generated transparent checkerboard: both light-neutral tiles satisfy this.
        return max(r, g, b) - min(r, g, b) <= 30 and min(r, g, b) >= 180

    seen = bytearray(w * h)
    remove = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h):
            continue
        idx = y * w + x
        if seen[idx]:
            continue
        seen[idx] = 1
        if not candidate(x, y):
            continue
        remove[idx] = 255
        q.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))

    mask = Image.frombytes("L", (w, h), bytes(remove))
    clear = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    return Image.composite(clear, rgba, mask)


def keep_subject_components(image: Image.Image) -> Image.Image:
    """Drop detached checker residue/ground crumbs while preserving the character."""
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    w, h = rgba.size
    apx = alpha.load()
    seen = bytearray(w * h)
    components: list[list[tuple[int, int]]] = []
    for sy in range(h):
        for sx in range(w):
            idx = sy * w + sx
            if seen[idx] or apx[sx, sy] <= 20:
                continue
            q: deque[tuple[int, int]] = deque([(sx, sy)])
            seen[idx] = 1
            comp: list[tuple[int, int]] = []
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        ni = ny * w + nx
                        if not seen[ni] and apx[nx, ny] > 20:
                            seen[ni] = 1
                            q.append((nx, ny))
            components.append(comp)
    if not components:
        return rgba
    largest = max(len(comp) for comp in components)
    keep = {point for comp in components if len(comp) >= largest * .12 for point in comp}
    out_alpha = Image.new("L", (w, h), 0)
    opx = out_alpha.load()
    for x, y in keep:
        opx[x, y] = apx[x, y]
    rgba.putalpha(out_alpha)
    return rgba


def build_atlas(name: str, source: Path) -> None:
    sheet = Image.open(source).convert("RGBA")
    source_copy = ROOT / f"generated-character-animation-{name}.png"
    sheet.save(source_copy, optimize=True)
    cw, ch = sheet.width // COLS, sheet.height // ROWS
    frames: list[Image.Image] = []
    bounds: list[tuple[int, int, int, int]] = []
    for row in range(ROWS):
        for col in range(COLS):
            frame = sheet.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))
            frame = keep_subject_components(remove_background(frame))
            bbox = frame.getchannel("A").getbbox()
            if not bbox:
                raise RuntimeError(f"No foreground in {name} frame {row}:{col}")
            frames.append(frame.crop(bbox))
            bounds.append(bbox)

    max_w = max(frame.width for frame in frames)
    max_h = max(frame.height for frame in frames)
    ratio = min((CELL_W - PAD_X * 2) / max_w, (CELL_H - PAD_Y * 2) / max_h)
    atlas = Image.new("RGBA", (CELL_W * COLS, CELL_H * ROWS), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        w = max(1, round(frame.width * ratio))
        h = max(1, round(frame.height * ratio))
        resized = frame.resize((w, h), Image.Resampling.LANCZOS)
        col, row = index % COLS, index // COLS
        x = col * CELL_W + (CELL_W - w) // 2
        y = row * CELL_H + CELL_H - PAD_Y - h
        atlas.alpha_composite(resized, (x, y))

    atlas.save(ROOT / f"character-animation-{name}.png", optimize=True)
    atlas.save(ROOT / f"character-animation-{name}.webp", format="WEBP", lossless=True, method=6)
    print(name, sheet.size, atlas.size, "alpha", atlas.getchannel("A").getextrema())


for occupation, path in SOURCES.items():
    build_atlas(occupation, path)
