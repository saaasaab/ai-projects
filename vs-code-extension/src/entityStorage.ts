import * as vscode from "vscode";
import { ensureEntitiesRoot, entityReadmeUri, writeEntityReadme } from "./entityReadme";
import type { Entity, EntityDatabase, EntityType } from "./types";

const STORAGE_KEY = "semanticWriting.entities.v1";
export const DEFAULT_STORY_BIBLE_PATH = ".semantic-writing/story-bible.json";

function emptyDb(): EntityDatabase {
  return { version: 1, entities: [] };
}

export class EntityStore implements vscode.Disposable {
  private fileUri: vscode.Uri | undefined;
  private cache: EntityDatabase | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

  async initialize(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      void vscode.window.showWarningMessage(
        "Semantic Writing: Open a workspace folder to save your Story Bible to disk."
      );
      return;
    }

    const rel =
      vscode.workspace.getConfiguration("semanticWriting").get<string>("storyBiblePath") ??
      DEFAULT_STORY_BIBLE_PATH;
    this.fileUri = vscode.Uri.joinPath(folder.uri, rel);

    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.fileUri, ".."));

    try {
      await vscode.workspace.fs.stat(this.fileUri);
    } catch {
      const migrated = await this.migrateFromWorkspaceState();
      await this.writeDb(migrated ?? emptyDb());
    }

    await this.migrateFromWorkspaceStateIfFileEmpty();
    await ensureEntitiesRoot();
    await this.ensureReadmesForAllEntities();

    const pattern = new vscode.RelativePattern(folder, rel);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidChange(() => {
      this.cache = undefined;
    });
    this.disposables.push(watcher);
  }

  getStoryBibleUri(): vscode.Uri | undefined {
    return this.fileUri;
  }

  private async migrateFromWorkspaceState(): Promise<EntityDatabase | undefined> {
    const raw = this.context.workspaceState.get<EntityDatabase>(STORAGE_KEY);
    if (!raw || raw.version !== 1 || !Array.isArray(raw.entities) || raw.entities.length === 0) {
      return undefined;
    }
    return raw;
  }

  private async migrateFromWorkspaceStateIfFileEmpty(): Promise<void> {
    const db = await this.readDb();
    if (db.entities.length > 0) return;
    const migrated = await this.migrateFromWorkspaceState();
    if (!migrated) return;
    await this.writeDb(migrated);
    await this.context.workspaceState.update(STORAGE_KEY, undefined);
  }

  private async readDb(): Promise<EntityDatabase> {
    if (this.cache) return this.cache;
    if (!this.fileUri) {
      const fallback = await this.migrateFromWorkspaceState();
      this.cache = fallback ?? emptyDb();
      return this.cache;
    }

    try {
      const bytes = await vscode.workspace.fs.readFile(this.fileUri);
      const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as EntityDatabase;
      if (parsed?.version === 1 && Array.isArray(parsed.entities)) {
        this.cache = {
          version: 1,
          entities: parsed.entities.map((e) => normalizeEntity(e)),
        };
        return this.cache;
      }
    } catch {
      // missing or invalid file
    }
    this.cache = emptyDb();
    return this.cache;
  }

  private async writeDb(db: EntityDatabase): Promise<void> {
    this.cache = db;
    if (!this.fileUri) {
      await this.context.workspaceState.update(STORAGE_KEY, db);
      return;
    }
    const json = JSON.stringify(db, null, 2);
    await vscode.workspace.fs.writeFile(this.fileUri, Buffer.from(json, "utf8"));
    await this.context.workspaceState.update(STORAGE_KEY, undefined);
  }

  async listEntities(): Promise<Entity[]> {
    const db = await this.readDb();
    return sortEntitiesByUsage(db.entities);
  }

  /** Unsorted entities (internal). */
  async listEntitiesRaw(): Promise<Entity[]> {
    const db = await this.readDb();
    return db.entities.slice();
  }

  async searchEntitiesByPrefix(type: EntityType, queryAfterPrefix: string): Promise<Entity[]> {
    const q = queryAfterPrefix.trim().toLowerCase();
    const db = await this.readDb();
    const matches = db.entities.filter((e) => {
      if (e.type !== type) return false;
      if (!q) return true;
      return e.displayName.toLowerCase().includes(q);
    });
    return sortEntitiesByUsage(matches);
  }

  async applyUsageCounts(counts: Map<string, number>): Promise<boolean> {
    const db = await this.readDb();
    let changed = false;
    for (const entity of db.entities) {
      const next = counts.get(entity.id) ?? 0;
      if (entity.usageCount !== next) {
        entity.usageCount = next;
        changed = true;
      }
    }
    if (changed) await this.writeDb(db);
    return changed;
  }

  async getEntity(id: string): Promise<Entity | undefined> {
    const db = await this.readDb();
    return db.entities.find((e) => e.id === id);
  }

  async findByReference(type: EntityType, displayName: string): Promise<Entity | undefined> {
    const name = displayName.trim().toLowerCase();
    const db = await this.readDb();
    return db.entities.find(
      (e) => e.type === type && e.displayName.trim().toLowerCase() === name
    );
  }

  /** Create a Story Bible entry when a manuscript reference has no matching entity. */
  async ensureEntityFromReference(type: EntityType, displayName: string): Promise<Entity> {
    const existing = await this.findByReference(type, displayName);
    if (existing) {
      await this.ensureEntityReadme(existing);
      return existing;
    }
    return this.createEntity(type, displayName);
  }

  /** Create the per-entity readme file if it does not exist yet. */
  async ensureEntityReadme(entity: Entity): Promise<vscode.Uri | undefined> {
    return writeEntityReadme(entity, false);
  }

  /** Overwrite the per-entity readme from current entity data. */
  async syncEntityReadme(entity: Entity): Promise<void> {
    await writeEntityReadme(entity, true);
  }

  /** Backfill readme files for entities that only exist in story-bible.json. */
  async ensureReadmesForAllEntities(): Promise<void> {
    for (const entity of await this.listEntitiesRaw()) {
      await this.ensureEntityReadme(entity);
    }
  }

  async renameEntityReadmeFile(entity: Entity, oldDisplayName: string): Promise<void> {
    const oldUri = entityReadmeUri({ ...entity, displayName: oldDisplayName });
    const newUri = entityReadmeUri(entity);
    if (!oldUri || !newUri || oldUri.toString() === newUri.toString()) {
      await this.syncEntityReadme(entity);
      return;
    }
    try {
      await vscode.workspace.fs.rename(oldUri, newUri, { overwrite: true });
      await this.syncEntityReadme(entity);
    } catch {
      await this.syncEntityReadme(entity);
      try {
        await vscode.workspace.fs.delete(oldUri);
      } catch {
        // old file may not exist
      }
    }
  }

  async deleteEntityReadme(entity: Entity): Promise<void> {
    const uri = entityReadmeUri(entity);
    if (!uri) return;
    try {
      await vscode.workspace.fs.delete(uri);
    } catch {
      // file may not exist
    }
  }

  async createEntity(type: EntityType, displayName: string, notes = ""): Promise<Entity> {
    const trimmed = displayName.trim();
    if (!trimmed) throw new Error("Display name is required.");
    const now = new Date().toISOString();
    const entity: Entity = {
      id: crypto.randomUUID(),
      type,
      displayName: trimmed,
      notes,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    const db = await this.readDb();
    db.entities.push(entity);
    await this.writeDb(db);

    const readmeUri = await this.ensureEntityReadme(entity);
    if (!readmeUri) {
      void vscode.window.showWarningMessage(
        `Added "${trimmed}" to the Story Bible, but could not create its readme — open a workspace folder.`
      );
    }
    return entity;
  }

  async updateEntity(
    id: string,
    patch: Partial<Pick<Entity, "displayName" | "notes">>,
    options?: { skipReadmeSync?: boolean }
  ): Promise<Entity> {
    const db = await this.readDb();
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
    await this.writeDb(db);
    if (!options?.skipReadmeSync) {
      if (patch.displayName != null && patch.displayName.trim() !== current.displayName) {
        await this.renameEntityReadmeFile(next, current.displayName);
      } else {
        await this.syncEntityReadme(next);
      }
    }
    return next;
  }

  async deleteEntity(id: string): Promise<void> {
    const db = await this.readDb();
    const idx = db.entities.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error("Entity not found.");
    const removed = db.entities[idx];
    db.entities.splice(idx, 1);
    await this.writeDb(db);
    await this.deleteEntityReadme(removed);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}

function normalizeEntity(raw: Entity): Entity {
  return {
    ...raw,
    usageCount: typeof raw.usageCount === "number" ? raw.usageCount : 0,
  };
}

function sortEntitiesByUsage(entities: Entity[]): Entity[] {
  return entities.slice().sort((a, b) => {
    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
    return a.displayName.localeCompare(b.displayName);
  });
}
