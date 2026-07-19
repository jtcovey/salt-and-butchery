# Salt & Butchery — Game Plan

## Vision

A dark party RPG set after the apocalypse. Inspired by R. Scott Bakker's *The Second Apocalypse* — the world after the No-God walks, civilization fractured, the Holy War's survivors scattered. J's own fiction, different names and details, same weight.

The game is to be played: structure, substance, meaningful choices.

**Party archetype**: An old wizard who was there — knows what happened, carries the guilt. A young warrior, Guts-type, the blade. Others TBD as the fiction grows.

## Current State

- Phaser 3 + TypeScript + Vite, canvas 820×540
- Tactical grid (20×15 tiles, TILE=32), TOP_BAR=60
- 4-PC party (Warrior, Thief, Sorcerer, Cleric) vs 5 skeleton enemies
- Turn-based combat: Player phase (move+act per PC) → Enemy phase (auto) → repeat
- Two-zone move highlighting: free range (white) / stamina range (yellow)
- ActionsPanel (MOVE, ATTACK), History log, Party HP readout
- InventoryScene (toggle I key)
- Main menu (MenuScene → New Game, Options, Quit)
- Reusable UIButton with hover/click/default color states

## Feature Roadmap

### Near Term
- [ ] Options screen (volume, display settings placeholder)
- [ ] Win condition (all enemies defeated → victory screen)
- [ ] Lose condition (all PCs dead → defeat screen)
- [ ] Retreat / Quit to Menu from WorldScene

### Mid Term
- [ ] Character classes with distinct abilities (Sorcerer spells, Cleric heals)
- [ ] More enemy types (armored, fast, ranged magic)
- [ ] Simple lore/dialog layer — the old wizard speaks
- [ ] Map variety (different layouts, encounters)
- [ ] XP and leveling

### Long Term
- [ ] Story structure — campaign with acts
- [ ] Overworld / party management between encounters
- [ ] The fiction: names, factions, the weight of what happened

## Architecture

```
BootScene → MenuScene → WorldScene ↔ InventoryScene
```

- `src/ui/UIButton.ts` — reusable button, configurable colors
- `src/scenes/MenuScene.ts` — title + main menu
- Entity hierarchy: Character → PC / NPC; Item → WeaponItem / ArmorItem
- `erasableSyntaxOnly: true` — all fields declared explicitly above constructor
