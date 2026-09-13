# The Polis of Hermes

A living ancient-Greek control surface for [Hermes Desktop](https://github.com/NousResearch/hermes-agent). Each Hermes profile appears as a distinct citizen with a configurable occupation, animated workplace, live session status, and native conversation controls.

## Features

- Animated Mediterranean LPC pixel-art polis
- One persistent citizen per Hermes profile
- Configurable occupations: herald, blacksmith, scholar, merchant, warrior, and scribe
- Profile-specific frame-by-frame LPC character animation atlases
- Occupation-specific idle, working, and waiting loops
- Live gateway-driven working, waiting, completion, failure, recent, idle, and offline states
- Concurrent-session activity cues and one-hour activity history
- Silhouette-following selection glow instead of rectangular bounding boxes
- Clickable citizens, occupation persistence, Hermes-native conversation opening, and direct messaging into either the latest visible conversation or a fresh chat
- Compact resizable agent panel with a persisted user-selected width
- Expandable per-agent action cards with live status and one-hour activity logs
- Theme-aware controls and a craft/character dropdown
- Optional sound, disabled by default

## Installation

1. Download or clone this repository.
2. Place the repository folder at:

   ```text
   <HERMES_HOME>/desktop-plugins/polis-of-hermes/
   ```

   On a default Windows installation this is usually:

   ```text
   C:\Users\<you>\AppData\Local\hermes\desktop-plugins\polis-of-hermes\
   ```

3. In Hermes Desktop, open the command palette and run **Reload desktop plugins**.
4. Select **Polis** in the sidebar.

No package installation or build step is required. The plugin is plain JavaScript and uses the Hermes Desktop Plugin SDK supplied by the app.

## Structure

```text
polis-of-hermes/
├── plugin.js                  # Plugin UI, state model, and canvas renderer
└── assets/
    ├── lpc-builder/sources/image_c76574.png # Current canonical community
    ├── lpc-hermes-example/                  # Hermes atlas + credits
    └── lpc-review-batch/                    # Aivory, Cody, Alpha Sage atlases + credits
```

The runtime has one visual system: the canonical LPC community and its four
profile-specific citizen atlases. Exact generator selections and per-layer
credits remain beside the runtime atlases for reproducibility and attribution.

## Character animation model

Each occupation atlas contains a 4×3 frame grid:

| Row | State | Behavior |
|---|---|---|
| 1 | Idle | Breathing, blinking, looking, and settling |
| 2 | Working | Occupation-specific work loop |
| 3 | Waiting | Attention and inspection gestures |

The live profile state selects a row, while deterministic per-profile timing prevents all citizens from animating in sync.

Each citizen's identity is profile-based and independent from the occupation
selector. The 64×64 LPC cells use nearest-neighbour rendering to preserve pixel
clusters. Occupation labels and activity descriptions remain configurable.

## Development

Validate the plugin syntax with:

```bash
node --check plugin.js
```

After editing, Hermes Desktop normally hot-reloads the plugin. If it does not, run **Reload desktop plugins** from the command palette.

## Testing

Run the deterministic interaction and scene-order tests with:

```bash
node --test tests/polis.test.mjs
```

Run the visual and asset-integrity suite with:

```bash
python -m unittest tests/test_visual_regression.py -v
```

The visual suite verifies the canonical environment dimensions and all four
profile animation atlases. The Node suite also enforces that no older renderer
or older runtime art path can return.

## Artwork and provenance

The profile sprites are generated from the Universal LPC Spritesheet
Character Generator. Their exact selections, upstream revision, and
generator-produced credits are preserved under `assets/lpc-hermes-example/`
and `assets/lpc-review-batch/`. The licenses recorded for individual LPC layers
govern those files and are not replaced by the plugin's MIT license. The
canonical environment is currently a provided review reference with unresolved
provenance and must not be redistributed until that provenance is resolved.

## License

MIT — see [LICENSE](LICENSE).
