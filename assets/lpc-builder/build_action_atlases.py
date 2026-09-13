"""Build compact directional/action atlases from LPC full sheets.

Export the four ignored ``assets/*-full-spritesheet.png`` files with the
Universal LPC generator at revision d44ea7d69, then run this script.
"""

from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parents[1]
FRAME_SIZE = 64
SHEET_COLUMNS = 13
ACTION_ROW_GROUPS = (
    ("idle", 22, 4),
    ("walk", 8, 4),
    ("spellcast", 0, 4),
    ("emote", 34, 4),
    ("jump", 26, 4),
    ("sit", 30, 4),
    ("hurt", 20, 1),
)
CHARACTERS = (
    ("hermes", "lpc-hermes-example/hermes-lpc-polis-atlas.png"),
    ("aivory", "lpc-review-batch/aivory/aivory-polis-atlas.png"),
    ("cody", "lpc-review-batch/cody/cody-polis-atlas.png"),
    ("alpha-sage", "lpc-review-batch/alpha-sage/alpha-sage-polis-atlas.png"),
)


def build_atlas(source: Path, destination: Path) -> None:
    with Image.open(source) as sheet:
        expected = (SHEET_COLUMNS * FRAME_SIZE, 54 * FRAME_SIZE)
        if sheet.size != expected:
            raise ValueError(f"{source} must be {expected[0]}x{expected[1]}, got {sheet.size}")
        rows = sum(count for _, _, count in ACTION_ROW_GROUPS)
        atlas = Image.new("RGBA", (SHEET_COLUMNS * FRAME_SIZE, rows * FRAME_SIZE))
        destination_row = 0
        for _, source_row, count in ACTION_ROW_GROUPS:
            box = (0, source_row * FRAME_SIZE, atlas.width, (source_row + count) * FRAME_SIZE)
            atlas.paste(sheet.crop(box), (0, destination_row * FRAME_SIZE))
            destination_row += count
        destination.parent.mkdir(parents=True, exist_ok=True)
        atlas.save(destination, optimize=True)


def main() -> None:
    for name, output in CHARACTERS:
        source = ASSETS / f"{name}-full-spritesheet.png"
        destination = ASSETS / output
        build_atlas(source, destination)
        print(f"{name}: {destination.relative_to(ASSETS)}")


if __name__ == "__main__":
    main()
