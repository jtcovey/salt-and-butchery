# Salt & Butchery — Game Plan

## Vision

A dark party RPG set after the apocalypse. Inspired by R. Scott Bakker's *The Second Apocalypse* — the world after the No-God walks, civilization fractured, the Holy War's survivors scattered. J's own fiction, different names and details, same weight.

The game is to be played: structure, substance, meaningful choices.

**Party archetype**: An old wizard who was there — knows what happened, carries the guilt. A young warrior, Guts-type, the blade. Others TBD as the fiction grows.

---

## Current Engine

### Tech Stack
- **Phaser 4.1.0** + TypeScript 6 + Vite 8
- `Scale.RESIZE` — canvas fills entire viewport dynamically
- HTML5 Canvas rendering (no WebGL dependency)

### Coordinate System
Three-space system (`src/core/CoordinateSystem.ts`):
- **World units** — 1 unit ≈ 1 tabletop inch ≈ 5-6 fictional feet
- **Screen pixels** — actual canvas coordinates after viewport scaling
- **Percentage** — layout regions defined as 0-1 fractions of canvas

Layout regions (`src/config/constants.ts`):
- Top bar: 0-7% height (party HP display)
- Game area: 0-78% width, 7-100% height (battlefield)
- Side panel: 78-100% width, 7-100% height (actions, log, controls)

### Movement System
Circle-based free movement on a 60×40 tile grid arena:
- `FREE_MOVE = 8` units per turn (no stamina cost)
- `MOVE_PER_STAMINA = 8` additional units per stamina spent
- Max 1 stamina move per turn by default (`maxStaminaMoves` field, extensible for future abilities)
- Partial moves retain remaining distance — move circle shrinks proportionally
- Two-tier range display: green (free) inner circle, amber (stamina-paid) outer ring
- `ADJACENT_TOLERANCE = 0.5` units for melee range checks
- `UNIT_RADIUS = 0.6`, `MELEE_RANGE = 1.7` (2×radius + tolerance)
- **Collision detection**: ray-vs-circle intersection math stops movement at first blocking circle (other PCs, enemies, downed bodies, obstacles). Clicking toward a character moves up to touching distance. Units that start overlapping (placed adjacent) can move away from each other freely.
- **Terrain collision**: impassable tiles (rocks) block movement using a 0.3-unit margin check along the movement ray. This is smaller than the full 0.6 radius to prevent units at tile centers from getting stuck next to rocks.
- Undo move button — reverts position, stamina, and movement state (invalidated if action taken after move)

### Terrain & Level System
The game uses a hybrid approach: free circle-based movement over a tile-based terrain grid.

- **Grid**: 1 world unit = 1 tile. A 60×40 arena = 2400 tiles. Tile `[row][col]` = world rect `(col, row)` to `(col+1, row+1)`.
- **Tile types**: defined once in `src/config/terrain.ts` (`TILE_PROPS`). That table is the single source of truth for colour, passability, and LOS blocking — `TerrainRenderer` and `MovementSystem` both read from it, so adding a tile is one row, not three call sites.

  | Tile | id | Colour | Passable | Blocks LOS |
  |------|----|--------|----------|------------|
  | Grass | 0 | `#2a5a2a` | yes | no |
  | Rock | 1 | `#4a4a4a` | no | yes |
  | Forest | 2 | `#14301a` | yes | **yes** |
  | Road | 3 | `#6e6a5e` | yes | no |
  | Destroyed | 4 | `#9c8b6b` | yes | no |
  | Goblin Tracks | 5 | `#5a4732` | yes | no |

  Ids 0 and 1 are frozen — existing level files depend on them. Unknown ids fall back to grass so a malformed level degrades gracefully instead of crashing. Forest is passable but blocks physical ranged attacks, making woods real cover; magic still passes through.
- **Grid lines**: togglable via `GameOptions.showGrid` (press **G** in combat, or toggle in Options menu).
  Tile size is almost never a whole number of pixels — letterbox-fitting a 60x40 arena lands on values
  like 16.78px — so `TerrainRenderer` rounds every tile edge ONCE into `xs[]`/`ys[]` tables and draws
  both the tile fills and the grid lines from them. That guarantees the two agree (no seams) and that
  every line sits on a real pixel column. Lines are width 1 at +0.5 offset; the old 0.5px width had no
  reliable rasterisation and ~60% of lines vanished at any resolution where tile size was fractional.
- **Level files**: JSON in `public/levels/`, loaded by CombatScene via `fetch()`. Contains `terrainGrid`, `partySpawn` positions, and `enemies` array.
- **Line of Sight (DDA algorithm)**: physical ranged attacks (arrows, Trick Shot) are blocked by rock tiles. The ray traverses each grid cell between attacker and target — if any cell is impassable, the shot is blocked. Magic (Curse, Bless, Heal) passes through rocks. Melee/Frenzy ignores terrain.
- **A\* Pathfinding**: enemy AI uses grid-based A\* (Manhattan heuristic, 4-directional) to navigate around rocks. Archers move to get line of sight when blocked.

### Targeting & Range
- **Partial-radius targeting**: all targeted abilities (Attack, Trick Shot, Curse, Frenzy, Heal, Bless) can hit units *partially* inside their range circle. The check is `distance - target.radius <= range`, not center-to-center. If any part of the target's circle touches the red/green range indicator, they're a valid target.
- **Frenzy cone**: accounts for enemy radius in both distance and angle — uses `Math.asin(radius / dist)` angular radius so enemies partially inside the cone are hit.

### Battlefield Effects
- **Salt bodies**: enemies killed by Curse remain on the field as light gray circles. They don't block movement — when any unit moves through one, the body crumbles and leaves a **salt tile** (procedural scattered white/gray dots on the ground).
- **Blood tiles**: any HP damage (melee, ranged, frenzy, enemy attacks) drops a blood tile at the target's position (procedural red dot splatter). Blood persists for the rest of the encounter.
- **Procedural drawing**: both salt piles and blood splatters use a seeded RNG based on tile coordinates, so they look consistent across redraws but unique per tile. Drawn on the terrain layer (above grass, below units).

### Defeat Screen
When all heroes are beaten/killed, a "DEFEATED" overlay appears after the defeat SFX finishes playing — 85% black backdrop, red "DEFEATED" title, and an "ACCEPT DEATH" button that returns to the main menu.

