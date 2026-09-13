# Universal LPC Hermes concept 01

A review-only character study for changing **The Polis of Hermes** citizens from detailed painterly figures to compact, cute LPC sprites. It does not change the live plugin renderer yet.

## Character recipe

- Body: Human Male, light
- Face: Neutral, light
- Hair: Curly short 2, blonde
- Torso: Longsleeve 2, white
- Legs: Legion skirt, blue
- Feet: Sandals, brown
- Headwear: Thick Headband, yellow/gold
- Cape: Solid, blue

The exact generator state is preserved in `hermes-lpc-selection.json`. The generated full sheet is `hermes-lpc-full-spritesheet.png`; `build_concept.py` deterministically extracts the down-facing LPC frames used in `hermes-lpc-polis-atlas.png` and builds the review board.

## Prototype animation contract

The review atlas is a 4×3 grid of 64×64 cells:

| Row | Polis state | LPC source |
|---|---|---|
| 1 | Idle | Down-facing Idle frames 0, 1, 0, 1 |
| 2 | Working / dispatch | Down-facing Spellcast frames 0–3 |
| 3 | Waiting / movement study | Down-facing Walk frames 1–4 |

## Provenance and licensing

Generated with the [Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator), repository revision `d44ea7d69`.

The generator software is GPL-3.0. Individual sprite layers have their own licenses and attribution requirements. This folder preserves the generator-produced `CREDITS.txt` and `CREDITS.csv`; those files are authoritative for the exact layers used here. Do not treat the parent project's MIT license as replacing the art licenses in this folder.
