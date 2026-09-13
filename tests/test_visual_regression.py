from __future__ import annotations

import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"



class EnvironmentIntegrityTests(unittest.TestCase):
    def test_canonical_environment_has_expected_dimensions(self):
        with Image.open(ASSETS / "lpc-builder" / "sources" / "polis-bright-bazaar-combined.png") as environment:
            self.assertEqual(environment.size, (1001, 1765))

    def test_expanded_environment_preserves_the_original_core_pixel_for_pixel(self):
        with (
            Image.open(ASSETS / "lpc-builder" / "sources" / "image_c76574.png") as original,
            Image.open(ASSETS / "lpc-builder" / "sources" / "polis-bright-bazaar-combined.png") as expanded,
        ):
            self.assertEqual(
                expanded.convert("RGBA").crop((0, 0, 1001, 817)).tobytes(),
                original.convert("RGBA").tobytes(),
            )

    def test_current_profile_atlases_have_expected_animation_grid(self):
        atlases = (
            ASSETS / "lpc-hermes-example" / "hermes-lpc-polis-atlas.png",
            ASSETS / "lpc-review-batch" / "aivory" / "aivory-polis-atlas.png",
            ASSETS / "lpc-review-batch" / "cody" / "cody-polis-atlas.png",
            ASSETS / "lpc-review-batch" / "alpha-sage" / "alpha-sage-polis-atlas.png",
        )
        for atlas_path in atlases:
            with self.subTest(atlas=atlas_path.name), Image.open(atlas_path) as atlas:
                rgba = atlas.convert("RGBA")
                self.assertEqual(rgba.size, (256, 192))
                for row in range(3):
                    frames = [
                        rgba.crop((column * 64, row * 64, (column + 1) * 64, (row + 1) * 64))
                        for column in range(4)
                    ]
                    self.assertTrue(all(frame.getbbox() for frame in frames))
                    self.assertGreaterEqual(len({frame.tobytes() for frame in frames}), 2)

if __name__ == "__main__":
    unittest.main()