### Combat System
- d8 for all rolls — attack = d8 + skill bonus, must exceed target AC to hit
- `RANGED_RANGE = 24` units for ranged attacks/spells
- Ward stacks absorb attacks (max 3), checked before attack roll
- Blessed status gives +1 to attack rolls for the round
- Beaten (0 HP) = prone, can't act, can be revived by healing. Attacked again while beaten = killed.

### Action System (`src/actions/`)
Each action has: `id`, `label`, `range`, `target`, optional `numericRange`, optional `attacks` (multi-attack), `staminaCost`, `canUse()`.

**Target types** determine UI behavior:
- `enemy` — enter targeting mode, show red range circle, click enemy to fire
- `ally` — enter targeting mode, show green range circle, click ally to fire
- `self` — executes immediately on button click (no targeting)
- `cone` — enter targeting mode, show rotating red 180° cone following mouse cursor, click to fire on all enemies in cone
- `area` — reserved for future "whirlwind" style abilities (hit all in range, click to confirm)

**Multi-attack** (`attacks` field): actions with `attacks > 1` keep the range circle visible between shots, allowing targeting of different enemies. Stamina paid once on first shot.

**Cancel**: any targeting action can be cancelled by clicking its button again (shows "CANCEL {ACTION}" text while active). Allows repositioning before committing.

### Class Abilities (Level 1)

| Class | Actions | Notes |
|-------|---------|-------|
| Warrior | ATTACK, FRENZY, DEFEND | Frenzy = cone AoE, 180° arc, melee range. 2 base HP. |
| Thief | ATTACK, TRICK SHOT, DEFEND | Trick Shot = 2 ranged attacks on separate targets. Uses BOW. |
| Sorcerer | ATTACK, CURSE, WARD, DEFEND | Curse = ranged instant kill on hit. Ward = absorb 1 attack, stacks to 3. |
| Cleric | ATTACK, HEAL, BLESS, DEFEND | Heal = touch range, revives beaten allies. Bless = ranged +1 rolls. |

**Defend**: +1 AC until next turn. All classes have ATTACK and DEFEND as universal basics.

