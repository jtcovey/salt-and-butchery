import type { CharacterClass, CharacterSkills } from '../types';
import type { PC } from '../entities/PC';

/**
 * Levelling.
 *
 * The design doc specifies what a level DOES, precisely:
 *   "Going up a level grants you plus 1 Max HP, plus 1 to your Class Skill, and
 *    unlocks all Class Abilities of that level. Every even level grants +1 Stamina."
 *
 * It does NOT specify XP at all — "Levels are awarded by the DM, usually after
 * the completion of an adventure." That's a tabletop rule with a human in the
 * loop, and a video game needs a number, so the thresholds below are OURS, not
 * the doc's. They are marked as such so nobody later mistakes them for canon.
 *
 * Award formula is B's: 100 base + 5 per enemy.
 */

export const XP_BASE_PER_ENCOUNTER = 100;
export const XP_PER_ENEMY = 5;

export function encounterXp(enemyCount: number): number {
  return XP_BASE_PER_ENCOUNTER + XP_PER_ENEMY * enemyCount;
}

/**
 * Total XP needed to REACH each level. Index 0 unused; [1] is 0 by definition.
 *
 * NOT from the design doc — see above. Level 2 is set to 140 so the test
 * encounter (TestMap1 has 8 enemies -> 100 + 40) lands exactly on it, which is what makes
 * levelling testable in one fight.
 */
export const XP_FOR_LEVEL: number[] = [0, 0, 140, 340, 640, 1050, 1600, 2350];

export const MAX_LEVEL = XP_FOR_LEVEL.length - 1;

/** Which skill a class raises on every level. Doc: "Every level gives +1 X." */
export const CLASS_SKILL: Record<CharacterClass, keyof CharacterSkills> = {
  warrior:  'strength',
  sorcerer: 'intelligence',
  thief:    'dexterity',
  cleric:   'wisdom',
};

/** Level at which each action unlocks. Anything absent is level 1. */
export const ABILITY_LEVEL: Record<string, number> = {
  blitz: 2, lightning_bolt: 2, sling: 2, assassinate: 2, grapple: 2,
  consecrate: 2, pishogue: 2,
};

export function levelForXp(xp: number): number {
  let level = 1;
  for (let l = 2; l <= MAX_LEVEL; l++) {
    if (xp >= XP_FOR_LEVEL[l]) level = l; else break;
  }
  return level;
}

/** XP still needed for the next level, or null at max. */
export function xpToNext(xp: number): number | null {
  const next = levelForXp(xp) + 1;
  if (next > MAX_LEVEL) return null;
  return XP_FOR_LEVEL[next] - xp;
}

export interface LevelUpResult {
  pc: PC;
  from: number;
  to: number;
  gains: string[];
}

/**
 * Applies every level gained, one at a time, so a multi-level jump awards each
 * step's bonuses rather than a single increment.
 */
export function applyLevelUps(pc: PC): LevelUpResult | null {
  const target = levelForXp(pc.xp);
  if (target <= pc.level) return null;

  const from = pc.level;
  const gains: string[] = [];

  while (pc.level < target) {
    pc.level += 1;

    pc.maxHp += 1;
    pc.hp += 1;

    const skill = CLASS_SKILL[pc.charClass];
    pc.skills[skill] += 1;

    // Doc: "Every even level grants +1 Stamina."
    if (pc.level % 2 === 0) {
      pc.maxStamina += 1;
      pc.stamina += 1;
    }

    // Cleric's level 2 additionally reads "+1 Strength" on top of the standard.
    if (pc.charClass === 'cleric' && pc.level === 2) pc.skills.strength += 1;
  }

  gains.push(`+${target - from} Max HP`);
  gains.push(`+${target - from} ${CLASS_SKILL[pc.charClass]}`);
  const staminaGained = countEvenLevels(from, target);
  if (staminaGained > 0) gains.push(`+${staminaGained} Stamina`);
  if (pc.charClass === 'cleric' && from < 2 && target >= 2) gains.push('+1 strength');

  return { pc, from, to: target, gains };
}

function countEvenLevels(from: number, to: number): number {
  let n = 0;
  for (let l = from + 1; l <= to; l++) if (l % 2 === 0) n++;
  return n;
}

/** Award XP to the whole party and report who levelled. */
export function awardXp(party: PC[], amount: number): LevelUpResult[] {
  const results: LevelUpResult[] = [];
  for (const pc of party) {
    pc.xp += amount;
    const up = applyLevelUps(pc);
    if (up) results.push(up);
  }
  return results;
}
