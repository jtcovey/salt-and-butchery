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
Circle-based free movement (not grid-based):
- `FREE_MOVE = 8` units per turn (no stamina cost)
- `MOVE_PER_STAMINA = 8` additional units per stamina spent
- Max 1 stamina move per turn by default (`maxStaminaMoves` field, extensible for future abilities)
- Partial moves retain remaining distance — move circle shrinks proportionally
- Two-tier range display: green (free) inner circle, amber (stamina-paid) outer ring
- `ADJACENT_TOLERANCE = 0.5` units for melee range checks
- `UNIT_RADIUS = 0.6`, `MELEE_RANGE = 1.7` (2×radius + tolerance)
- **Collision detection**: ray-vs-circle intersection math stops movement at first blocking circle (other PCs, enemies, downed bodies, obstacles). Clicking toward a character moves up to touching distance. Only tests circles along the movement line, not all on the map.
- Undo move button — reverts position, stamina, and movement state (invalidated if action taken after move)

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

### Scene Flow
```
BootScene → MenuScene → PartyCreationScene → CombatScene  (WorldMapScene skipped for now)
                ↓
          OptionsScene
                                                          ↔ InventoryScene
```

- **PartyCreationScene**: 4 enabled slots by default (Ragnar/warrior, Skiv/thief, Aldric/sorcerer, S.Mara/cleric). Each slot is self-contained with name input, 2×2 class buttons, body type toggle. Slots 5-6 can be enabled by clicking. Max 1 sorcerer, max 1 cleric enforced.
- **OptionsScene**: toggle buttons for God Mode and Auto End Turn, plus draggable SFX Volume slider. Reachable from main menu; `returnTo` param allows future access from pause/combat.
- **CombatScene**: wires all systems together. Modes: select → move → targeting. Default encounter: 4 PCs vs 3 melee + 2 archer skeletons.

### Key Files
- `src/config/constants.ts` — all numeric constants (ranges, radii, layout)
- `src/core/CoordinateSystem.ts` — world↔screen↔percentage conversion
- `src/core/Dice.ts` — d8 roller
- `src/systems/MovementSystem.ts` — distance, adjacency, range, pathfinding, stamina cost
- `src/systems/CombatSystem.ts` — attack resolution, curse, heal, ward, status effects
- `src/systems/TurnSystem.ts` — turn order, phase management, status cleanup
- `src/systems/AISystem.ts` — enemy decision-making
- `src/entities/` — Character, PC, NPC, Inventory
- `src/config/GameOptions.ts` — global options (godMode, autoEndTurn, sfxVolume)
- `src/systems/SFXSystem.ts` — audio system, loads/plays sounds keyed by SFXId
- `src/actions/` — Action interface, classActions definitions
- `src/render/` — TerrainRenderer, UnitRenderer
- `src/ui/` — UIButton, RangeIndicator
- `src/scenes/OptionsScene.ts` — options toggle UI

### Design Constraints
- `erasableSyntaxOnly: true` — no TypeScript enums, use string unions
- No `setSize()` on Phaser containers (causes hit area offset)
- `onClick` on `pointerdown` not `pointerup` (prevents reflow race conditions)
- Enter key for end turn (not Space — harder to press accidentally)

---

## Next Steps

### Immediate (post-merge)

#### 1. Graphics Pass
- [ ] Pixel sprites for all unit types (B draws in GIMP)
- [ ] Replace circle rendering with sprite-based UnitRenderer
- [ ] Terrain tiles (floor, walls, obstacles)
- [ ] Simple attack/heal/curse visual effects (flash, particle)

#### 2. SFX Pass
- [x] Tie sound effects to combat log events (SFXSystem)
- [x] Hit/miss/kill/heal/bless/curse/frenzy/victory/defeat sounds
- [x] SFX volume control in Options menu
- [ ] UI click sounds for buttons
- [ ] Turn transition audio cue

#### 3. Map Editor (standalone HTML tool)
- [ ] Visual editor for placing terrain, obstacles, enemy spawns, party spawn points
- [ ] Export map files as JSON (encounter data format matching `EncounterData` type)
- [ ] Load map files in CombatScene instead of hardcoded `buildDefaultEnemies()`

#### 4. Scenario Loading
- [ ] Rewrite CombatScene to load encounters from JSON files
- [ ] Build starter scenario in the editor
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
