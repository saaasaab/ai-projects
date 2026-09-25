import * as crypto from "crypto";
import * as vscode from "vscode";
import { findReferenceSpans } from "./referenceSyntax";

export const DEFAULT_NOTES_INDEX_PATH = ".semantic-writing/notes.json";
export const DEFAULT_NOTES_FILE_PATH = ".semantic-writing/notes.md";

const MANUSCRIPT_GLOB = "**/*.{md,markdown,txt,text}";
const MANUSCRIPT_EXCLUDE = "{**/node_modules/**,**/.git/**,**/dist/**,**/.semantic-writing/**}";

const NOTE_ANCHOR_RE = /^<!-- semantic-writing-note:([a-f0-9-]+) -->$/;

export interface SavedNote {
  id: string;
  content: string;
  /** Workspace-relative path to the manuscript file. */
  sourcePath: string;
  /** 1-based line number in the manuscript. */
  line: number;
  createdAt: string;
  updatedAt: string;
}

interface NotesDatabase {
  version: 2;
  notes: SavedNote[];
}

function emptyDb(): NotesDatabase {
  return { version: 2, notes: [] };
}

function noteLocationKey(sourcePath: string, line: number): string {
  return `${sourcePath}:${line}`;
}

function migrateDb(raw: NotesDatabase | { version: 1; notes: Array<Partial<SavedNote>> }): NotesDatabase {
  if (raw.version === 2 && Array.isArray(raw.notes)) {
    return {
      version: 2,
      notes: raw.notes.map((n) => ({
        id: n.id ?? crypto.randomUUID(),
        content: n.content ?? "",
        sourcePath: n.sourcePath ?? "unknown",
        line: typeof n.line === "number" ? n.line : 1,
        createdAt: n.createdAt ?? new Date().toISOString(),
        updatedAt: n.updatedAt ?? new Date().toISOString(),
      })),
    };
  }
  if (raw.version === 1 && Array.isArray(raw.notes)) {
    return {
      version: 2,
      notes: raw.notes.map((n) => ({
        id: n.id ?? crypto.randomUUID(),
        content: n.content ?? "",
        sourcePath: "unknown",
        line: 1,
        createdAt: n.createdAt ?? new Date().toISOString(),
        updatedAt: n.updatedAt ?? new Date().toISOString(),
      })),
    };
  }
  return emptyDb();
}

function manuscriptLink(folder: vscode.WorkspaceFolder, sourcePath: string, line: number): string {
  const uri = vscode.Uri.joinPath(folder.uri, sourcePath);
  const target = uri.with({ fragment: `L${line}` });
  return `[${sourcePath}:${line}](${target.toString()})`;
}

