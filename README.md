# The Polis of Hermes

A living ancient-Greek control surface for [Hermes Desktop](https://github.com/NousResearch/hermes-agent). Each Hermes profile appears as a distinct citizen with a configurable occupation, animated workplace, live session status, and native conversation controls.

## Features

- Animated 2.5D Mediterranean pixel-art polis
- One persistent citizen per Hermes profile
- Configurable occupations: herald, blacksmith, scholar, merchant, warrior, and scribe
- Genuine frame-by-frame character animation atlases inspired by the Hermes Pet animation model
- Occupation-specific idle, working, and waiting loops
- Live gateway-driven working, waiting, completion, failure, recent, idle, and offline states
- Concurrent-session activity cues and one-hour activity history
- Pet-style four-frame environment atlas for stepped sky, sea, tree-canopy, and fountain motion
- Secondary ambience for smoke, sparks, birds, and drifting pollen
- Silhouette-following selection glow instead of rectangular bounding boxes
- Continuous sandstone terrace paving replaces the former square occupation pads, with occupation-specific wear, directional cast shadows, reflected floor light, and painter-ordered upper/lower depth
- Illustrated Mediterranean nameplates and title plaque
- Clickable citizens, occupation persistence, and Hermes-native conversation opening
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
    ├── polis-terraces.webp       # Approved static environment source
    ├── environment-animation.webp # Four-frame 960×540 environment atlas
    ├── building-*.webp           # Occupation workplaces
    ├── character-*.webp          # Base occupation portraits
    ├── character-animation-*.webp
    ├── process_art.py
    ├── process_environment_animation.py
    └── process_character_animations.py
```

The runtime uses the compact WebP assets. PNG sources and generated intermediates are intentionally excluded from the repository.

## Character animation model

Each occupation atlas contains a 4×3 frame grid:

| Row | State | Behavior |
|---|---|---|
| 1 | Idle | Breathing, blinking, looking, and settling |
| 2 | Working | Occupation-specific work loop |
| 3 | Waiting | Attention and inspection gestures |

The live profile state selects a row, while deterministic per-profile timing prevents all citizens from animating in sync.

## Development

Validate the plugin syntax with:

```bash
node --check plugin.js
```

After editing, Hermes Desktop normally hot-reloads the plugin. If it does not, run **Reload desktop plugins** from the command palette.

The processing utilities require Python, Pillow, NumPy, and SciPy and are development-only. Their source-image paths should be adjusted before regeneration.

## Environment animation model

The environment uses a 4×1 atlas of complete 960×540 frames. The processor isolates clouds, sea texture, peripheral foliage, and fountain water from the approved illustration, fills the vacated pixels, then recomposites those regions at four stepped poses. The renderer clips one frame at a time using the same fixed-frame approach as Hermes Pets. Architecture, paths, tree trunks, and the fountain stonework remain anchored.

## Artwork and provenance

The bundled environment, buildings, and character assets are original project artwork generated and processed for The Polis of Hermes. External reference images are not bundled. Hermes Pets were used as an animation-system reference; no Hermes Pet sprites are copied into this project.

## License

MIT — see [LICENSE](LICENSE).
