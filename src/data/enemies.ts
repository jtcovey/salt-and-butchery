import { Item, WeaponItem } from '../entities/Item';
import { NPC } from '../entities/NPC';
import { SWORD, BOW, SPEAR } from './items';
import { UNIT_RADIUS } from '../config/constants';

/**
 * The one place enemy stats live.
 *
 * Before this table every enemy in the game was `hp: 1, ac: 3` and CombatScene
 * decided "is it an archer?" by string-comparing the spawn type. Five distinct
 * types can't ride on that.
 *
 * SCALE MATTERS HERE. `Salt & Butchery.md:28` — "Warriors start with 2 HP. All
 * other classes start with 1 HP", +1 max HP per level. This is a game where a
 * level-2 party has 2-3 HP each and a hit is close to lethal. Enemy HP belongs
 * in the same 1-2 range; an enemy with 5 HP isn't "tough", it's unkillable.
 *
 * The statblocks below are INVENTED — neither design doc gives monster stats.
 * They're anchored to the two numbers that are real: the party's HP curve
 * above, and `hp 1 / ac 3`, which is what every enemy has used through B's
 * testing so far. Rank and file sit exactly on that tested line so adding this
 * table changes no existing fight; only the shaman is built to be harder.
 * Expect to tune against play.
 */

/**
 * Whether a type can be routed.
 *
 * Straight out of the lore, not a balance knob. `S&B Player's Glossary.md:105`
 * describes undead as "slow, shambling things. Mere slaves to their creators
 * will" with only the vaguest hints of cognition — nothing there can panic.
 * Goblins carry "the gregarious nature of the Faefolk, but twisted", and a
 * social creature is exactly the thing that breaks when its friend dies next
 * to it.
 */
export type Morale = 'breaks' | 'steady';

export interface EnemyType {
  id: string;
  name: string;
  hp: number;
  ac: number;
  strength: number;
  /** Resolved into an actual weapon on spawn; drives melee vs ranged AI. */
  weapon: WeaponItem;
  /** Extra kit — armour for the AC bonus, consumables for later. */
  gear?: Item[];
  color: number;
  /** Single glyph drawn on the unit when it has no sprite yet. */
  label: string;
  morale: Morale;
  /** Added to the engagement's XP pot when this one dies. */
  xp: number;
}

const GOBLIN_GREEN = 0x6a9a3a;
const GOBLIN_ARCHER_GREEN = 0x8fc45a;
const SHAMAN_PURPLE = 0x9a5ac4;
const BONE_WHITE = 0xd8d4c4;
const BONE_ARCHER = 0xb0aa96;

export const ENEMY_TYPES: Record<string, EnemyType> = {
  goblin_warrior: {
    id: 'goblin_warrior', name: 'Goblin',
    hp: 1, ac: 3, strength: 0,
    weapon: SWORD,
    color: GOBLIN_GREEN, label: 'G',
    morale: 'breaks', xp: 5,
  },

  goblin_archer: {
    id: 'goblin_archer', name: 'Goblin Archer',
    hp: 1, ac: 3, strength: 0,
    weapon: BOW,
    color: GOBLIN_ARCHER_GREEN, label: 'g',
    morale: 'breaks', xp: 5,
  },

  /**
   * Steady on purpose. He's the one holding the nest together, and a boss that
   * routs is a bad boss. It also gives the boss room a real answer beyond
   * "focus the nearest thing": kill him first and twenty goblins become
   * rout-prone, because nothing else in the room is steady.
   */
  goblin_shaman: {
    id: 'goblin_shaman', name: 'Goblin Shaman',
    hp: 2, ac: 4, strength: 1,
    weapon: SPEAR,
    color: SHAMAN_PURPLE, label: 'S',
    morale: 'steady', xp: 20,
  },

  /**
   * hp 1 / ac 3 is NOT a guess — it's the statline every random encounter has
   * used through B's playtesting, and he signed off on that balance. Giving
   * skeletons hp 2 / ac 4 to make them "feel undead" quietly doubled the
   * difficulty of every existing fight in the game. Tested numbers beat
   * plausible ones; if these should change it's a balance decision made on
   * purpose, not a side effect of adding a dungeon.
   */
  skeleton: {
    id: 'skeleton', name: 'Skeleton',
    hp: 1, ac: 3, strength: 0,
    weapon: SWORD,
    color: BONE_WHITE, label: 'K',
    morale: 'steady', xp: 7,
  },

  skeleton_archer: {
    id: 'skeleton_archer', name: 'Skeleton Archer',
    hp: 1, ac: 3, strength: 0,
    weapon: BOW,
    color: BONE_ARCHER, label: 'A',
    morale: 'steady', xp: 7,
  },
};

/** Unknown ids fall back to a plain goblin rather than throwing mid-spawn. */
export function enemyType(id: string): EnemyType {
  return ENEMY_TYPES[id] ?? ENEMY_TYPES.goblin_warrior;
}

/**
 * Builds a live NPC from a type id. The single spawn path — level files,
 * the random encounter generator and the dungeon generator all come through
 * here, so stats can never drift between them.
 */
export function spawnEnemy(
  typeId: string,
  x: number,
  y: number,
  id: string,
  nameOverride?: string,
): NPC {
  const t = enemyType(typeId);
  const npc = new NPC({
    id, name: nameOverride ?? t.name,
    hp: t.hp, maxHp: t.hp, ac: t.ac, strength: t.strength,
    x, y, radius: UNIT_RADIUS,
    color: t.color, label: t.label,
    typeId: t.id, morale: t.morale, xp: t.xp,
  });
  npc.inventory.items.push(t.weapon);
  for (const g of t.gear ?? []) npc.inventory.items.push(g);
  return npc;
}
