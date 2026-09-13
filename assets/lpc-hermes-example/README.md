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

The exact generator state is preserved in `hermes-lpc-selection.json`. Export a
full sheet from Universal LPC revision `d44ea7d69` as
`assets/hermes-full-spritesheet.png`; the shared atlas builder then extracts the
runtime actions into `hermes-lpc-polis-atlas.png`. Full sheets are ignored build
inputs rather than runtime assets.

## Runtime animation contract

The runtime atlas is a 13×25 grid of 64×64 cells, extracted from the full LPC
sheet by `../lpc-builder/build_action_atlases.py`:

| Rows | Polis state | LPC source |
|---|---|---|
| 1–4 | Idle | Four directions of LPC Idle |
| 5–8 | Roaming | Four directions of LPC Walk |
| 9–12 | Working | Four directions of LPC Spellcast |
| 13–16 | Waiting / ambient | Four directions of LPC Emote |
| 17–20 | Complete | Four directions of LPC Jump |
| 21–24 | Rest | Four directions of LPC Sit |
| 25 | Failed | LPC Hurt |

## Provenance and licensing

Generated with the [Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator), repository revision `d44ea7d69`.

The generator software is GPL-3.0. Individual sprite layers have their own licenses and attribution requirements. This folder preserves the generator-produced `CREDITS.txt` and `CREDITS.csv`; those files are authoritative for the exact layers used here. Do not treat the parent project's MIT license as replacing the art licenses in this folder.
