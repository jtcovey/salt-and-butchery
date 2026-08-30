import type { CharacterClass, BodyType } from '../types';

/** Everything cosmetic about a character, independent of class or stats. */
export interface Appearance {
  bodyType: BodyType;
  skin: number;
  primary: number;
  secondary: number;
}

/** Skin swatches, fair to dark. Order matters — the picker renders them in sequence. */
export const SKIN_TONES: number[] = [
  0xf5d5b8, 0xecc4a0, 0xe0b48c, 0xd19d72, 0xbf8760,
  0xa66d4a, 0x8b5a3c, 0x70452c, 0x543322, 0x3a2318,
];

/** Cloth and metal swatches for primary (garments) and secondary (boots, trim). */
export const CLOTH_COLORS: number[] = [
  0xb03030, 0xe04040, 0x8a4418, 0xe08020, 0x7a4a2a,
  0xe0c040, 0xd4af37, 0x6a8a30, 0x3a8a4a, 0x2a6a5a,
  0x3060b0, 0x5080d0, 0x2a3a7a, 0x7040a0, 0xa050c0,
  0xc060a0, 0xc0c0c8, 0x808088, 0x40444c, 0x1a1a20,
  0xf0ece0,
];

/**
 * Starting look per class. Seeded when a class is picked, but only while the
 * player hasn't chosen colours by hand.
 */
export const CLASS_APPEARANCE: Record<CharacterClass, Omit<Appearance, 'bodyType'>> = {
  warrior:  { skin: 0xa66d4a, primary: 0xb03030, secondary: 0x7a4a2a }, // tan / red / brown
  sorcerer: { skin: 0xecc4a0, primary: 0x3060b0, secondary: 0xd4af37 }, // fair / blue / gold
  cleric:   { skin: 0xe0b48c, primary: 0x7040a0, secondary: 0xc0c0c8 }, // peach / purple / silver
  thief:    { skin: 0xe0b48c, primary: 0xe0c040, secondary: 0x8a4418 }, // peach / yellow / burnt orange
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Used for slots 5 and 6, which have no class-based default to fall back on. */
export function randomAppearance(): Omit<Appearance, 'bodyType'> {
  return {
    skin: pick(SKIN_TONES),
    primary: pick(CLOTH_COLORS),
    secondary: pick(CLOTH_COLORS),
  };
}

/** `0xrrggbb` to the `#rrggbb` form Phaser text styles and CSS both want. */
export function hexString(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}
