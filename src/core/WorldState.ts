import type { Vec2 } from '../types';

/** Enough to actually shop with while the economy is being tested. */
export const STARTING_GOLD = 500;

/** Percentage points of encounter chance gained per tile of open ground. */
export const ENCOUNTER_STEP = 10;
/** Ceiling on that chance, so travel never becomes a certainty per step. */
export const ENCOUNTER_MAX = 50;

/**
 * Campaign state that outlives a single scene.
 *
 * Mutable module singleton, matching the GameOptions pattern. Scenes read and
 * write it directly rather than threading state through every `scene.start()`.
 * Reset at the start of a new game.
 */
export const WorldState = {
  /** Which world map the party is on. */
  mapFile: 'maps/WorldCH1.json',

  /**
   * Where the party stands, as a tile centre in world units. Null means "use the
   * map's own partyStart" — i.e. the party hasn't set foot on this map yet.
   */
  partyTile: null as Vec2 | null,

  /** Location ids whose encounter has been won. Drives reveals and re-entry. */
  completedEncounters: new Set<string>(),

  /**
   * Quests the party has taken on. Separate from completions: accepting the
   * Mayor's job and finding the caravan are different states, and NPC dialog
   * keys off both.
   */
  acceptedQuests: new Set<string>(),

  /** Shared party purse. Not per-character — the party spends as one. */
  gold: STARTING_GOLD,

  /**
   * Where to drop the party when they walk out of a town. Set on entering one,
   * cleared on leaving. One level deep is all towns need.
   */
  townReturn: null as { mapFile: string; tile: Vec2 } | null,

  /**
   * Rising chance of a random fight, in percent.
   *
   * Starts at 0 after every encounter, climbs by ENCOUNTER_STEP per tile of
   * open ground, caps at ENCOUNTER_MAX. Roads never roll and reset it to 0 —
   * so the road is genuinely safer, and a player who sticks to it can cross the
   * map untouched. Straying off it is a decision with a cost curve.
   */
  encounterChance: 0,

  isComplete(locationId: string): boolean {
    return this.completedEncounters.has(locationId);
  },

  markComplete(locationId: string): void {
    this.completedEncounters.add(locationId);
  },

  /** Walked a tile of open ground: raise the odds, then roll them. */
  rollEncounter(onRoad: boolean, rng: () => number = Math.random): boolean {
    if (onRoad) { this.encounterChance = 0; return false; }
    this.encounterChance = Math.min(ENCOUNTER_MAX, this.encounterChance + ENCOUNTER_STEP);
    if (rng() * 100 < this.encounterChance) {
      this.encounterChance = 0;
      return true;
    }
    return false;
  },

  acceptQuest(questId: string): void {
    this.acceptedQuests.add(questId);
  },

  hasQuest(questId: string): boolean {
    return this.acceptedQuests.has(questId);
  },

  /** True when the purse can cover a cost. */
  canAfford(cost: number): boolean {
    return this.gold >= cost;
  },

  /** Returns false and changes nothing if the party can't cover it. */
  spend(cost: number): boolean {
    if (!this.canAfford(cost)) return false;
    this.gold -= cost;
    return true;
  },

  earn(amount: number): void {
    this.gold += amount;
  },

  reset(): void {
    this.mapFile = 'maps/WorldCH1.json';
    this.partyTile = null;
    this.completedEncounters = new Set<string>();
    this.acceptedQuests = new Set<string>();
    this.gold = STARTING_GOLD;
    this.townReturn = null;
    this.encounterChance = 0;
  },
};
