import type { CharacterClass } from '../types';
import type { Action } from './Action';
import { RANGED_RANGE, MELEE_RANGE } from '../config/constants';
import { ABILITY_LEVEL } from '../data/leveling';

const ATTACK: Action = {
  id: 'attack', label: 'ATTACK', range: 'melee', target: 'enemy', staminaCost: 1,
  canUse(caster, gameState) {
    if (caster.hasActed || (caster.stamina ?? 0) < 1) return false;
    return gameState.enemies.length > 0;
  },
};

const DEFEND: Action = {
  id: 'defend', label: 'DEFEND', range: 'self', target: 'self', staminaCost: 1,
  canUse(caster) {
    return !caster.hasActed && (caster.stamina ?? 0) >= 1;
  },
};

const FRENZY: Action = {
  id: 'frenzy', label: 'FRENZY', range: 'melee', target: 'cone', numericRange: MELEE_RANGE, staminaCost: 1,
  canUse(caster, gameState) {
    if (caster.hasActed || (caster.stamina ?? 0) < 1) return false;
    return gameState.enemies.length > 0;
  },
};

const TRICK_SHOT: Action = {
  id: 'trick_shot', label: 'TRICK SHOT', range: 'ranged', target: 'enemy', numericRange: RANGED_RANGE, attacks: 2, staminaCost: 1,
  canUse(caster, gameState) {
    if (caster.hasActed || (caster.stamina ?? 0) < 1) return false;
    return gameState.enemies.length > 0;
  },
};

const CURSE: Action = {
  id: 'curse', label: 'CURSE', range: 'ranged', target: 'enemy', numericRange: RANGED_RANGE, staminaCost: 1,
  canUse(caster, gameState) {
    if (caster.hasActed || (caster.stamina ?? 0) < 1) return false;
    return gameState.enemies.length > 0;
  },
};

const WARD: Action = {
  id: 'ward', label: 'WARD', range: 'self', target: 'self', staminaCost: 1,
  canUse(caster) {
    if (caster.hasActed || (caster.stamina ?? 0) < 1) return false;
    return (caster.wardStacks ?? 0) < 3;
  },
};

const HEAL: Action = {
  id: 'heal', label: 'HEAL', range: 'melee', target: 'ally', numericRange: MELEE_RANGE, staminaCost: 1,
  canUse(caster, gameState) {
    if (caster.hasActed || (caster.stamina ?? 0) < 1) return false;
    return gameState.party.some(t => t !== caster && t.hp < t.maxHp);
  },
};

const BLESS: Action = {
  id: 'bless', label: 'BLESS', range: 'ranged', target: 'ally', numericRange: RANGED_RANGE, staminaCost: 1,
  canUse(caster, gameState) {
    if (caster.hasActed || (caster.stamina ?? 0) < 1) return false;
    return gameState.party.some(t => t !== caster && t.hp > 0);
  },
};


// ── Level 2 ───────────────────────────────────────────────────────────────
// Three of the doc's seven level-2 abilities map onto mechanics the engine
// already has, so they work today. The other four need new systems and are
// listed at the bottom of this file rather than half-added:
//   Blitz, Lightning Bolt, Grapple, Consecrate.

/** Doc: "Hurl an object. 8 inch ranged Intelligence attack. Deal 1 damage,
 *  even to Antimagic enemies." Same shape as a ranged attack, shorter range. */
const SLING: Action = {
  id: 'sling', label: 'SLING', range: 'ranged', target: 'enemy', numericRange: 8, staminaCost: 2,
  canUse(caster, gameState) {
    if (caster.hasActed || (caster.stamina ?? 0) < 2) return false;
    return gameState.enemies.length > 0;
  },
};

/** Doc: "Dexterity based melee attack to instantly kill a living creature on
 *  hit." Curse already does instant-kill-on-hit; this is its melee sibling. */
const ASSASSINATE: Action = {
  id: 'assassinate', label: 'ASSASSINATE', range: 'melee', target: 'enemy', numericRange: MELEE_RANGE, staminaCost: 2,
  canUse(caster, gameState) {
    if (caster.hasActed || (caster.stamina ?? 0) < 2) return false;
    return gameState.enemies.length > 0;
  },
};

/** Doc: "Give one enemy within sight -1 to rolls for the round." Bless inverted. */
const PISHOGUE: Action = {
  id: 'pishogue', label: 'PISHOGUE', range: 'ranged', target: 'enemy', numericRange: RANGED_RANGE, staminaCost: 1,
  canUse(caster, gameState) {
    if (caster.hasActed || (caster.stamina ?? 0) < 1) return false;
    return gameState.enemies.length > 0;
  },
};

const CLASS_ACTIONS: Record<CharacterClass, Action[]> = {
  warrior:  [ATTACK, FRENZY, DEFEND],
  thief:    [ATTACK, TRICK_SHOT, ASSASSINATE, DEFEND],
  sorcerer: [ATTACK, CURSE, WARD, SLING, DEFEND],
  cleric:   [ATTACK, HEAL, BLESS, PISHOGUE, DEFEND],
};

/**
 * Actions gate on level via ABILITY_LEVEL; anything unlisted is level 1, so
 * existing behaviour is unchanged for a level-1 party.
 */
export function getActionsForClass(cls: CharacterClass, level = 1): Action[] {
  return CLASS_ACTIONS[cls].filter(a => (ABILITY_LEVEL[a.id] ?? 1) <= level);
}

/**
 * NOT YET IMPLEMENTED — level-2 abilities from the design doc that need engine
 * work rather than another entry in the table above. Listed so they aren't
 * silently forgotten, and deliberately absent from CLASS_ACTIONS so nothing
 * appears in the UI that would break when clicked.
 *
 *   Blitz (warrior)     - half-distance Move THROUGH enemies, knocking them
 *                         Prone. Needs a move-target action type and collision
 *                         bypass; 'prone' already exists as a StatusEffect.
 *   Lightning Bolt (sor)- 1 damage to everyone in an 8 inch LINE. Needs a line
 *                         target type; cone already exists as precedent.
 *   Grapple (thief)     - 16 inch pull, self-to-target or target-to-self by
 *                         size. Needs forced movement.
 *   Consecrate (cleric) - blast unnatural creatures out of a 3 inch radius and
 *                         knock them Prone. Needs forced movement + a creature
 *                         'unnatural' flag that does not exist yet.
 */
