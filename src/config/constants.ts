export const MOVE_PER_STAMINA = 8;
export const FREE_MOVE = 8;
export const ADJACENT_TOLERANCE = 0.5;
export const RANGED_RANGE = 24;
export const UNIT_RADIUS = 0.6;
export const MELEE_RANGE = UNIT_RADIUS * 2 + ADJACENT_TOLERANCE;
export const OBSTACLE_RADIUS = 0.8;

export const DEFAULT_ARENA_WIDTH = 60;
export const DEFAULT_ARENA_HEIGHT = 40;

export const LAYOUT = {
  topBar:    { x: 0, y: 0, width: 1, height: 0.07 },
  gameArea:  { x: 0, y: 0.07, width: 0.78, height: 0.93 },
  sidePanel: { x: 0.78, y: 0.07, width: 0.22, height: 0.93 },
} as const;

export const CLASS_COLOR: Record<string, number> = {
  warrior:  0xe94560,
  thief:    0x44dd88,
  sorcerer: 0xaa44ee,
  cleric:   0xeecc44,
};

export const CLASS_LABEL: Record<string, string> = {
  warrior: 'W',
  thief: 'T',
  sorcerer: 'S',
  cleric: 'C',
};

export const CLASS_BASE_HP: Record<string, number> = {
  warrior: 2,
  thief: 1,
  sorcerer: 1,
  cleric: 1,
};

export const CLASS_SKILL: Record<string, keyof import('../types').CharacterSkills> = {
  warrior: 'strength',
  thief: 'dexterity',
  sorcerer: 'intelligence',
  cleric: 'wisdom',
};
