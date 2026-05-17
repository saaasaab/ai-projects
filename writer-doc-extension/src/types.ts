export type EntityType = "character" | "location" | "religion" | "idea" | "event" | "organization";

export const ENTITY_PREFIX: Record<EntityType, string> = {
  character: "C",
  location: "L",
  religion: "R",
  idea: "I",
  event: "E",
  organization: "O",
};

export const PREFIX_TO_TYPE: Record<string, EntityType> = {
  C: "character",
  L: "location",
  R: "religion",
  I: "idea",
  E: "event",
  O: "organization",
};

export const ENTITY_TYPES: readonly EntityType[] = [
  "character",
  "location",
  "religion",
  "idea",
  "event",
  "organization",
] as const;

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  character: "Character (C:)",
  location: "Location (L:)",
  religion: "Religion (R:)",
  idea: "Idea (I:)",
  event: "Event (E:)",
  organization: "Organization (O:)",
};

/** Short heading for the in-doc autocomplete card (e.g. “Characters”). */
export const ENTITY_TYPE_LIST_HEADING: Record<EntityType, string> = {
  character: "Characters",
  location: "Locations",
  religion: "Religions",
  idea: "Ideas",
  event: "Events",
  organization: "Organizations",
};

export const ENTITY_TYPE_CREATE_PHRASE: Record<EntityType, string> = {
  character: "character",
  location: "location",
  religion: "religion",
  idea: "idea",
  event: "event",
  organization: "organization",
};

export interface Entity {
  id: string;
  type: EntityType;
  displayName: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface EntityDatabase {
  version: 1;
  entities: Entity[];
}