function generateNotesMarkdown(notes: SavedNote[], folder: vscode.WorkspaceFolder): string {
  const sorted = [...notes].sort(
    (a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.line - b.line
  );

  const lines: string[] = [
    "# Notes",
    "",
    "All inline `N:{...}` notes from your manuscripts. Each entry links back to its source file and line.",
    "",
  ];

  for (const note of sorted) {
    lines.push(`<!-- semantic-writing-note:${note.id} -->`);
    lines.push(`## ${note.sourcePath} · line ${note.line}`);
    lines.push("");
    lines.push(`↩ ${manuscriptLink(folder, note.sourcePath, note.line)}`);
    lines.push("");
    lines.push(note.content);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

export function isNotesFileUri(uri: vscode.Uri): boolean {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return false;
  const rel =
    vscode.workspace.getConfiguration("semanticWriting").get<string>("notesFilePath") ??
    DEFAULT_NOTES_FILE_PATH;
  const notesUri = vscode.Uri.joinPath(folder.uri, rel);
  return uri.toString() === notesUri.toString();
}

export function parseNotesFile(text: string): Array<{ id: string; content: string }> {
  const results: Array<{ id: string; content: string }> = [];
  const lines = text.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const anchor = lines[i].match(NOTE_ANCHOR_RE);
    if (!anchor) {
      i++;
      continue;
    }
    const id = anchor[1];
    i++;
    while (i < lines.length && lines[i].trim() === "") i++;
    if (i < lines.length && lines[i].startsWith("## ")) i++;
    while (i < lines.length && lines[i].trim() === "") i++;
    if (i < lines.length && lines[i].startsWith("↩ ")) i++;
    while (i < lines.length && lines[i].trim() === "") i++;

    const body: string[] = [];
    while (i < lines.length && lines[i] !== "---") {
      body.push(lines[i]);
      i++;
    }
    results.push({ id, content: body.join("\n").trimEnd() });
    while (i < lines.length && (lines[i] === "---" || lines[i].trim() === "")) i++;
  }

  return results;
}

/** Single shared notes file plus JSON index. */
export class NotesStore implements vscode.Disposable {
  private indexUri: vscode.Uri | undefined;
  private notesFileUri: vscode.Uri | undefined;
  private cache: NotesDatabase | undefined;
  private anchorLineById = new Map<string, number>();

  async initialize(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;

    const indexRel =
      vscode.workspace.getConfiguration("semanticWriting").get<string>("notesIndexPath") ??
      DEFAULT_NOTES_INDEX_PATH;
    const fileRel =
      vscode.workspace.getConfiguration("semanticWriting").get<string>("notesFilePath") ??
      DEFAULT_NOTES_FILE_PATH;

    this.indexUri = vscode.Uri.joinPath(folder.uri, indexRel);
    this.notesFileUri = vscode.Uri.joinPath(folder.uri, fileRel);

    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.indexUri, ".."));

    try {
      await vscode.workspace.fs.stat(this.indexUri);
    } catch {
      await this.writeDb(emptyDb());
    }

    try {
      await vscode.workspace.fs.stat(this.notesFileUri);
    } catch {
      await this.writeNotesFile(emptyDb().notes);
    }
  }

  getNotesFileUri(): vscode.Uri | undefined {
    return this.notesFileUri;
  }

  private async readDb(): Promise<NotesDatabase> {
    if (this.cache) return this.cache;
    if (!this.indexUri) return emptyDb();
    try {
      const bytes = await vscode.workspace.fs.readFile(this.indexUri);
      const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as NotesDatabase;
      this.cache = migrateDb(parsed);
      return this.cache;
    } catch {
      // missing or invalid
    }
    this.cache = emptyDb();
    return this.cache;
  }

  private async writeDb(db: NotesDatabase): Promise<void> {
    this.cache = db;
    if (!this.indexUri) return;
    await vscode.workspace.fs.writeFile(
      this.indexUri,
      Buffer.from(JSON.stringify(db, null, 2), "utf8")
    );
  }

  private async writeNotesFile(notes: SavedNote[]): Promise<void> {
    if (!this.notesFileUri) return;
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;

    const markdown = generateNotesMarkdown(notes, folder);
    this.anchorLineById.clear();
    markdown.split(/\r?\n/).forEach((line, index) => {
      const m = line.match(NOTE_ANCHOR_RE);
      if (m) this.anchorLineById.set(m[1], index);
    });

    await vscode.workspace.fs.writeFile(this.notesFileUri, Buffer.from(markdown, "utf8"));
  }

  /** Save or update a note at a manuscript location. Returns true if newly added. */
  async upsertNote(
    content: string,
    sourceUri: vscode.Uri,
    spanStartOffset: number
  ): Promise<boolean> {
    if (!this.indexUri) return false;

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return false;

    const doc = await vscode.workspace.openTextDocument(sourceUri);
    const line = doc.positionAt(spanStartOffset).line + 1;
    const sourcePath = vscode.workspace.asRelativePath(sourceUri);

    const now = new Date().toISOString();
    const db = await this.readDb();
    const key = noteLocationKey(sourcePath, line);
    let saved = db.notes.find((n) => noteLocationKey(n.sourcePath, n.line) === key);
    const isNew = !saved;

    if (!saved) {
      saved = {
        id: crypto.randomUUID(),
        content,
        sourcePath,
        line,
        createdAt: now,
        updatedAt: now,
      };
      db.notes.push(saved);
    } else {
      saved.content = content;
      saved.updatedAt = now;
    }

    await this.writeDb(db);
    await this.writeNotesFile(db.notes);
    return isNew;
  }

  /** Scan manuscripts for `N:{...}` and update the shared notes file. */
  async syncNotesFromManuscripts(): Promise<boolean> {
    if (!this.indexUri) return false;

    let anyNew = false;
    const seen = new Set<string>();

    const uris = await vscode.workspace.findFiles(MANUSCRIPT_GLOB, MANUSCRIPT_EXCLUDE);
    for (const uri of uris) {
      const doc = await vscode.workspace.openTextDocument(uri);
      const spans = findReferenceSpans(doc.getText());
      for (const span of spans) {
        if (span.type !== "notes") continue;
        const line = doc.positionAt(span.start).line + 1;
        const sourcePath = vscode.workspace.asRelativePath(uri);
        const loc = noteLocationKey(sourcePath, line);
        if (seen.has(loc)) continue;
        seen.add(loc);
        const isNew = await this.upsertNote(span.displayName, uri, span.start);
        if (isNew) anyNew = true;
      }
    }

    return anyNew;
  }

  async updateNoteContent(id: string, content: string): Promise<void> {
    const db = await this.readDb();
    const note = db.notes.find((n) => n.id === id);
    if (!note || note.content === content) return;
    note.content = content;
    note.updatedAt = new Date().toISOString();
    await this.writeDb(db);
    await this.writeNotesFile(db.notes);
  }

  /** Open the shared notes file and scroll to this manuscript note. */
  async openNoteAt(
    content: string,
    sourceUri: vscode.Uri,
    spanStartOffset: number
  ): Promise<void> {
    if (!this.notesFileUri) {
      void vscode.window.showWarningMessage(
        "Open a workspace folder to save notes in .semantic-writing/notes.md"
      );
      return;
    }

    await this.upsertNote(content, sourceUri, spanStartOffset);

    const sourceDoc = await vscode.workspace.openTextDocument(sourceUri);
    const line = sourceDoc.positionAt(spanStartOffset).line + 1;
    const sourcePath = vscode.workspace.asRelativePath(sourceUri);
    const db = await this.readDb();
    const resolved = db.notes.find((n) => n.sourcePath === sourcePath && n.line === line);

    const notesDoc = await vscode.workspace.openTextDocument(this.notesFileUri);
    const editor = await vscode.window.showTextDocument(notesDoc, { preview: false });

    if (resolved) {
      const anchorLine = this.anchorLineById.get(resolved.id);
      if (anchorLine != null) {
        const pos = new vscode.Position(anchorLine, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      }
    }
  }

  async openNotesFile(): Promise<void> {
    if (!this.notesFileUri) {
      void vscode.window.showWarningMessage("Open a workspace folder first.");
      return;
    }
    const db = await this.readDb();
    await this.writeNotesFile(db.notes);
    const doc = await vscode.workspace.openTextDocument(this.notesFileUri);
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  dispose(): void {}
}

export function registerNotesSync(
  context: vscode.ExtensionContext,
  notesStore: NotesStore,
  onUpdated?: () => void
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const runSync = (): void => {
    void notesStore.syncNotesFromManuscripts().then((created) => {
      if (created) onUpdated?.();
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
      if (isNotesFileUri(doc.uri)) {
        void saveNotesFileEditor(doc, notesStore);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (shouldTrack(e.document)) schedule();
    })
  );

  runSync();
}

async function saveNotesFileEditor(doc: vscode.TextDocument, store: NotesStore): Promise<void> {
  const parsed = parseNotesFile(doc.getText());
  for (const block of parsed) {
    await store.updateNoteContent(block.id, block.content);
  }
}
