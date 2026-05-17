/** Single source of truth — add new entity kinds here only. */
export const ENTITY_DEFS = {
  character: {
    prefix: "C",
    label: "Character",
    createPhrase: "character",
  },
  location: {
    prefix: "L",
    label: "Location",
    createPhrase: "location",
  },
  religion: {
    prefix: "R",
    label: "Religion",
    createPhrase: "religion",
  },
  idea: {
    prefix: "I",
    label: "Idea",
    createPhrase: "idea",
  },
  event: {
    prefix: "E",
    label: "Event",
    createPhrase: "event",
  },
  organization: {
    prefix: "O",
    label: "Organization",
    createPhrase: "organization",
  },
} as const;

export type EntityType = keyof typeof ENTITY_DEFS;

export const ENTITY_TYPES = Object.keys(ENTITY_DEFS) as EntityType[];

/** Name token after the prefix; letters, digits, `'`, `_`, `-`; stops at spaces and `.`. */
export const PLAIN_ENTITY_NAME = "[A-Za-z0-9'_-]+";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Prefix alternation for reference regexes, e.g. `(?:C|L|R|...)`. */
export function entityPrefixPattern(): string {
  const parts = ENTITY_TYPES.map((t) => escapeRegExp(ENTITY_DEFS[t].prefix));
  return parts.length === 0 ? "(?!)" : `(?:${parts.join("|")})`;
}

export function entityPrefix(type: EntityType): string {
  return ENTITY_DEFS[type].prefix;
}

export function entityTypeFromPrefix(letter: string): EntityType | undefined {
  const upper = letter.toUpperCase();
  return ENTITY_TYPES.find((t) => ENTITY_DEFS[t].prefix.toUpperCase() === upper);
}

export interface Entity {
  id: string;
  type: EntityType;
  displayName: string;
  notes: string;
  /** Times this entity is referenced in workspace manuscripts. */
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface EntityDatabase {
  version: 1;
  entities: Entity[];
}
