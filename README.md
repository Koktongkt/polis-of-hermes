# The Polis of Hermes

A living ancient-Greek control surface for [Hermes Desktop](https://github.com/NousResearch/hermes-agent). Each Hermes profile appears as a distinct citizen with a configurable occupation, animated workplace, live session status, and native conversation controls.

## Features

- Animated Mediterranean LPC pixel-art polis
- One persistent citizen per Hermes profile
- Configurable occupations: herald, blacksmith, scholar, merchant, warrior, and scribe
- Profile-specific frame-by-frame LPC character animation atlases
- Environment-aware ambient roaming from upper workplaces through the lower bazaar on authored stone and grass routes
- Realistic dwell-first behavior: citizens spend most of their time stationed and occasionally take a short purposeful walk
- Toggleable world-geometry overlay showing walkable ground, blocked buildings/ornaments, occlusion areas, routes, and stations
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
    ├── lpc-builder/sources/polis-bright-bazaar-combined.png # Current expanded canonical community
    ├── lpc-hermes-example/                  # Hermes atlas + credits
    └── lpc-review-batch/                    # Aivory, Cody, Alpha Sage atlases + credits
```

The runtime has one visual system: the canonical LPC community and its four
profile-specific citizen atlases. Exact generator selections and per-layer
credits remain beside the runtime atlases for reproducibility and attribution.

## Character animation model

Each citizen atlas contains a 13×25 LPC action grid. Directional actions use
four rows in the native LPC order (north, west, south, east), so a walking
citizen turns their whole body toward the route instead of sliding sideways
while looking forward.

| Rows | Action | Behavior |
|---|---|---|
| 1–4 | Idle | Directional breathing and settling |
| 5–8 | Walk | Eight-frame directional locomotion |
| 9–12 | Working | Directional spellcast/craft loop |
| 13–16 | Waiting / ambient | Directional attention gestures |
| 17–20 | Complete | Directional celebratory jump |
| 21–24 | Sit | Reserved rest action |
| 25 | Failed | Hurt/recovery loop |

Like Hermes Pet reactions, live profile state selects a distinct action while
deterministic per-profile timing prevents all citizens from animating in sync.
Idle citizens also occasionally gesture while dwelling at a station.

Idle and recently active citizens may roam along conservative, authored navigation edges that connect every upper workplace to the lower bazaar. The working `default` orchestrator also patrols the full route, so the profile that is normally active is not permanently pinned to the upper layout. Routes use only labelled stone tiles and grass patches; footprint collision bounds exclude fences, stalls, crates, carts, tables, monuments, and ornaments. Other working citizens—and all waiting, failed, and offline citizens—remain at their home environment object so ambient movement never obscures real agent state. Citizen drawing, depth order, selection, and hit testing all use the same live foot position.

Use **World geometry** in the Polis header to inspect the authored map: green areas are safe ground, red areas block character feet, purple areas mark visual occlusion, blue lines are approved routes, and yellow points are semantic stations. Collision tests the citizen's feet rather than the full sprite, allowing natural visual overlap without walking through buildings, monuments, stalls, or ornaments.

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