### UI Components
- **UIButton** (`src/ui/UIButton.ts`): Phaser Container with Graphics bg. Hit area via Rectangle (no setSize). **Fires on pointerup, not pointerdown**, and only if the press started on this button — so dragging off cancels, and the button is still visible and hit-testable while the press is being routed. That second part matters: a button that hides itself in its own handler (a dialog's OK) used to disappear before the scene-level `pointerdown` ran, defeating the `hitTestPointer` click-through guard and letting the click fall through to the map behind it. States: normal, hover, pressed, disabled, selected (yellow highlight). Resize method updates hit area in place.
- **RangeIndicator** (`src/ui/RangeIndicator.ts`): draws circles (move, attack, heal) and cones (frenzy) via Phaser Graphics.
- **Combat log**: scrollable text in side panel with scrollbar, mouse wheel scrolling, auto-scroll to bottom. Reports all actions with stamina costs, roll details, move distances.

### Turn System
- **Free selection**: during player phase, click any active (non-beaten, non-done) PC to switch control freely
- **Per-PC end turn**: "END {NAME}'S TURN" button marks one PC as done (checkmark + dimmed in top bar). Enemy phase auto-starts when all PCs are done.
- PC selection requires clicking **inside** the circle (distance ≤ radius), not the tolerance zone — prevents accidental selection when moving near allies
- Auto End Turn option: when enabled, auto-ends a PC's turn once they've acted and hit 0 stamina

### SFX System (`src/systems/SFXSystem.ts`)
Sound effects tied to combat log reports — `logMsg()` takes an optional `SFXId` parameter, plays the sound at the moment the log entry appears.

12 sounds sourced from freesound.org (CC0): `hit`, `hitRanged`, `miss`, `bless`, `heal`, `curse`, `frenzy`, `deathHero`, `deathMonster`, `victory`, `defeat`, `levelUp`.

Volume controlled by `GameOptions.sfxVolume` (0.0–1.0, default 0.5). Audio files loaded on CombatScene create, cached so re-entering the scene doesn't reload.

### Options System (`src/config/GameOptions.ts`)
Global options singleton, toggled from OptionsScene:
- **God Mode** (off by default): heroes take no HP damage when hit
- **Auto End Turn** (off by default): auto-ends PC turn after action + 0 stamina
- **SFX Volume** (50% default): draggable slider in Options menu, 0–100%
- **Show Grid** (on by default): toggle gridlines on/off. Also accessible via **G** key in combat.

Options are accessible both from the main menu and from combat via the **"O" button** in the top-right corner. In combat, Options opens as an overlay (dark backdrop, combat paused) — closing it resumes combat exactly where you left off.

### Scene Flow
```
BootScene → MenuScene → PartyCreationScene → WorldMapScene → CombatScene
                ↓                                 ↕ (overlay)      ↕ (overlay)
          OptionsScene            OptionsScene / InventoryScene
```

All scenes extend **`BaseScene`** (`src/scenes/BaseScene.ts`), which owns the one
lifecycle every scene with layout needs: `reflow()` on canvas resize and on
overlay-resume, with listeners torn down on shutdown. Scenes override `reflow()`
and call `watchReflow()` once from `create()`.

Before this existed, each scene did it differently — `CombatScene` had an inline
resize lambda that was never removed, `OptionsScene` had a correct `reflow()`,
and `InventoryScene` had no resize handling at all. That divergence was the root
of three separate bugs.

- **PartyCreationScene**: 4 enabled slots by default (Ragnar/warrior, Skiv/thief, Aldric/sorcerer, S.Mara/cleric). Each slot is self-contained with name input, 2×2 class buttons, body type toggle. Slots 5-6 can be enabled by clicking. Max 1 sorcerer, max 1 cleric enforced.
- **OptionsScene**: toggle buttons for God Mode, Auto End Turn, and Show Grid, plus draggable SFX Volume slider. From main menu: full scene transition. From combat: launches as overlay (pauses combat, dark backdrop), BACK button resumes combat.
- **CombatScene**: loads the level named by `init({ levelFile })`, defaulting to `levels/TestMap1.json`. Wires all systems together. Modes: select → move → targeting. Input is gated on a `ready` flag until the level fetch resolves and `finishSetup()` has built `TurnSystem`/`AISystem` — clicking during load used to throw.
- **WorldMapScene**: loads a world map from `init({ mapFile })`, defaulting to `maps/WorldCH1.json`. See the World Map section below.

### Shared chrome — `src/ui/TopBar.ts`

The party bar across the top (name + HP per member, tinted by `pc.color`) plus the
INVENTORY and **O** buttons in its right corner. Used by both `CombatScene` and
`WorldMapScene`.

Combat's two additions — the ` ✓` turn-done marker and its dimmed alpha — come in
through an optional `decoratePC(pc)` hook rather than living in the component.
Dead (0.3) and beaten (0.5) dimming always take precedence over any decoration.
The world map passes no hook at all, since it has no turn state.

Button size is derived from the top bar's own height. It used to be derived from
`coords.scale`, which is the *arena* scale — that silently resized the chrome
whenever a scene's arena dimensions differed.

Shared button palettes live in `src/ui/UIButton.ts` as `BUTTON_BACK` and
`BUTTON_CHROME`; spread them into a config rather than retyping the colour block.

### Key Files
- `src/config/constants.ts` — all numeric constants (ranges, radii, LAYOUT regions, MAX_PARTY_SLOTS)
- `src/config/GameOptions.ts` — global options (godMode, autoEndTurn, sfxVolume, showGrid)
- `src/config/terrain.ts` — **tile table**: colour, passability, LOS blocking. Single source of truth
- `src/config/worldMap.ts` — location marker colours/glyphs, mirrored in the editor
- `src/core/CoordinateSystem.ts` — world↔screen↔percentage conversion; viewport region is injectable
- `src/core/Pathfinding.ts` — **shared grid A\***: 8-directional, octile heuristic, binary heap, no corner cutting. Used by combat AI and world map travel
- `src/core/WorldState.ts` — campaign state across scenes (map, party tile, completed encounters)
- `src/core/Dice.ts` — d8 roller
- `src/data/locations.ts` — location id → behaviour (encounter, reveal gate, blurb) + terrain reveal table
- `src/systems/MovementSystem.ts` — distance, adjacency, range, terrain collision, LOS (DDA), stamina cost. Pathfinding delegated to `core/Pathfinding`
- `src/systems/CombatSystem.ts` — attack resolution, curse, heal, ward, status effects
- `src/systems/TurnSystem.ts` — turn order, phase management, status cleanup
- `src/systems/AISystem.ts` — enemy decision-making, LOS-aware ranged AI, grid pathfinding
- `src/systems/SFXSystem.ts` — audio system, loads/plays sounds keyed by SFXId
- `src/entities/` — Character, PC, NPC, Inventory
- `src/actions/` — Action interface, classActions definitions
- `src/render/TerrainRenderer.ts` — grid tile rendering from the terrain table, optional gridlines. Used by combat *and* world map
- `src/render/UnitRenderer.ts` — circle-based unit rendering
- `src/render/WorldRenderer.ts` — overworld location markers, labels, party token, look cursor
- `src/render/CharacterSprites.ts` — mask tinting, layer compositing, texture cache
- `src/config/appearance.ts` — skin/cloth palettes, per-class defaults, randomiser
- `public/sprites/` — character layer art
- `src/scenes/BaseScene.ts` — shared resize/reflow lifecycle with listener teardown
- `src/ui/UIButton.ts` — reusable button component + `BUTTON_BACK` / `BUTTON_CHROME` palettes
- `src/ui/TopBar.ts` — shared party HP bar + INVENTORY/O buttons
- `src/ui/RangeIndicator.ts` — move/attack/heal range circles, frenzy cone
- `src/scenes/OptionsScene.ts` — options toggle UI, supports overlay mode from combat
- `public/levels/` — encounter JSON loaded by CombatScene
- `public/maps/` — world map JSON loaded by WorldMapScene
- `tools/map-editor.html` — standalone map editor, both modes (see Map Editor section below)

### Design Constraints
- `erasableSyntaxOnly: true` — no TypeScript enums, use string unions
- No `setSize()` on Phaser containers (causes hit area offset)
- `onClick` on `pointerdown` not `pointerup` (prevents reflow race conditions)
- Enter key for end turn (not Space — harder to press accidentally)

---

---

## Character Sprites

Art lives in `public/sprites/`, authored at **30×36** — the size it actually displays at,
so `pixelArt: true` in `main.ts` keeps it crisp rather than bilinear-blurred when the
arena scales up.

**Base body — 4 layers.** `BT{1,2}Skin/Prim/Sec.png` are white masks that get tinted
(skin, garments, boots/trim); `BT{1,2}Lines.png` is black line art over the top.

**Armour — 3 layers per set.** `BT{1,2}{Leather,Mail}{Prim,Sec,Lines}.png`, drawn over
the finished body. No skin layer, since armour covers it. Armour is tinted with the
character's *own* primary and secondary, so a hero's gear carries their colours.

Armour is chosen by equipped item id (`Inventory.equippedArmor()`) through
`ARMOR_BY_ITEM_ID` → `ARMOR_LAYERS`. A set whose art isn't drawn yet is simply absent
from `ARMOR_LAYERS` and renders as an unarmoured body rather than failing — so adding
a new armour tier is six files, one `SPRITE_FILES` block, and one `ARMOR_LAYERS` entry.

**Composited once, not tinted per frame.** `src/render/CharacterSprites.ts` bakes a
character's layers into a single cached texture keyed
`char:{bodyType}:{skin}:{primary}:{secondary}:{armour}`. Two reasons this beats `setTint()`:

- `main.ts` uses `Phaser.AUTO`, which falls back to Canvas where Phaser 4's tinting is
  emulated and unreliable. Compositing is renderer-agnostic.
- `UnitRenderer` rebuilds on every draw, so tinting would redo work that only changes
  when a character's colours change.

Tinting uses `globalCompositeOperation = 'source-in'` — the fill lands only where the
mask is opaque, preserving antialiased edges. Armour layers slot in later as extra
`drawImage` calls before the lines.

Identical appearances share one texture, so six party members cost at most six.

**Sizing.** Sprites draw *centred on the unit's circle* at `SPRITE_SCALE` (1.3) of its
diameter — the circle stays the mechanical footprint and the art overflows it,
Pac-Man style. Combat uses free circle movement, not tiles, so there is no tile to
stand on. Width tracks the circle; height follows the source aspect.

Anything without a texture — enemies, or a PC before loading completes — falls back to
the original filled circle and class letter, so units are never invisible.

Loading happens in `BootScene.preload()`, the project's only real preload phase. Every
later scene can assume the textures exist rather than racing them.

## Appearance & Party Creation

`src/config/appearance.ts` holds the palettes and per-class defaults:

| Class | Skin | Primary | Secondary |
|---|---|---|---|
| Warrior | mid tan | red | brown |
| Sorcerer | fair | blue | gold |
| Cleric | peach | purple | silver |
| Thief | peach | yellow | burnt orange |

Slots 5 and 6 have no class to inherit from, so they roll a random look on enable.

Each slot shows three swatches — skin, primary, secondary — under a "Colours" caption.
Clicking one opens a palette popup: skin swatches for skin, cloth swatches for the
other two. Click applies, Esc or a backdrop click cancels.

**Layering gotcha:** the name fields are real DOM `<input>` elements above the canvas,
so a Phaser popup renders *behind* them. The palette hides all six inputs while open
and `reflow()` restores them via `display = paletteTarget ? 'none' : 'block'`.

Picking a class re-seeds that slot's colours **only while `colorsTouched` is false** —
once the player picks a colour by hand, class changes stop overwriting it.

**Live sprite preview.** Each enabled slot renders its hero below the swatches, scaled
to fill the space left above the disable button (whole-number scaling so the 30×36 art
stays crisp — 5× at 720p, 8× at 1080p). It updates on every change because `reflow()`
already runs on every slot mutation, so colours, body type and class-granted armour all
track live. No class picked yet shows the bare body.

Armour in the preview comes from `startingGear(charClass)` in `src/data/items.ts` — the
same function party creation equips from. That was inline in `startGame()`; it was
extracted precisely so a preview can't drift from what the hero actually receives.

A PC's `color` (party bar tint, inventory header) is its **primary** colour rather than
`CLASS_COLOR`, so the bar entry matches the figure on the field. `CLASS_COLOR` remains
the seed default and still drives the class label in party creation.

`bodyType` now actually reaches the `PC` — it previously died in `startGame()`, so the
body-type toggle had never affected anything.

## World Map

The overworld. Same 60×40 tile grid as an encounter and the same terrain rules —
what changes is the scale of fiction (a tile is miles, not feet) and that the party
is a single token rather than individual characters. No camera and no zoom: the grid
letterbox-fits the viewport exactly as combat's does.

`LAYOUT.worldArea` gives the map the full width below the top bar, since there's no
side panel out here. `CoordinateSystem` takes its viewport region as a constructor
argument to allow that — it used to hardcode `LAYOUT.gameArea`.

**Rendering** reuses `TerrainRenderer` unchanged (`draw([], grid)`); it already reads
colours from the terrain table. `src/render/WorldRenderer.ts` draws the location
markers, their labels, the party token, and the look cursor.

**Controls**
- **Left-click any tile** — travel there along the shortest walkable route, one tile at a time (110ms per step). Any new click, a key press, right-click, or Esc cancels a walk in progress.
- **WASD** or **arrow keys** — step one tile. Impassable terrain blocks and reports what stopped you.
- **On-screen D-pad and LOOK** live in a **draggable panel**, bottom-left by default. Drag it by any bare part of the panel background; the buttons keep their own clicks because Phaser routes input top-only and the buttons sit at a higher depth than the drag handle. Position survives resizes and is clamped back on-screen if the window shrinks. The D-pad routes through the same `tryMove()` as the keys, so the two can't diverge.
- **L** or the **LOOK** button — look mode. Left-click any tile to report its type, whether it's impassable or blocks line of sight, and any location standing on it. **Right-click** or **Esc** cancels, per the rule that every targeting mode must be escapable.
- **I** inventory, **O** options — both return to the world map, not combat.

### Entering locations

Stepping onto a location tile launches its encounter, if it has one and it hasn't
already been won. `src/data/locations.ts` maps a location id to what it *does*:

```ts
lost_caravan: { encounter: 'levels/TestMap1.json', blurb: 'Wreckage on the road.' },
goblin_nest:  { revealedBy: 'lost_caravan' },
```

The editor only records identity — id, label, kind. This table is where identity
becomes behaviour, so adding a location to a map is a data change and giving it
behaviour is one row here.

### Reveals

Two things stay hidden until earned, both data-driven:

- **Locations** with a `revealedBy` are filtered out of rendering and hit-testing until
  that other location's encounter is won. The goblin nest doesn't exist to the player
  until they've found the caravan.
- **Terrain** listed in `TILE_REVEALS` is *disguised* rather than hidden. Goblin tracks
  render as plain destroyed ground until the caravan is cleared, then resolve into a
  trail leading to the nest.

Disguises are display-only. Pathfinding and movement always read the true grid, so a
disguise can never change what's walkable. Look mode deliberately reports the
*disguised* tile — the player shouldn't learn a secret by clicking it.

### The party marker

The party renders as the actual heroes rather than a plain token. `clusterLayout(n)`
in `WorldRenderer` packs them into a grid sized to the party and shrinks them to fit,
so the marker keeps the same footprint whatever the headcount:

| Alive | Arrangement | Scale |
|---|---|---|
| 1 | single figure, full size | 1.00 |
| 2 | side by side | 0.50 |
| 3 | two above, one centred below | 0.50 |
| 4 | 2×2 | 0.50 |
| 5 | three above, two centred below | 0.33 |
| 6 | 3×2 | 0.33 |

Partial rows are centred rather than left-aligned, and no size overlaps or spills past
the footprint. Dead members drop out and the survivors re-pack — a party worn down to
one hero shows that hero alone at full size. If art hasn't loaded yet, each member
falls back to a pip in their own colour.

## Towns

A town is a world map with a different `kind` — same loader, same scene, same movement,
click-to-travel and look mode. `WorldMapScene` branches on `mapKind` for the three things
that genuinely differ. Towns are small (24×18 vs 60×40), which is what makes them render
zoomed in: `setArena()` letterbox-fits whatever grid it gets.

**Entering.** A world map location with a `townMap` in `src/data/locations.ts` swaps the
map instead of launching combat. `WorldState.townReturn` remembers the world map and tile
so walking out puts the party back exactly where they left.

**Leaving.** Stepping onto *any walkable edge tile* exits — no exit marker needed. Town
maps just need an open border where you want people to be able to walk out.

Because of that rule, **pathfinding in town treats the border as a wall except for the
destination tile** (`travelGrid()`). A route is allowed to *end* on the border, never to
travel along it. Without that, clicking a spot on the far side of town could route through
the border ring and eject the party thirty tiles short of where they were going — which is
exactly what happened the first time this was tested on the real map. A side effect worth
knowing: a border tile with no walkable non-border neighbour is now genuinely unreachable
and reports "No route there", rather than being "reached" by walking you out of town.

The party lands on the world map tile *beyond* the town, in whichever direction they
walked out — `exitDirection()` reads that off which edge was crossed, and corners leave
diagonally. Landing back on the town itself meant stepping off and on again to re-enter,
which read as a bug. The target tile is only a request: the world map isn't loaded when
the exit fires, so `nearestStandableTile()` resolves it after the grid arrives and falls
back towards the town if the aimed-at tile is mountain or off the map. That guard now
covers every arrival, so a bad `partyStart` or encounter return can't strand the party
inside a rock either.

**The party in town.** The leader — party slot one — *is* the party: only they collide
and pathfind. Everyone else walks the ground the leader already covered. `WorldMapScene`
keeps a `trail` of the leader's recent positions, and follower N stands on `trail[N-1]`,
so the party strings out in a line as it moves. They're drawn back-to-front so the leader
overlaps whoever's behind. Straight after entering, the trail is empty and everyone
stacks on the leader; they spread out over the first few steps.

On a world map the party stays a single clustered group marker instead — `WorldRenderer`
takes explicit positions and the scene decides which layout applies, since a trail depends
on movement history the renderer can't see.

**NPCs are solid**, the way units are in combat. `navGrid` is the terrain grid with every
visible town NPC stamped as rock, and it — not `terrainGrid` — is what movement and
pathfinding read, so there is one answer to "can the party stand here" rather than a
passability rule per call site. World map locations stay walkable, since entering them
*is* the point; `isSolidNpc()` draws that line, and `exit` markers are exempt so a
placed exit still works.

**Talking.** Clicking an NPC issues a move order and opens their dialog **on arrival**,
not on click. `talkTarget` holds the pending speaker; `nearestApproachTile()` picks the
shortest-path walkable tile beside them (never a town edge tile, which would walk the
party out of town), and `stepTo()` fires the dialog as soon as the party is *beside*
them — so a route that happens to pass the NPC stops there instead of walking on.
Clicking an NPC already within reach talks immediately. Any manual move, a new travel
order, or right-click abandons the approach. Bumping an NPC with the keys or D-pad
reports "X is in the way" rather than a terrain name.

The dialog panel is bottom-centre and reused for every speaker: clicking the same NPC
again does nothing, a different one replaces the text, OK or Esc closes. Dialogs are
modal — movement, the D-pad and click-to-travel are all disabled while one is open, and
the control panel hides so it can't be clicked through an opaque overlay.

## Campaign State (`src/core/WorldState.ts`)

Mutable module singleton, same pattern as `GameOptions`. Holds what has to outlive a
single scene: the current map, the party's tile, the set of completed encounter ids,
and the party's **gold** (500 to start, shown in the inventory screen).

Gold is a shared purse rather than per-character — `canAfford()`, `spend()` which
refuses and changes nothing if it can't cover the cost, and `earn()`.

`PartyCreationScene` resets it all on a new game.

Scenes read and write it directly rather than threading state through every
`scene.start()`. It's what makes the party come back to the tile they left from.

## Victory and Defeat

`TurnSystem.checkVictory()` / `checkDefeat()` set the phase; `CombatScene` builds the
overlay. Both go through one `showEndOverlay(title, colour, button, onClick)` — they
differ only in wording and colour, and previously only defeat had an overlay at all.

- **Defeat** → `ACCEPT DEATH` → main menu.
- **Victory** → marks the encounter complete in `WorldState`, then `BACK 2 WORLD`
  returns the party to the tile that triggered it.

The destination is `CombatReturn` (`{ scene, mapFile?, tile? }`), passed via
`CombatScene.init({ encounterId, returnTo })`. Defaulting to the triggering tile is
just the default — set it explicitly to drop the party on a different map or tile
after a given fight.

## Map Editor (`tools/map-editor.html`)

A standalone HTML tool for building level files. No server needed — open the file directly in a browser.

The editor has three **modes**, toggled top-left:

- **Encounter** — tactical battle maps (`public/levels/*.json`). Party members placed individually. Default 60×40.
- **World Map** — overworld maps (`public/maps/*.json`). The party is a single token; you place travel destinations. Default 60×40.
- **Town** — town maps (`public/maps/*.json`). Same as world map but you place NPCs. Default **24×18**.

World Map and Town produce the *same file shape* — terrain, a party start, and identified
point markers — differing only in the `kind` field and the marker vocabulary. The game
loads both through one path.

**Grid size is per-map.** Set it in the toolbar and hit Apply; the grid resizes, keeping
tiles and markers that still fit and dropping the rest. This is what makes towns look
zoomed in: `CoordinateSystem` letterbox-fits whatever grid it's given, so a 24×18 town
renders tiles roughly 2.5× the size of a 60×40 world map — real zoom, no camera code.

Switching modes on an untouched map adopts that mode's default size. Loading a file
adopts the file's size rather than rejecting it.

Terrain painting is identical in all modes. Only the second palette tab changes.

### How to use
1. **Open** `tools/map-editor.html` in any browser (double-click or drag into browser). No server needed.
2. **Pick a mode**: Encounter or World Map.
3. **Paint terrain**: select a tile in the palette, click/drag on the grid. Shortcuts: **G** grass, **F** forest, **R** rock, **O** road, **B** destroyed, **T** goblin tracks, **X** clear.
4. **Place markers**: switch to the second tab.
   - *Encounter mode* (**Chars**): select a hero slot (1–6) or enemy type (**M** Skeleton Melee / **A** Skeleton Archer), then click a tile. Click an occupied tile to remove.
   - *World Map mode* (**Places**): **P** places the Party Start (one only). **L** places a Location — type a **Label**, pick a **Kind** (`town` / `encounter` / `dungeon` / `shop` / `rest`), then click a tile. The **ID is derived automatically from the label** (slugified) and shown read-only, so the two can never drift apart. Re-using a label moves that location rather than duplicating it. Click a placed marker to remove it.
5. **Save**: click **Save JSON** — downloads a `.json` file. Encounter maps go in `public/levels/`, world maps in `public/maps/`.
6. **Load**: click **Load JSON**. The editor sniffs the file and switches to the matching mode automatically.

Right-click erases the marker or terrain under the cursor without changing tools.

### Level file format
Files match the `EncounterData` type in `src/types/index.ts`:
```json
{
  "formatVersion": 1,
  "id": "level-name",
  "name": "Level Name",
  "arenaWidth": 60,
  "arenaHeight": 40,
  "tileSize": 1,
  "terrainGrid": [[0,0,1,...], ...],
  "partySpawn": [{"x": 5.5, "y": 20.5}, ...],
  "enemies": [{"type": "skeleton_melee", "x": 50.5, "y": 15.5}, ...],
  "obstacles": []
}
```
- `terrainGrid[row][col]`: tile id, see the tile table above
- Spawn coordinates use tile center (e.g. `5.5, 20.5` = center of tile at column 5, row 20)
- Enemy types: `skeleton_melee` (sword), `skeleton_archer` (bow)

### World map file format
Saved by the editor in World Map mode. Distinguished from encounters by `"kind": "worldmap"`:
```json
{
  "formatVersion": 1,
  "kind": "worldmap",
  "id": "chapter_1",
  "name": "Chapter 1",
  "width": 60,
  "height": 40,
  "tileSize": 1,
  "terrainGrid": [[0,0,2,3]],
  "partyStart": { "x": 10.5, "y": 20.5 },
  "locations": [
    { "id": "town", "label": "Town", "kind": "town", "x": 12.5, "y": 20.5 },
    { "id": "lost_caravan", "label": "Lost Caravan", "kind": "encounter", "x": 30.5, "y": 15.5 },
    { "id": "goblin_cave", "label": "Goblin Cave", "kind": "dungeon", "x": 45.5, "y": 28.5 }
  ]
}
```
- Same `terrainGrid` and coordinate conventions as encounters — the party walks the overworld on the same tile rules, just zoomed out as a single token.
- `id` is the routing key the game uses to decide what a location *does*. The editor only records identity; the mapping from id to scene/level lives in game code.
- `kind` is a hint for presentation and default behaviour, not a hard contract.
- Note: this is **not** the older `MapData`/`MapNode`/`MapConnection` node-graph shape in `src/types/index.ts`. Those types were never wired to anything and describe a different design (discrete nodes with explicit edges). They should be removed once the world map lands.

---

## Dungeons (`src/types/dungeon.ts`, `src/data/dungeonGen.ts`)

A dungeon is **one map holding several fights, with movement in between** — the first
thing in the game to break the "enter, kill everything, leave" assumption.

### It is not a separate scene

`CombatScene` gained an `explore` phase rather than growing a `DungeonScene` sibling. It
already owned the terrain grid, float-position units, collision, DDA line of sight,
pathfinding, the turn loop, the victory overlay and the side panel; a second scene would
have duplicated ~800 lines to gain nothing. `CombatScene.init` already accepted an
injected `levelData` (random encounters use it), so a dungeon travels the same path with
`rooms` and a per-spawn `group` tag added.

`GamePhase` is now `'explore' | 'player' | 'enemy' | 'victory' | 'defeat'`.

### Engagements, and the array you must not reassign

`TurnSystem` holds a **reference** to the enemies array and `checkVictory()` is just
`enemies.length === 0`. That is the whole mechanism:

- `CombatScene.groups` holds every pack in the dungeon, dormant.
- `this.enemies` holds **only the pack currently engaged**.
- Waking a pack splices its members in; clearing it empties the array, which reads as
  victory, which is intercepted and turned into "this engagement ended".

> **`this.enemies` must be mutated in place — `splice` / `length = 0` — never reassigned.**
> Reassigning orphans TurnSystem's reference and victory silently stops firing forever
> after. `cheatSkip()` did exactly this; it was harmless only because it called
> `onVictory()` directly, and would have broken the second engagement of any dungeon.

### No fog of war is required

A pack wakes on **proximity + line of sight** (`ACTIVATION_RADIUS = 7`, reusing the
existing DDA LOS so nothing wakes through rock). Dormant packs are drawn, so the player
can see what's ahead and choose when to walk into it — that *is* the tactical content of
explore mode. Fog and lighting are a later polish layer and were deliberately deferred by
B; nothing here depends on them.

### Movement

Leader plus follower trail, ported from `WorldMapScene`. `TRAIL_SPACING = 2` because
units are `UNIT_RADIUS 0.6` across — followers one tile apart would overlap by 0.2 and the
party would drop into combat already interpenetrating. Followers whose trail slot the
leader hasn't reached yet simply don't move, so the party files out of its starting
formation instead of teleporting into a column.

### The Goblin Nest

Structure fixed per B, with exactly one roll: which south branch holds the barracks and
which holds the garbage. `dungeonGen` emits a **room graph** carved into a grid — a real
random generator later emits the same shape and the scene never learns the difference.

```
ENTRANCE (4 goblin archers + 4 skeletons) ── tunnel east ──┬── south A ──┐
                                                           └── south B ──┤
                                    coin flip: one is BARRACKS (8+4),    │
                                               the other GARBAGE (dead end)
                                                    │ 2-wide passage
                                                    ▼
                            BOSS ROOM — shaman + 8 archers + 12 warriors
```

**Pack placement is clustered, not scattered.** Greedy placement over a uniformly
shuffled room spread the barracks out with its nearest two goblins 5 tiles apart — every
pair outside the 4-tile morale window, so the rout mechanic below could never once fire.
`tilesAroundCentre()` sorts candidates by distance from a centre instead. Measured after
the change: 1.7 routs per kill at the entrance, ~3.1 in the barracks, ~3.4 in the boss
room; tightest pair 2.0 tiles, zero overlaps over 400 generated maps.

**Room descriptions** fire once, when the leader crosses a room's trigger rect. Combat
rooms have none (B: they'd interrupt the approach). The boss room's trigger lives **in the
approach corridor, not at its doorway** — at the doorway it never fired, because the party
crosses the 7-tile activation line one row before the threshold and the fight always
opened first.

### Rewards and exit (B's calls)

Full heal between engagements, XP per engagement rather than one payout, and the party can
leave at any time with the nest **repopulating** on re-entry — no dungeon state is
persisted at all, at the accepted cost of a farmable entrance pack.

---

## Enemy types (`src/data/enemies.ts`)

One table, one spawn path (`spawnEnemy()`). Before it, every enemy in the game was
`hp: 1, ac: 3` and `CombatScene` decided "is it an archer?" by string-comparing the spawn
type.

**Rank and file sit exactly on the tested `hp 1 / ac 3` line.** Giving skeletons `hp 2 /
ac 4` to make them feel undead quietly doubled the difficulty of every random encounter
B had already playtested and signed off on. Only the shaman is built harder. Statblocks
here are invented — neither design doc gives monster stats — so they are guesses anchored
to the party's real HP curve (`Salt & Butchery.md:28`: warriors 2 HP, everyone else 1,
+1 per level).

### Morale — who can be routed

`morale: 'breaks' | 'steady'`, and it comes straight from the lore rather than balance.
`S&B Player's Glossary.md:105` describes undead as *"slow, shambling things. Mere slaves
to their creators will"* — nothing there can panic. Goblins carry the Faefolk's gregarious
nature "but twisted", and a social creature is exactly what breaks when its friend dies
beside it.

When any enemy dies, every surviving `breaks` enemy rolls:

```
chance% = 100 − 20 × tiles from the death      (adjacent 80%, 4 tiles 20%, beyond 4 none)
```

Distance is **rounded to whole tiles** first — units live at float positions, so two
standing shoulder to shoulder are 1.2 apart and would read as 76%. On a failure the NPC
gets `fleeTurns = d3` and `AISystem` moves it directly away from the nearest party member
instead of fighting. Fleeing is deliberately *not* pathfound: a panicking creature doesn't
route-plan, and being cornered is the correct outcome.

The shaman is `steady`, which costs nothing and gives the boss room a real answer beyond
"focus the nearest thing" — kill him first and twenty goblins become rout-prone, because
nothing left in the room is holding.

### The wall-break ambush

Six goblins sit in a sealed pocket above the boss room, on the far side from the corridor
the party came down. Rock blocks line of sight so they can never wake on proximity, and
they are **hidden from the renderer** — on a fog-free map a visible pack in a closed pocket
would advertise the whole thing. On turn 2 of the boss fight the marked wall tiles flip to
floor, `MovementSystem` is re-pointed at the mutated grid so pathing and LOS agree with
what's drawn, and they join the live roster behind the party. If the boss pack somehow dies
first, `onVictory` springs the ambush instead of resolving.

### Enemy phase pacing

The flat 500ms-per-enemy pause read fine for five skeletons; the boss room holds 21, which
is 10.5 seconds of watching per turn. Measured: deciding actions for the entire roster
costs about **1ms**, so the delay was the whole cost and pathfinding was never the problem.
It now compresses to fit `ENEMY_PHASE_BUDGET_MS` (5s), leaving fights of 10 or fewer
exactly as they were.

---

## Where this was left off (2026-07-25, `feature/world-map`)

Notes for whoever picks this up next — including a fresh Claude with none of the session
context.

**Verified running in Chrome** against the dev server: party creation with live sprite
preview, world map travel, entering the town, the draggable panel, walking up to an NPC
and talking, closing a dialog without the party moving, and leaving town by the south
edge (landing south of it on the world map). Map connectivity and layout maths were
separately verified by running the real functions over the real map files in node.

Two things were found *only* by running it, both now fixed — worth remembering that
"typechecks and builds" told us nothing about either:

- Clicking a destination on the far side of town routed the party through the border ring,
  which ejected them from the town thirty tiles short. Fixed by `travelGrid()`.
- Exiting town appeared to ignore the direction walked. The direction code was correct; the
  party was leaving via a *different edge* than the one intended, because of the above.

Combat was also checked: the Lost Caravan encounter loads from the world map, party
sprites render on the field, and `UIButton` still drives the ability panel (ATTACK enters
targeting and flips to CANCEL ATTACK).

**Decided (B, 2026-07-25): world map locations trigger when passed through, and that
stays.** Routing north past the town pulls the party in. B's call: a player will naturally
steer around a town, so it's a non-issue for a human — the reason it kept catching *me* is
that I was clicking exact tile coordinates from screenshots rather than playing. Do not
"fix" this into destination-only triggering without asking; walking into an encounter
while crossing the map is wanted behaviour.

**Still untested:** victory/defeat routing back from an encounter, resizing the window
mid-game, and the reveal chain (winning the caravan revealing the goblin tracks and nest).

**Deliberate calls a fresh reader might otherwise undo:**

- **S&B units are circles at float positions, not tile-locked.** Victory Rush's occupancy
  grid was looked at and deliberately *not* ported; only its diagonal movement was taken.
- **Pre-composited textures, never `setTint()`.** The renderer is `Phaser.AUTO` and can
  fall back to Canvas, where Phaser 4 tinting is emulated and unreliable.
- **`erasableSyntaxOnly: true`** — no TS enums anywhere. String unions instead.
- **Armour missing from `ARMOR_LAYERS` degrades to unarmoured** rather than throwing.
  That is how mail worked before its art existed; keep it.

**Known rough edges, not bugs:**

- The cleric reads as wearing mail. The wiring is correct — she gets leather — but her
  default silver secondary looks like metal at 30×36. It's a palette choice, not a bug.
- The procedural colours override more of the armour art than intended; the masks need
  reworking so armour keeps more of its own colour.
- `reportStandingOn()` overwrites the "Approaching X…" status on each step of a walk, so
  the status line flickers to the terrain name en route.

**The next feature in the queue** is the town economy: item prices (the design doc at
`GDproj/Salt & Butchery.md` has values — sword 2g, mail 10g, plate 50g; `Item` has no
`price` field yet), a shop UI on the vendor NPC, the Mayor's caravan quest dialog, and an
Inn with **Rest** and **Save** buttons. Saving is `localStorage`, **manual only, no
autosave** — B wants the player to control when a save is overwritten, which is why the
Inn has an explicit Save button rather than a checkpoint.

## Next Steps

### Immediate

#### 1. Graphics Pass
- [x] Layered character sprites with tintable skin/primary/secondary masks
- [x] Sprite-based `UnitRenderer` with circle fallback
- [x] Per-character colour customisation in party creation
- [ ] Enemy sprites (same four-layer structure)
- [ ] Armour layers composited over the base body as equipment changes
- [ ] Terrain tile sprites (replace solid color fills)
- [ ] Simple attack/heal/curse visual effects (flash, particle)

#### 2. SFX Pass
- [x] Tie sound effects to combat log events (SFXSystem)
- [x] Hit/miss/kill/heal/bless/curse/frenzy/victory/defeat sounds
- [x] SFX volume control in Options menu
- [ ] UI click sounds for buttons
- [ ] Turn transition audio cue

#### 3. Map Editor & Level Loading
- [x] Standalone HTML map editor (`tools/map-editor.html`)
- [x] Terrain grid rendering in combat (grass/rock tiles with gridlines)
- [x] CombatScene loads levels from JSON (`public/levels/`)
- [x] Movement blocked by impassable tiles
- [x] Line of sight for physical ranged attacks (DDA algorithm)
- [x] A* grid pathfinding for enemy AI
- [x] Options overlay accessible from combat ("O" button)
- [x] Terrain tile table centralised in `src/config/terrain.ts` (colour + passable + blocksLOS)
- [x] Forest, road, destroyed, and goblin-tracks tiles in editor and game
- [x] Map editor World Map mode — party start + generic location markers, auto-derived ids
- [x] `WorldMapScene` loads world map files and walks the party token
- [x] `CombatScene` accepts a level file via `init({ levelFile })` instead of hardcoding it
- [x] Replaced the unused `MapData`/`MapNode`/`MapConnection` node-graph types with `WorldMapData`/`WorldLocation`
- [x] `BaseScene` — shared resize/reflow lifecycle; fixed the never-removed resize listener
- [x] `TopBar` extracted and shared between combat and world map
- [x] `CoordinateSystem.setArena()` now actually called from the loaded grid
- [x] Input gated on `ready` — clicking during level load no longer throws
- [x] Defeat overlay survives a resize
- [x] `InventoryScene` reflows properly instead of using hardcoded pixels
- [x] Click-to-travel on the world map via shared A*
- [x] One grid A* (`core/Pathfinding.ts`) — 8-directional, binary heap, no corner cutting; replaced the 4-directional version that re-sorted its open list every pop
- [x] Locations launch encounters on entry; `WorldState` tracks completions
- [x] Victory overlay + `BACK 2 WORLD` return routing via `CombatReturn`
- [x] Data-driven reveals — hidden locations and disguised terrain
- [x] Map editor Town mode + variable grid size; load adopts a file's own dimensions
- [x] Towns as world maps with `kind: 'town'` — enter from a location, leave by any edge
- [x] Follower line in town; leader is the only collider
- [x] Solid NPCs (`navGrid`) and walk-up-then-talk dialogs
- [x] Draggable on-screen control panel (D-pad + LOOK)
- [x] `UIButton` fires on release, fixing click-through to the map behind a dialog
- [x] Exiting a town lands the party beyond it in the direction they walked out
- [ ] More tile types (water, lava, walls, doors)
- [ ] More enemy types in editor and spawner
- [ ] Goblin Nest encounter map (the location reveals but has no `encounter` yet)
- [ ] Retire the now-unused `victoryRoute` / `defeatRoute` fields on `EncounterData` — superseded by `CombatReturn`
- [ ] Audit `MenuScene` / `PartyCreationScene` layout math for hardcoded pixels
- [ ] Fog of war on world maps — deliberately deferred; forests reducing sight range through fog is the intended shape

#### 4. Town Economy & Saving
- [x] Party gold (`WorldState`, 500 to start, shown in the inventory screen)
- [x] `price` on `Item`; every value transcribed from the design doc's Equipment section
- [x] Full stock: 3 armours, 6 weapons, 4 consumables, with stat requirements enforced
- [x] `ShopScene` — per-character buying, purchases replace the equipped item
- [x] Dialog panel generalised to paragraphs + choice buttons
- [x] Mayor's caravan quest; `WorldState.acceptedQuests`; dialog changes after the encounter
- [x] Inn with **Rest** (5g, full heal incl. dead) and **Save**
- [x] `localStorage` save/load — manual only, versioned, items stored by id
- [ ] Wire **Continue** on the main menu to `loadGame()` (save works; nothing loads it yet)
- [x] Sell mode — SELL toggles the same list widget to the party's carried items,
      grouped by owner. Click anywhere on a row to sell; a cursor-following tooltip
      shows name, stats, value, owner, and whether the item is currently EQUIPPED
- [ ] `SELL_RATE` in ShopScene.ts is 1.0 (vendor pays full price). The design doc gives
      buy prices and says nothing about a markdown, so no rate was invented — change that
      one constant if the vendor should take a cut
- [ ] Silver→gold rate — the doc prices Oilpot at 25s and Lantern at 50s but never states
      a conversion, so both are deliberately unstocked rather than priced on a guess
- [ ] Optional save-code export/import (J's idea). Feasible now at roughly 300 bytes of
      state; gets less feasible the longer it's left

#### 5. XP, Levelling, Random Encounters
- [x] `xp` on PC; thresholds in `src/data/leveling.ts`. NOTE: the design doc has NO XP
      system ("Levels are awarded by the DM"), so the thresholds are OURS and labelled
      as such. Level effects ARE from the doc: +1 Max HP, +1 class skill, +1 Stamina on
      even levels, abilities unlock by level
- [x] Award is 100 + 5/enemy; level 2 = 140, exactly what TestMap1's 8 enemies pay
- [x] Victory overlay shows XP and per-character level-ups between title and button
- [x] Level 2 abilities implemented: Sling, Assassinate, Pishogue. Blitz, Lightning Bolt,
      Grapple and Consecrate need engine work and are documented in classActions.ts
- [x] Cheat 'S' skip button under 'O', gated on a new Options toggle
- [x] Random encounters: 0% after a fight, +10%/tile off-road, 50% cap, reset on trigger.
      **Roads never roll and reset to 0**, so the road is genuinely safe passage
- [x] `src/data/encounterGen.ts` — procedural maps, weighted formation table
      (Together 45 / Split 18 / Ambushed 15 / Scattered 12 / The Drop 10), ~⅓ archers.
      Seeded, so a bad map is reproducible from its number
- [x] Scales with party level: enemies are `level`d6 (L1 1d6, L2 2d6), and the map grows
      +25% per level (30x22 → 38x28 → 45x33) with rock and forest counts scaled by AREA,
      so cover density stays constant instead of thinning out
- [x] Spawn overlap fixed. Root cause was `clearSpawn` snapping to tile CENTRES — any two
      spawns in one tile collapsed onto the identical point. These units are circles at
      float positions, so the quantising was never needed. Now: keep the float position,
      only relocate off rock, then a relaxation pass separates every pair (party and
      enemies together). Rock and separation fight each other, so the two alternate until
      both hold. Verified 0 overlaps / 0 in-rock / 0 off-grid over 1500 maps per level, L1–L4
- [ ] Random encounters give no gold yet — only XP
- [ ] GameOptions isn't persisted, so the cheat toggle resets on every page reload

### Mid Term
- [ ] Levels 3-7 abilities for all classes (design doc has full progression)
- [ ] More enemy types (armored, magic, ranged variants)
- [ ] XP and leveling system
- [ ] Whirlwind ability for warrior (360° melee AoE, reserved in code as `area` target type)
- [ ] Equipment system — weapons/armor affect stats
- [ ] Lore/dialog layer

### Long Term
- [ ] Campaign structure with acts
- [ ] Overworld / party management between encounters
- [ ] The fiction: names, factions, the weight of what happened
