import type { WorldLocationKind } from '../types';

/**
 * Presentation for overworld location markers.
 *
 * These colours and glyphs are mirrored in `tools/map-editor.html` (the editor
 * is standalone HTML and can't import from here) so a map looks the same in the
 * editor as it does in game. Change both together.
 */
export interface LocationKindProps {
  color: number;
  glyph: string;
}

export const LOCATION_KIND_PROPS: Record<WorldLocationKind, LocationKindProps> = {
  // World map — travel destinations
  town:      { color: 0xddaa44, glyph: 'T' },
  encounter: { color: 0xcc4444, glyph: '!' },
  dungeon:   { color: 0x8844cc, glyph: 'D' },
  shop:      { color: 0x44aa66, glyph: '$' },
  rest:      { color: 0x4488cc, glyph: 'R' },

  // Town — NPC roles
  vendor:    { color: 0x44aa66, glyph: '$' },
  inn:       { color: 0x4488cc, glyph: 'Z' },
  quest:     { color: 0xddcc44, glyph: '!' },
  dialog:    { color: 0x88aacc, glyph: '?' },
  exit:      { color: 0xcc6644, glyph: '>' },
};

const FALLBACK: LocationKindProps = { color: 0xddaa44, glyph: '?' };

/** Unknown kinds degrade to a neutral marker rather than crashing. */
export function locationKindProps(kind: string): LocationKindProps {
  return LOCATION_KIND_PROPS[kind as WorldLocationKind] ?? FALLBACK;
}

/** The party token on the overworld. */
export const PARTY_TOKEN_COLOR = 0x66ddff;
