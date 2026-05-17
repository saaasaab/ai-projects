import * as vscode from "vscode";
import { EntityStore } from "./entityStorage";
import { getPrefixMatch } from "./prefix";
import { referenceInsertText } from "./referenceSyntax";
import { ENTITY_DEFS, entityPrefix } from "./types";

function completionFilterToken(type: Parameters<EntityStore["searchEntitiesByPrefix"]>[0], displayName: string): string {
  return `${entityPrefix(type)}:${displayName}`;
}

function usageSortKey(count: number, displayName: string): string {
  const inverted = String(1_000_000 - Math.min(count, 999_999)).padStart(6, "0");
  return `${inverted}_${displayName.toLowerCase()}`;
}

export class EntityCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly store: EntityStore) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[] | undefined> {
    const line = document.lineAt(position.line);
    const match = getPrefixMatch(line.text, position.character);
    if (!match) return undefined;

    const entities = await this.store.searchEntitiesByPrefix(match.type, match.query);
    if (entities.length === 0) {
      return [];
    }

    const replaceRange = new vscode.Range(
      position.line,
      match.startColumn,
      position.line,
      match.endColumn
    );

    return entities.map((entity, index) => {
      const token = completionFilterToken(entity.type, entity.displayName);
      const item = new vscode.CompletionItem(
        entity.displayName,
        vscode.CompletionItemKind.Reference
      );
      const uses = entity.usageCount;
      item.detail =
        uses > 0
          ? `${ENTITY_DEFS[entity.type].label} · ${uses} use${uses === 1 ? "" : "s"}`
          : ENTITY_DEFS[entity.type].label;
      item.filterText = token;
      item.insertText = referenceInsertText(entity);
      item.range = replaceRange;
      item.sortText = usageSortKey(uses, entity.displayName);
      if (index === 0) item.preselect = true;
      return item;
    });
  }
}

/** Markdown disables quick suggestions by default; re-trigger when typing a prefix. */
export function registerSuggestOnPrefix(context: vscode.ExtensionContext): void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || e.document !== editor.document) return;
      if (!e.contentChanges.some((c) => c.text.length > 0)) return;

      const pos = editor.selection.active;
      const line = editor.document.lineAt(pos.line).text;
      if (!getPrefixMatch(line, pos.character)) return;

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void vscode.commands.executeCommand("editor.action.triggerSuggest");
      }, 120);
    })
  );
}
