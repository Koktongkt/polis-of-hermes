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
- Calm environmental animation: sea currents, clouds, fountain water, smoke, particles, and slight asynchronous tree-canopy sway
- Clickable citizens, occupation persistence, and Hermes-native conversation opening
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
    ├── polis-terraces.webp    # Polis environment
    ├── building-*.webp        # Occupation workplaces
    ├── character-*.webp       # Base occupation portraits
    ├── character-animation-*.webp
    ├── process_art.py
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

The processing utilities require Python and Pillow and are development-only. Their source-image paths should be adjusted before regeneration.

## Artwork and provenance

The bundled environment, buildings, and character assets are original project artwork generated and processed for The Polis of Hermes. External reference images are not bundled. Hermes Pets were used as an animation-system reference; no Hermes Pet sprites are copied into this project.

## License

MIT — see [LICENSE](LICENSE).
