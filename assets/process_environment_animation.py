"""Build a four-frame, Pet-style animated environment atlas from the approved V4 art.

The source illustration remains the identity frame. Moving regions are isolated,
the vacated pixels are filled from the nearest static surroundings, and each
region is re-composited with a small stepped displacement. The result preserves
the approved town while giving the sky, sea, trees, and fountain real frame
changes rather than a single-image CSS/canvas transform.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "polis-terraces.png"
PNG_OUT = ROOT / "environment-animation.png"
WEBP_OUT = ROOT / "environment-animation.webp"
FRAME_W = 960
FRAME_H = 540
FRAME_COUNT = 4


def nearest_fill(rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Replace masked pixels with the nearest unmasked source pixel."""
    if not mask.any():
        return rgb.copy()
    indices = distance_transform_edt(mask, return_distances=False, return_indices=True)
    filled = rgb.copy()
    filled[mask] = rgb[indices[0][mask], indices[1][mask]]
    return filled


def alpha_layer(rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
    layer = np.zeros((*mask.shape, 4), dtype=np.uint8)
    layer[..., :3] = rgb
    layer[..., 3] = mask.astype(np.uint8) * 255
    return layer


def over(base: np.ndarray, layer: np.ndarray) -> np.ndarray:
    alpha = layer[..., 3:4].astype(np.float32) / 255.0
    out = base.astype(np.float32)
    out[..., :3] = layer[..., :3] * alpha + out[..., :3] * (1.0 - alpha)
    out[..., 3:4] = 255
    return np.clip(out, 0, 255).astype(np.uint8)


def shift_rows(layer: np.ndarray, shifts: np.ndarray) -> np.ndarray:
    out = np.zeros_like(layer)
    for y, amount in enumerate(shifts.astype(int)):
        out[y] = np.roll(layer[y], amount, axis=0)
    return out


def shift_xy(layer: np.ndarray, dx: int = 0, dy: int = 0) -> np.ndarray:
    out = np.roll(layer, (dy, dx), axis=(0, 1))
    if dx > 0:
        out[:, :dx] = 0
    elif dx < 0:
        out[:, dx:] = 0
    if dy > 0:
        out[:dy] = 0
    elif dy < 0:
        out[dy:] = 0
    return out


def main() -> None:
    source = np.asarray(Image.open(SOURCE).convert("RGBA"), dtype=np.uint8)
    rgb = source[..., :3]
    yy, xx = np.indices((FRAME_H, FRAME_W))
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    # Clouds: pale, low-saturation clusters confined to the open sky.
    cloud_mask = (yy < 76) & (r > 190) & (g > 195) & (b > 198) & ((rgb.max(2) - rgb.min(2)) < 58)

    # Peripheral foliage only. Architecture and trunks remain stable while the
    # canopy colors move by one or two pixels across the four-frame loop.
    side_groves = ((xx < 155) | (xx > 805)) & (yy < 505)
    foliage_mask = side_groves & (g > 52) & (g > r * 1.03) & (g > b * .82) & ((g - np.minimum(r, b)) > 12)

    # Fountain masonry, floor tiles, rails, and blue decorative plaques are all
    # deliberately excluded from masking. The approved fountain stays anchored;
    # only new water strokes are added per frame below.
    water_color = (b > 115) & (b > r * 1.08) & (g > r * 1.03)
    sea_water = (yy >= 86) & (yy <= 140) & water_color

    removable = cloud_mask | foliage_mask
    static_rgb = nearest_fill(rgb, removable)
    static = np.dstack([static_rgb, np.full((FRAME_H, FRAME_W), 255, dtype=np.uint8)])

    cloud_layer = alpha_layer(rgb, cloud_mask)
    foliage_layer = alpha_layer(rgb, foliage_mask)

    frames = []
    cloud_steps = (0, 3, 6, 3)
    canopy_steps = (0, 1, 2, 1)
    phases = (0.0, np.pi / 2, np.pi, 3 * np.pi / 2)

    for frame_index, phase in enumerate(phases):
        frame = static.copy()

        # Aegean water: keep every horizon, terrace, floor and rail pixel fixed.
        # Only small highlights inside pixels already classified as sea water
        # change from frame to frame.
        for band in range(9):
            y = 91 + ((band * 7 + frame_index * 3) % 45)
            x0 = (band * 109 + frame_index * 17) % 930
            length = 9 + (band % 4) * 4
            for x in range(x0, min(960, x0 + length)):
                if sea_water[y, x]:
                    frame[y, x, :3] = np.clip(frame[y, x, :3].astype(np.int16) + (16, 20, 17), 0, 255)

        frame = over(frame, shift_xy(cloud_layer, dx=cloud_steps[frame_index]))

        canopy_shift = canopy_steps[frame_index]
        canopy_rows = np.array([
            int(round(canopy_shift * (1.0 + .28 * np.sin(y * .17 + phase))))
            for y in range(FRAME_H)
        ])
        frame = over(frame, shift_rows(foliage_layer, canopy_rows))

        # Fixed-nozzle fountain cycle. The fountain and surrounding terrace are
        # copied unchanged from the source; only new stream branches, droplets,
        # and basin glints vary. Nothing is translated vertically.
        frame_image = Image.fromarray(frame, "RGBA")
        draw = ImageDraw.Draw(frame_image)
        bright = (218, 255, 249, 235)
        cyan = (111, 222, 232, 225)
        spurt_lines = (
            [((480, 268), (480, 247))],
            [((480, 268), (472, 251)), ((481, 268), (490, 250))],
            [((479, 268), (463, 255)), ((481, 268), (499, 254)), ((480, 266), (480, 246))],
            [((480, 268), (470, 250)), ((481, 268), (492, 251))],
        )[frame_index]
        droplets = (
            [(478, 243), (486, 250)],
            [(468, 247), (493, 246), (481, 241)],
            [(458, 253), (503, 252), (475, 243), (487, 244)],
            [(466, 248), (496, 249), (482, 243)],
        )[frame_index]
        for start, end in spurt_lines:
            draw.line((start, end), fill=cyan, width=2)
            draw.point(end, fill=bright)
        for x, y in droplets:
            draw.rectangle((x, y, x + 2, y + 2), fill=bright)
        ripple_y = 280 + (frame_index % 2) * 4
        ripple_x = 456 + frame_index * 7
        draw.line((ripple_x, ripple_y, ripple_x + 16, ripple_y), fill=cyan, width=2)
        frame = np.asarray(frame_image, dtype=np.uint8).copy()
        frames.append(frame_image)

    atlas = Image.new("RGBA", (FRAME_W * FRAME_COUNT, FRAME_H))
    for index, frame in enumerate(frames):
        atlas.alpha_composite(frame, (index * FRAME_W, 0))
    atlas.save(PNG_OUT, optimize=True)
    atlas.convert("RGB").save(WEBP_OUT, format="WEBP", quality=90, method=6)
    print(f"wrote {WEBP_OUT} ({atlas.width}x{atlas.height}, {FRAME_COUNT} frames)")


if __name__ == "__main__":
    main()
