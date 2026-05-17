import * as vscode from "vscode";
import { isEntityReadmeUri, openEntityReadme, parseEntityReadme } from "./entityReadme";
import type { EntityStore } from "./entityStorage";
import { findReferenceSpans } from "./referenceSyntax";
import { entityPrefix } from "./types";

export function registerReferenceNavigation(
  context: vscode.ExtensionContext,
  store: EntityStore
): void {
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(async (e) => {
      if (e.kind !== vscode.TextEditorSelectionChangeKind.Mouse) return;
      if (e.selections.length !== 1 || !e.selections[0].isEmpty) return;

      const editor = vscode.window.activeTextEditor;
      if (!editor || e.textEditor !== editor) return;

      const pos = e.selections[0].active;
      const offset = editor.document.offsetAt(pos);
      const spans = findReferenceSpans(editor.document.getText());
      const span = spans.find((s) => offset >= s.start && offset < s.end);
      if (!span) return;

      const token = `${entityPrefix(span.type)}:${span.displayName}`;
      let entity = await store.findByReference(span.type, span.displayName);

      if (!entity) {
        entity = await store.ensureEntityFromReference(span.type, span.displayName);
      }

      await openEntityReadme(entity);
    }),

    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (!isEntityReadmeUri(doc.uri)) return;
      const { id, notes } = parseEntityReadme(doc.getText());
      if (!id) return;
      try {
        const entity = await store.getEntity(id);
        if (!entity) return;
        if (entity.notes === notes) return;
        await store.updateEntity(id, { notes }, { skipReadmeSync: true });
      } catch {
        // ignore parse/update errors on save
      }
    })
  );
}
