/**
 * What town NPCs say, and what talking to them offers.
 *
 * Separate from `locations.ts` on purpose: that file is about world-map routing
 * (which marker launches an encounter, which swaps the map). This one is about
 * town *content* — the words and the choices — which is the part that grows.
 *
 * Keyed by the location id the map editor derived from the marker's label.
 */

/** A button on the dialog panel. `action` is resolved by the scene. */
export interface DialogChoice {
  label: string;
  /** Scene-handled verb. 'close' needs no wiring. */
  action: 'close' | 'shop' | 'rest' | 'save' | 'accept_quest';
}

export interface NpcDialog {
  /** Shown in the panel. Blank lines separate paragraphs. */
  text: string;
  /** Omitted means a single OK button. */
  choices?: DialogChoice[];
  /** Replaces `text` once this quest/flag is set. */
  textAfter?: Record<string, string>;
}

export const TOWN_NPCS: Record<string, NpcDialog> = {
  mayor: {
    text:
      "You're the sellswords, then.\n\n" +
      "A caravan out of the salt road is a week overdue. Six wagons, " +
      "forty souls, and every barrel of preserved fish this town eats " +
      "through the winter.\n\n" +
      "Find it. I'll pay what the town can spare.",
    choices: [
      { label: 'We\'ll find it', action: 'accept_quest' },
      { label: 'Later',          action: 'close' },
    ],
    textAfter: {
      lost_caravan:
        "You found the wreck. Good.\n\n" +
        "Whatever did that to my caravan is still out there, " +
        "and it left a trail. Follow it.",
    },
  },

  itemshop: {
    text:
      "Steel, leather, and things that burn.\n\n" +
      "Coin first, then you carry it out.",
    choices: [
      { label: 'Browse wares', action: 'shop'  },
      { label: 'Just looking', action: 'close' },
    ],
  },

  inn: {
    text:
      "Beds are clean and the stew is honest.\n\n" +
      "Rest puts your people back on their feet. " +
      "And I'll keep a record of your passing through, if you want one kept.",
    choices: [
      { label: 'Rest',       action: 'rest'  },
      { label: 'Save',       action: 'save'  },
      { label: 'Leave',      action: 'close' },
    ],
  },

  tutorial1: {
    text:
      "Left-click the ground to walk. Click a person to walk over and talk.\n\n" +
      "The arrow panel does the same thing a step at a time — drag it " +
      "anywhere it isn't in your way.",
  },
  tutorial2: {
    text:
      "LOOK lets you point at a thing without walking to it.\n\n" +
      "Useful before you commit to a road.",
  },
  tutorial3: {
    text:
      "Walk out any open edge of town and you're back on the road.\n\n" +
      "You'll come out the side you left by.",
    },
  tutorial4: {
    text:
      "Out there, everything is a d8.\n\n" +
      "Roll over their armour and you hurt them. Roll under and you don't. " +
      "Stamina is what you spend to try.",
  },
};

export function npcDialog(id: string): NpcDialog | null {
  return TOWN_NPCS[id] ?? null;
}
