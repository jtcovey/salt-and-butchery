# Salt & Butchery — Game Plan

## Vision

A dark party RPG set after the apocalypse. Inspired by R. Scott Bakker's *The Second Apocalypse* — the world after the No-God walks, civilization fractured, the Holy War's survivors scattered. J's own fiction, different names and details, same weight.

The game is to be played: structure, substance, meaningful choices.

**Party archetype**: An old wizard who was there — knows what happened, carries the guilt. A young warrior, Guts-type, the blade. Others TBD as the fiction grows.

---

## Current Engine (engine-rewrite branch)

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
- **Tile types**: `0` = grass (passable, dark green `#2a5a2a`), `1` = rock (impassable, dark gray `#4a4a4a`).
- **Grid lines**: togglable via `GameOptions.showGrid` (press **G** in combat, or toggle in Options menu).
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
- **UIButton** (`src/ui/UIButton.ts`): Phaser Container with Graphics bg. Hit area via Rectangle (no setSize). Click on pointerdown with lock guard to prevent double-fire. States: normal, hover, pressed, disabled, selected (yellow highlight). Resize method updates hit area in place.
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
BootScene → MenuScene → PartyCreationScene → CombatScene  (WorldMapScene skipped for now)
                ↓                                  ↕ (overlay)
          OptionsScene  ←─────────────────── OptionsScene
```

- **PartyCreationScene**: 4 enabled slots by default (Ragnar/warrior, Skiv/thief, Aldric/sorcerer, S.Mara/cleric). Each slot is self-contained with name input, 2×2 class buttons, body type toggle. Slots 5-6 can be enabled by clicking. Max 1 sorcerer, max 1 cleric enforced.
- **OptionsScene**: toggle buttons for God Mode, Auto End Turn, and Show Grid, plus draggable SFX Volume slider. From main menu: full scene transition. From combat: launches as overlay (pauses combat, dark backdrop), BACK button resumes combat.
- **CombatScene**: loads level from `public/levels/TestMap1.json`. Wires all systems together. Modes: select → move → targeting. "O" button in top-right opens options overlay.

### Key Files
- `src/config/constants.ts` — all numeric constants (ranges, radii, layout)
- `src/config/GameOptions.ts` — global options (godMode, autoEndTurn, sfxVolume, showGrid)
- `src/core/CoordinateSystem.ts` — world↔screen↔percentage conversion
- `src/core/Dice.ts` — d8 roller
- `src/systems/MovementSystem.ts` — distance, adjacency, range, terrain collision, LOS (DDA), A* pathfinding, stamina cost
- `src/systems/CombatSystem.ts` — attack resolution, curse, heal, ward, status effects
- `src/systems/TurnSystem.ts` — turn order, phase management, status cleanup
- `src/systems/AISystem.ts` — enemy decision-making, LOS-aware ranged AI, grid pathfinding
- `src/systems/SFXSystem.ts` — audio system, loads/plays sounds keyed by SFXId
- `src/entities/` — Character, PC, NPC, Inventory
- `src/actions/` — Action interface, classActions definitions
- `src/render/TerrainRenderer.ts` — grid tile rendering (grass/rock), optional gridlines
- `src/render/UnitRenderer.ts` — circle-based unit rendering
- `src/ui/UIButton.ts` — reusable button component
- `src/ui/RangeIndicator.ts` — move/attack/heal range circles, frenzy cone
- `src/scenes/OptionsScene.ts` — options toggle UI, supports overlay mode from combat
- `public/levels/` — level JSON files loaded by CombatScene
- `tools/map-editor.html` — standalone map editor (see Map Editor section below)

### Design Constraints
- `erasableSyntaxOnly: true` — no TypeScript enums, use string unions
- No `setSize()` on Phaser containers (causes hit area offset)
- `onClick` on `pointerdown` not `pointerup` (prevents reflow race conditions)
- Enter key for end turn (not Space — harder to press accidentally)

---

---

## Map Editor (`tools/map-editor.html`)

A standalone HTML tool for building level files. No server needed — open the file directly in a browser.

### How to use
1. **Open** `tools/map-editor.html` in any browser (double-click or drag into browser).
2. **Paint terrain**: select Grass or Rock in the palette, click/drag on the grid to paint tiles.
3. **Place units**: switch to the Characters tab. Select a hero slot (1–6) or enemy type (Skeleton Melee / Skeleton Archer), then click a tile to place. Click an occupied tile to remove.
4. **Save**: click **Save** — downloads a `.json` file. Move it to `public/levels/` in the project.
5. **Load**: click **Load** to open an existing level JSON for editing.

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
- `terrainGrid[row][col]`: `0` = grass (passable), `1` = rock (impassable)
- Spawn coordinates use tile center (e.g. `5.5, 20.5` = center of tile at column 5, row 20)
- Enemy types: `skeleton_melee` (sword), `skeleton_archer` (bow)

---

## Next Steps

### Immediate

#### 1. Graphics Pass
- [ ] Pixel sprites for all unit types (B draws in GIMP)
- [ ] Replace circle rendering with sprite-based UnitRenderer
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
- [ ] More tile types (water, lava, walls, doors)
- [ ] More enemy types in editor and spawner
- [ ] WorldMapScene reads map data files for node graph

### Mid Term
- [ ] Levels 2-7 abilities for all classes (design doc has full progression)
- [ ] More enemy types (armored, magic, ranged variants)
- [ ] XP and leveling system
- [ ] Whirlwind ability for warrior (360° melee AoE, reserved in code as `area` target type)
- [ ] Equipment system — weapons/armor affect stats
- [ ] Lore/dialog layer

### Long Term
- [ ] Campaign structure with acts
- [ ] Overworld / party management between encounters
- [ ] The fiction: names, factions, the weight of what happened
