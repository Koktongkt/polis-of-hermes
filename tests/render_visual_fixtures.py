from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
BASELINES = Path(__file__).resolve().parent / "baselines"
CACHE = Path.home() / "AppData" / "Local" / "hermes" / "cache" / "images"
SITES = ((74, 76), (246, 76), (74, 146), (246, 146))
OCCUPATIONS = ("herald", "scholar", "merchant", "blacksmith")


def building_placement(site: tuple[int, int], image: Image.Image) -> tuple[int, int, int, int]:
    max_w = 245 if site[1] < 100 else 255
    max_h = 205 if site[1] < 100 else 195
    ratio = min(max_w / image.width, max_h / image.height)
    width = round(image.width * ratio)
    height = round(image.height * ratio)
    floor_front = 243 if site[1] < 100 else 440
    sprite_base = floor_front - 20
    return site[0] * 3 - round(width / 2), sprite_base - height, width, height


def character_placement(site: tuple[int, int], occupation: str, centralize_upper: bool) -> tuple[int, int, int, int]:
    target_h = 100 if occupation == "warrior" else 94
    width = round(96 * (target_h / 118))
    if centralize_upper and site[1] < 100:
        center_x = site[0] * 3 + (160 if site[0] < 160 else -160)
    else:
        center_x = site[0] * 3 - 60
    baseline = site[1] * 3 + 27
    return round(center_x - width / 2), round(baseline - target_h), width, target_h


def load_layers():
    environment = Image.open(ASSETS / "environment-animation.webp").convert("RGBA").crop((0, 0, 960, 540))
    layers = []
    for site, occupation in zip(SITES, OCCUPATIONS, strict=True):
        building = Image.open(ASSETS / f"building-{occupation}.webp").convert("RGBA")
        atlas = Image.open(ASSETS / f"character-animation-{occupation}.webp").convert("RGBA")
        character = atlas.crop((0, 0, 96, 118))
        layers.append((site, occupation, building, character))
    return environment, layers


def paste_scaled(canvas: Image.Image, image: Image.Image, box: tuple[int, int, int, int]) -> None:
    x, y, width, height = box
    resized = image.resize((width, height), Image.Resampling.LANCZOS)
    canvas.alpha_composite(resized, (x, y))


def render(fixed_depth: bool) -> Image.Image:
    environment, layers = load_layers()
    canvas = environment.copy()
    if fixed_depth:
        for upper in (True, False):
            row = [layer for layer in layers if (layer[0][1] < 100) is upper]
            for site, _, building, _ in row:
                paste_scaled(canvas, building, building_placement(site, building))
            for site, occupation, _, character in row:
                paste_scaled(canvas, character, character_placement(site, occupation, True))
    else:
        for site, _, building, _ in layers:
            paste_scaled(canvas, building, building_placement(site, building))
        for site, occupation, _, character in layers:
            paste_scaled(canvas, character, character_placement(site, occupation, False))
    return canvas.convert("RGB")


def main() -> None:
    BASELINES.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    after = render(fixed_depth=True)
    after.save(BASELINES / "polis-depth-reference.png", optimize=True)

    before = render(fixed_depth=False)
    comparison = Image.new("RGB", (1920, 590), (20, 24, 33))
    comparison.paste(before, (0, 50))
    comparison.paste(after, (960, 50))
    draw = ImageDraw.Draw(comparison)
    draw.text((24, 17), "BEFORE: all buildings, then all citizens", fill=(235, 226, 204))
    draw.text((984, 17), "AFTER: upper terrace, then lower terrace", fill=(235, 226, 204))
    comparison.save(CACHE / "polis-p1-depth-comparison.png", optimize=True)
    print(BASELINES / "polis-depth-reference.png")
    print(CACHE / "polis-p1-depth-comparison.png")


if __name__ == "__main__":
    main()
