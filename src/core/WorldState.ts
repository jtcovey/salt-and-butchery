import type { Vec2 } from '../types';

/** Enough to actually shop with while the economy is being tested. */
export const STARTING_GOLD = 500;

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

  /** Shared party purse. Not per-character — the party spends as one. */
  gold: STARTING_GOLD,

  /**
   * Where to drop the party when they walk out of a town. Set on entering one,
   * cleared on leaving. One level deep is all towns need.
   */
  townReturn: null as { mapFile: string; tile: Vec2 } | null,

  isComplete(locationId: string): boolean {
    return this.completedEncounters.has(locationId);
  },

  markComplete(locationId: string): void {
    this.completedEncounters.add(locationId);
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
    this.gold = STARTING_GOLD;
    this.townReturn = null;
  },
};
