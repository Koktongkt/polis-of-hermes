"""Build a four-frame, Pet-style animated environment atlas from the approved V4 art.

The source illustration remains the identity frame. Moving regions are isolated,
the vacated pixels are filled from the nearest static surroundings, and each
region is re-composited with a small stepped displacement. The result preserves
the approved town while giving the sky, sea, trees, and fountain real frame
changes rather than a single-image CSS/canvas transform.
"""
from pathlib import Path

import numpy as np
from PIL import Image
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

    # Fountain water is split into jet and basin so the jet lifts while the
    # basin ripples sideways.
    fountain_box = (xx > 405) & (xx < 555) & (yy > 225) & (yy < 325)
    water_color = (b > 115) & (b > r * 1.08) & (g > r * 1.03)
    fountain_mask = fountain_box & water_color
    fountain_jet = fountain_mask & (yy < 281)
    fountain_basin = fountain_mask & ~fountain_jet

    removable = cloud_mask | foliage_mask | fountain_mask
    static_rgb = nearest_fill(rgb, removable)
    static = np.dstack([static_rgb, np.full((FRAME_H, FRAME_W), 255, dtype=np.uint8)])

    cloud_layer = alpha_layer(rgb, cloud_mask)
    foliage_layer = alpha_layer(rgb, foliage_mask)
    jet_layer = alpha_layer(rgb, fountain_jet)
    basin_layer = alpha_layer(rgb, fountain_basin)

    frames = []
    cloud_steps = (0, 3, 6, 3)
    canopy_steps = (0, 1, 2, 1)
    jet_steps = (0, -2, -4, -2)
    phases = (0.0, np.pi / 2, np.pi, 3 * np.pi / 2)

    for frame_index, phase in enumerate(phases):
        frame = static.copy()

        # Aegean water: real stepped frame changes made from the original sea
        # texture, with independently moving scanline bands and glint pulses.
        sea = source[82:151].copy()
        for row in range(sea.shape[0]):
            shift = int(round(np.sin(row * .31 + phase) * 3 + np.sin(row * .09 - phase) * 2))
            sea[row] = np.roll(sea[row], shift, axis=0)
            if (row + frame_index * 5) % 13 == 0:
                sea[row, :, :3] = np.clip(sea[row, :, :3].astype(np.int16) + 5, 0, 255)
        frame[82:151] = sea

        frame = over(frame, shift_xy(cloud_layer, dx=cloud_steps[frame_index]))

        canopy_shift = canopy_steps[frame_index]
        canopy_rows = np.array([
            int(round(canopy_shift * (1.0 + .28 * np.sin(y * .17 + phase))))
            for y in range(FRAME_H)
        ])
        frame = over(frame, shift_rows(foliage_layer, canopy_rows))

        frame = over(frame, shift_xy(jet_layer, dx=(frame_index % 2), dy=jet_steps[frame_index]))
        basin_rows = np.array([
            int(round(np.sin(y * .55 + phase) * 2)) if 260 <= y <= 325 else 0
            for y in range(FRAME_H)
        ])
        frame = over(frame, shift_rows(basin_layer, basin_rows))
        frames.append(Image.fromarray(frame, "RGBA"))

    atlas = Image.new("RGBA", (FRAME_W * FRAME_COUNT, FRAME_H))
    for index, frame in enumerate(frames):
        atlas.alpha_composite(frame, (index * FRAME_W, 0))
    atlas.save(PNG_OUT, optimize=True)
    atlas.convert("RGB").save(WEBP_OUT, format="WEBP", quality=90, method=6)
    print(f"wrote {WEBP_OUT} ({atlas.width}x{atlas.height}, {FRAME_COUNT} frames)")


if __name__ == "__main__":
    main()
