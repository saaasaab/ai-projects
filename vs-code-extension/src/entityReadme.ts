import * as vscode from "vscode";
import type { Entity, EntityType } from "./types";
import { ENTITY_DEFS } from "./types";

export const ENTITIES_DIR = ".semantic-writing/entities";

export function entitySlug(displayName: string): string {
  return displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isEntityReadmeUri(uri: vscode.Uri): boolean {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return false;
  const base = vscode.Uri.joinPath(folder.uri, ENTITIES_DIR).path;
  return uri.path.startsWith(base + "/") && uri.path.endsWith(".md");
}

export function formatEntityReadme(entity: Entity): string {
  const label = ENTITY_DEFS[entity.type].label;
  const notes =
    entity.notes.trim() ||
    `_Add notes for this ${label.toLowerCase()}. Changes here sync to the Story Bible._`;
  return `---
semanticWritingEntityId: "${entity.id}"
type: ${entity.type}
---

# ${entity.displayName}

${notes}
`;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseEntityReadme(content: string): { id?: string; notes: string } {
  const fm = content.match(FRONTMATTER_RE);
  const body = fm ? content.slice(fm[0].length) : content;
  const idMatch = fm?.[1].match(/semanticWritingEntityId:\s*["']?([^"'\n]+)/);
  const lines = body.split(/\r?\n/);
  if (lines[0]?.startsWith("# ")) lines.shift();
  while (lines.length > 0 && lines[0] === "") lines.shift();
  return { id: idMatch?.[1]?.trim(), notes: lines.join("\n").trim() };
}

export function entityReadmeUri(entity: Entity): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  const slug = entitySlug(entity.displayName);
  if (!slug) return undefined;
  return vscode.Uri.joinPath(folder.uri, ENTITIES_DIR, entity.type, `${slug}.md`);
}

/** Ensure `.semantic-writing/entities/{type}/` exists. */
export async function ensureEntitiesRoot(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, ENTITIES_DIR));
}

/**
 * Write the per-entity readme (object bible). When `overwrite` is false, leaves an existing file unchanged.
 */
export async function writeEntityReadme(
  entity: Entity,
  overwrite = true
): Promise<vscode.Uri | undefined> {
  const uri = entityReadmeUri(entity);
  if (!uri) return undefined;

  await ensureEntitiesRoot();
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, ".."));

  if (!overwrite) {
    try {
      await vscode.workspace.fs.stat(uri);
      return uri;
    } catch {
      // file missing — create below
    }
  }

  await vscode.workspace.fs.writeFile(uri, Buffer.from(formatEntityReadme(entity), "utf8"));
  return uri;
}

export async function openEntityReadme(entity: Entity): Promise<void> {
  const uri = entityReadmeUri(entity);
  if (!uri) {
    void vscode.window.showWarningMessage(
      "Open a workspace folder to use entity readme files."
    );
    return;
  }
  await writeEntityReadme(entity, false);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });
}
