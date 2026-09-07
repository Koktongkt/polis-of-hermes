from __future__ import annotations

import unittest
from pathlib import Path

import numpy as np
from PIL import Image
from tests.render_visual_fixtures import render

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
BASELINE = Path(__file__).resolve().parent / "baselines" / "polis-depth-reference.png"


class EnvironmentIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with Image.open(ASSETS / "environment-animation.webp") as atlas:
            webp_atlas = np.asarray(atlas.convert("RGB"))
        cls.webp_atlas_shape = webp_atlas.shape
        cls.webp_frames = np.stack([webp_atlas[:, index * 960:(index + 1) * 960] for index in range(4)])
        yy, xx = np.indices((540, 960))
        cls.allowed_motion = (
            (yy < 76)
            | ((yy >= 86) & (yy <= 140))
            | (((xx < 158) | (xx > 802)) & (yy < 505))
            | ((xx >= 452) & (xx <= 507) & (yy >= 238) & (yy <= 287))
        )

    def test_environment_atlas_has_four_960_by_540_frames(self):
        self.assertEqual(self.webp_atlas_shape, (540, 3840, 3))
        self.assertEqual(self.webp_frames.shape, (4, 540, 960, 3))

    def test_runtime_webp_has_only_bounded_lossy_variation_outside_motion_regions(self):
        differences = np.max(
            np.abs(self.webp_frames.astype(np.int16) - self.webp_frames[0].astype(np.int16)),
            axis=(0, 3),
        )
        outside = differences[~self.allowed_motion]
        self.assertLessEqual(int(outside.max()), 32)
        self.assertLessEqual(float(np.percentile(outside, 99.9)), 12.0)

    def test_all_occupation_assets_have_expected_animation_grid(self):
        occupations = ("herald", "blacksmith", "scholar", "merchant", "warrior", "scribe")
        for occupation in occupations:
            with self.subTest(occupation=occupation):
                with Image.open(ASSETS / f"building-{occupation}.webp") as building:
                    self.assertGreater(building.width, 0)
                    self.assertGreater(building.height, 0)
                with Image.open(ASSETS / f"character-animation-{occupation}.webp") as character:
                    self.assertEqual(character.size, (384, 354))

    def test_reference_render_matches_committed_baseline(self):
        with Image.open(BASELINE) as baseline:
            expected = np.asarray(baseline.convert("RGB"))
        actual = np.asarray(render(fixed_depth=True))
        self.assertTrue(np.array_equal(actual, expected), "visual reference changed; inspect before updating baseline")

    def test_reference_renderer_is_deterministic(self):
        first = np.asarray(render(fixed_depth=True))
        second = np.asarray(render(fixed_depth=True))
        self.assertTrue(np.array_equal(first, second))


if __name__ == "__main__":
    unittest.main()
