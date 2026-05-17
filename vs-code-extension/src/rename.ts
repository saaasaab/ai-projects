import * as vscode from "vscode";
import { EntityStore } from "./entityStorage";
import { renameReferenceText } from "./referenceSyntax";
import type { Entity } from "./types";

export async function renameEntityAcrossWorkspace(
  store: EntityStore,
  entity: Entity,
  newName: string
): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Display name is required.");
  if (trimmed === entity.displayName) return;

  const oldName = entity.displayName;
  const include = "**/*.{md,markdown,txt,text}";
  const exclude = "{**/node_modules/**,**/.git/**,**/dist/**}";
  const uris = await vscode.workspace.findFiles(include, exclude);

  const edits = new Map<string, vscode.TextEdit[]>();

  for (const uri of uris) {
    const doc = await vscode.workspace.openTextDocument(uri);
    const next = renameReferenceText(doc.getText(), entity.type, oldName, trimmed);
    if (next === doc.getText()) continue;
    const fullRange = new vscode.Range(
      doc.positionAt(0),
      doc.positionAt(doc.getText().length)
    );
    const key = uri.toString();
    edits.set(key, [vscode.TextEdit.replace(fullRange, next)]);
  }

  if (edits.size > 0) {
    const wsEdit = new vscode.WorkspaceEdit();
    for (const [uriStr, textEdits] of edits) {
      wsEdit.set(vscode.Uri.parse(uriStr), textEdits);
    }
    const ok = await vscode.workspace.applyEdit(wsEdit);
    if (!ok) throw new Error("Could not update manuscript references.");
  }

  await store.updateEntity(entity.id, { displayName: trimmed });
}
