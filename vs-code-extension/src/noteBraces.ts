import * as vscode from "vscode";
import { entityTypeFromPrefix } from "./types";

const MANUSCRIPT_LANGUAGES = new Set(["markdown", "plaintext"]);

function isManuscriptDocument(doc: vscode.TextDocument): boolean {
  if (doc.uri.scheme !== "file" && doc.uri.scheme !== "untitled") return false;
  if (!MANUSCRIPT_LANGUAGES.has(doc.languageId)) return false;
  return !doc.uri.path.includes("/.semantic-writing/");
}

/** After typing `N:`, insert `{}` and place the cursor inside the braces. */
export function registerNoteBraceAutoinsert(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || e.document !== editor.document) return;
      if (!isManuscriptDocument(e.document)) return;

      for (const change of e.contentChanges) {
        if (change.text !== ":") continue;

        const lineIndex = change.range.start.line;
        const colonColumn = change.range.start.character + 1;
        const line = e.document.lineAt(lineIndex).text;

        if (colonColumn < 2) continue;
        const letterPos = colonColumn - 2;
        if (entityTypeFromPrefix(line.charAt(letterPos)) !== "notes") continue;
        if (letterPos > 0 && /[A-Za-z0-9]/.test(line.charAt(letterPos - 1))) continue;

        const afterColon = line.slice(colonColumn);
        if (afterColon.startsWith("{")) continue;

        const insertPos = new vscode.Position(lineIndex, colonColumn);
        void editor
          .edit((eb) => {
            eb.insert(insertPos, "{}");
          })
          .then((ok) => {
            if (!ok) return;
            const cursor = insertPos.translate(0, 1);
            editor.selection = new vscode.Selection(cursor, cursor);
          });
        return;
      }
    })
  );
}
