import * as vscode from "vscode";
import { findReferenceSpans } from "./referenceSyntax";
import type { EntityStore } from "./entityStorage";

const MANUSCRIPT_GLOB = "**/*.{md,markdown,txt,text}";
const MANUSCRIPT_EXCLUDE = "{**/node_modules/**,**/.git/**,**/dist/**,**/.semantic-writing/**}";

export interface ManuscriptSyncResult {
  createdEntities: boolean;
  countsChanged: boolean;
}

function autoRegisterEnabled(): boolean {
  return vscode.workspace.getConfiguration("semanticWriting").get("autoRegisterReferences", true);
}

/** Scan manuscripts, add missing entities to the Story Bible, and refresh usage counts. */
export async function syncStoryBibleFromManuscripts(
  store: EntityStore
): Promise<ManuscriptSyncResult> {
  const result: ManuscriptSyncResult = { createdEntities: false, countsChanged: false };
  if (!autoRegisterEnabled()) return result;

  try {
    const counts = new Map<string, number>();
    for (const entity of await store.listEntitiesRaw()) {
      counts.set(entity.id, 0);
    }

    const uris = await vscode.workspace.findFiles(MANUSCRIPT_GLOB, MANUSCRIPT_EXCLUDE);
    for (const uri of uris) {
      const doc = await vscode.workspace.openTextDocument(uri);
      const spans = findReferenceSpans(doc.getText());
      for (const span of spans) {
        const before = await store.findByReference(span.type, span.displayName);
        const entity = await store.ensureEntityFromReference(span.type, span.displayName);
        if (!before) result.createdEntities = true;
        counts.set(entity.id, (counts.get(entity.id) ?? 0) + 1);
      }
    }

    result.countsChanged = await store.applyUsageCounts(counts);
  } catch (err) {
    console.error("Semantic Writing: Story Bible sync failed", err);
  }

  return result;
}

export function registerUsageTracking(
  context: vscode.ExtensionContext,
  store: EntityStore,
  onUpdated?: (result: ManuscriptSyncResult) => void
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const runSync = (): void => {
    void syncStoryBibleFromManuscripts(store).then((result) => {
      if (result.createdEntities || result.countsChanged) {
        onUpdated?.(result);
      }
    });
  };

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(runSync, 600);
  };

  const shouldTrack = (doc: vscode.TextDocument): boolean => {
    if (doc.uri.scheme !== "file" && doc.uri.scheme !== "untitled") return false;
    if (doc.languageId !== "markdown" && doc.languageId !== "plaintext") return false;
    return !doc.uri.path.includes("/.semantic-writing/");
  };

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (shouldTrack(doc)) runSync();
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (shouldTrack(e.document)) schedule();
    })
  );

  runSync();
}
