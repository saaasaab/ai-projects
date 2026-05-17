import type { Entity, EntityDatabase, EntityType } from "../types";

function storageKey(docId: string): string {
  return `semanticWritingLayer.entities.v1:${docId}`;
}

function emptyDb(): EntityDatabase {
  return { version: 1, entities: [] };
}

export async function loadDb(docId: string): Promise<EntityDatabase> {
  const key = storageKey(docId);
  const bag = await chrome.storage.local.get(key);
  const raw = bag[key] as EntityDatabase | undefined;
  if (!raw || raw.version !== 1 || !Array.isArray(raw.entities)) return emptyDb();
  return raw;
}

async function saveDb(docId: string, db: EntityDatabase): Promise<void> {
  await chrome.storage.local.set({ [storageKey(docId)]: db });
}

function newId(): string {
  return crypto.randomUUID();
}

export async function listEntities(docId: string): Promise<Entity[]> {
  const db = await loadDb(docId);
  return db.entities.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function searchEntitiesByPrefix(
  docId: string,
  type: EntityType,
  queryAfterPrefix: string
): Promise<Entity[]> {
  const q = queryAfterPrefix.trim().toLowerCase();
  const db = await loadDb(docId);
  return db.entities.filter((e) => {
    if (e.type !== type) return false;
    if (!q) return true;
    return e.displayName.toLowerCase().includes(q);
  });
}

export async function createEntity(
  docId: string,
  type: EntityType,
  displayName: string,
  notes = ""
): Promise<Entity> {
  const trimmed = displayName.trim();
  if (!trimmed) throw new Error("Display name is required.");
  const now = new Date().toISOString();
  const entity: Entity = {
    id: newId(),
    type,
    displayName: trimmed,
    notes,
    createdAt: now,
    updatedAt: now,
  };
  const db = await loadDb(docId);
  db.entities.push(entity);
  await saveDb(docId, db);
  return entity;
}

export async function updateEntity(
  docId: string,
  id: string,
  patch: Partial<Pick<Entity, "displayName" | "notes">>
): Promise<Entity> {
  const db = await loadDb(docId);
  const idx = db.entities.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error("Entity not found.");
  const current = db.entities[idx];
  const next: Entity = {
    ...current,
    displayName: patch.displayName != null ? patch.displayName.trim() : current.displayName,
    notes: patch.notes != null ? patch.notes : current.notes,
    updatedAt: new Date().toISOString(),
  };
  if (!next.displayName) throw new Error("Display name is required.");
  db.entities[idx] = next;
  await saveDb(docId, db);
  return next;
}

export async function deleteEntity(docId: string, id: string): Promise<void> {
  const db = await loadDb(docId);
  const idx = db.entities.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error("Entity not found.");
  db.entities.splice(idx, 1);
  await saveDb(docId, db);
}
