from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
CACHE = Path.home() / "AppData" / "Local" / "hermes" / "cache" / "images"
OUTER = (143, 118, 372, 237)
INNER = (181, 151, 334, 202)


def source() -> Image.Image:
    return Image.open(ASSETS / "polis-terraces.webp").convert("RGB")


def border_mask() -> Image.Image:
    mask = Image.new("L", (960, 540), 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle(OUTER, fill=255)
    draw.rectangle(INNER, fill=0)
    return mask


def paving_fill(image: Image.Image) -> Image.Image:
    # Expand only the clean interior paving over the former border. Sampling
    # from inside the plot avoids pulling rails, planters, and retaining walls
    # into the fill, which nearest-neighbour inpainting would smear vertically.
    patch = image.crop(INNER).resize(
        (OUTER[2] - OUTER[0], OUTER[3] - OUTER[1]),
        Image.Resampling.BICUBIC,
    )
    filled = image.copy()
    filled.paste(patch, (OUTER[0], OUTER[1]))
    return filled


def soften_fill(original: Image.Image, filled: Image.Image) -> Image.Image:
    mask = border_mask().filter(ImageFilter.GaussianBlur(2.2))
    return Image.composite(filled, original, mask)


def variant(kind: str) -> Image.Image:
    original = source()
    clean = soften_fill(original, paving_fill(original))
    if kind == "remove":
        return clean

    draw = ImageDraw.Draw(clean, "RGBA")
    if kind == "broken":
        stones = [
            (153, 127, 188, 132), (218, 126, 250, 130), (322, 127, 357, 132),
            (155, 184, 160, 211), (352, 150, 357, 177),
            (158, 220, 190, 225), (238, 222, 268, 226), (326, 220, 357, 225),
        ]
        for box in stones:
            draw.rectangle(box, fill=(198, 167, 125, 135))
            draw.line((box[0], box[1], box[2], box[1]), fill=(238, 215, 174, 120), width=1)
        return clean

    # A flush one-pixel footprint seam keeps spatial organization without a raised pad.
    draw.rounded_rectangle((156, 129, 359, 225), radius=4, outline=(139, 111, 79, 105), width=1)
    return clean


def annotate(image: Image.Image, title: str) -> Image.Image:
    crop = image.crop((66, 86, 438, 266)).resize((744, 360), Image.Resampling.NEAREST)
    card = Image.new("RGB", (744, 404), (20, 24, 33))
    card.paste(crop, (0, 44))
    ImageDraw.Draw(card).text((16, 15), title, fill=(239, 229, 207))
    return card


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    cards = [
        annotate(source(), "CURRENT — raised pale occupation pad"),
        annotate(variant("remove"), "A — erase raised border; retain original paving (recommended)"),
        annotate(variant("broken"), "B — broken foundation remnants"),
        annotate(variant("seam"), "C — flush one-pixel footprint seam"),
    ]
    board = Image.new("RGB", (1488, 808), (20, 24, 33))
    for index, card in enumerate(cards):
        board.paste(card, ((index % 2) * 744, (index // 2) * 404))
    output = CACHE / "polis-p1-tile-prototypes.png"
    board.save(output, optimize=True)
    print(output)


if __name__ == "__main__":
    main()
