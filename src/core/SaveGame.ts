import { PC } from '../entities/PC';
import { Item } from '../entities/Item';
import { Inventory } from '../entities/Inventory';
import { WorldState } from './WorldState';
import { ALL_ITEMS } from '../data/items';
import type { CharacterSkills, BodyType, CharacterClass } from '../types';

/**
 * Manual save/load to localStorage.
 *
 * MANUAL ONLY — no autosave, no checkpoints. B's call: the player decides when
 * a save is overwritten, which is why the Inn has an explicit Save button
 * rather than saving on rest or on entering town.
 *
 * Items are stored by id and resolved back through ALL_ITEMS on load, so item
 * stats live in one place and a save can't pickle stale balance numbers.
 */

const SAVE_KEY = 'salt-and-butchery:save:v1';
/** Bump when the shape changes; loads of other versions are refused, not guessed at. */
const SAVE_VERSION = 1;

interface SavedPC {
  id: string; name: string; charClass: CharacterClass; level: number;
  hp: number; maxHp: number; ac: number;
  stamina: number; maxStamina: number; skills: CharacterSkills;
  radius: number; color: number;
  bodyType: BodyType; skinColor: number; primaryColor: number; secondaryColor: number;
  itemIds: string[];
}

interface SaveData {
  version: number;
  savedAt: string;
  world: {
    mapFile: string;
    partyTile: { x: number; y: number } | null;
    completedEncounters: string[];
    acceptedQuests: string[];
    gold: number;
    townReturn: { mapFile: string; tile: { x: number; y: number } } | null;
  };
  party: SavedPC[];
}

function serializePC(pc: PC): SavedPC {
  return {
    id: pc.id, name: pc.name, charClass: pc.charClass, level: pc.level,
    hp: pc.hp, maxHp: pc.maxHp, ac: pc.ac,
    stamina: pc.stamina, maxStamina: pc.maxStamina, skills: pc.skills,
    radius: pc.radius, color: pc.color,
    bodyType: pc.bodyType, skinColor: pc.skinColor,
    primaryColor: pc.primaryColor, secondaryColor: pc.secondaryColor,
    itemIds: pc.inventory.items.map(i => i.id),
  };
}

function deserializePC(s: SavedPC): PC {
  const pc = new PC({
    id: s.id, name: s.name, charClass: s.charClass, level: s.level,
    hp: s.hp, maxHp: s.maxHp, ac: s.ac,
    stamina: s.stamina, maxStamina: s.maxStamina, skills: s.skills,
    x: 0, y: 0, radius: s.radius, color: s.color,
    bodyType: s.bodyType, skinColor: s.skinColor,
    primaryColor: s.primaryColor, secondaryColor: s.secondaryColor,
  });
  pc.inventory = new Inventory();
  for (const id of s.itemIds) {
    const item = ALL_ITEMS.find((i: Item) => i.id === id);
    // Unknown id = an item that was removed from the game. Drop it rather than
    // failing the whole load; the player loses a sword, not their campaign.
    if (item) pc.inventory.items.push(item);
  }
  return pc;
}

export function saveGame(party: PC[]): boolean {
  try {
    const data: SaveData = {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      world: {
        mapFile: WorldState.mapFile,
        partyTile: WorldState.partyTile,
        completedEncounters: [...WorldState.completedEncounters],
        acceptedQuests: [...WorldState.acceptedQuests],
        gold: WorldState.gold,
        townReturn: WorldState.townReturn,
      },
      party: party.map(serializePC),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    // Private browsing, quota, or storage disabled. Caller tells the player.
    return false;
  }
}

/** Metadata for a "Continue" button, without paying to rebuild the party. */
export function savedGameInfo(): { savedAt: string; gold: number; party: string[] } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== SAVE_VERSION) return null;
    return {
      savedAt: data.savedAt,
      gold: data.world.gold,
      party: data.party.map(p => p.name),
    };
  } catch {
    return null;
  }
}

export function hasSavedGame(): boolean {
  return savedGameInfo() !== null;
}

/** Restores WorldState in place and returns the party, or null if unusable. */
export function loadGame(): PC[] | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== SAVE_VERSION) return null;

    WorldState.mapFile = data.world.mapFile;
    WorldState.partyTile = data.world.partyTile;
    WorldState.completedEncounters = new Set(data.world.completedEncounters);
    WorldState.acceptedQuests = new Set(data.world.acceptedQuests);
    WorldState.gold = data.world.gold;
    WorldState.townReturn = data.world.townReturn;

    return data.party.map(deserializePC);
  } catch {
    return null;
  }
}

export function deleteSave(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing to do */ }
}
