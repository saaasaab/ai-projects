import * as vscode from "vscode";
import { EntityStore } from "./entityStorage";
import { renameEntityAcrossWorkspace } from "./rename";
import { ENTITY_DEFS, ENTITY_TYPES, entityPrefix, type EntityType } from "./types";

export class StoryBiblePanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "semanticWriting.storyBible";

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: EntityStore
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.onDidReceiveMessage((msg: { type: string; payload?: unknown }) => {
      void this.handleMessage(msg);
    });

    void this.render();
  }

  async refresh(): Promise<void> {
    await this.render();
  }

  private async handleMessage(msg: { type: string; payload?: unknown }): Promise<void> {
    switch (msg.type) {
      case "ready":
      case "refresh":
        await this.render();
        break;
      case "save": {
        const p = msg.payload as {
          id?: string;
          type: EntityType;
          displayName: string;
          notes: string;
        };
        try {
          if (p.id) {
            const existing = await this.store.getEntity(p.id);
            if (existing && existing.displayName !== p.displayName.trim()) {
              await renameEntityAcrossWorkspace(this.store, existing, p.displayName);
            }
            await this.store.updateEntity(p.id, { displayName: p.displayName, notes: p.notes });
          } else {
            await this.store.createEntity(p.type, p.displayName, p.notes);
          }
          await this.render();
          void vscode.commands.executeCommand("semanticWriting.refreshDecorations");
        } catch (err) {
          void vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
        }
        break;
      }
      case "delete": {
        const { id } = msg.payload as { id: string };
        try {
          await this.store.deleteEntity(id);
          await this.render();
        } catch (err) {
          void vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
        }
        break;
      }
      case "select": {
        const { id } = msg.payload as { id: string };
        const entity = await this.store.getEntity(id);
        if (entity) {
          this.view?.webview.postMessage({ type: "loadEntity", payload: entity });
        }
        break;
      }
      default:
        break;
    }
  }

  private async render(): Promise<void> {
    if (!this.view) return;
    const entities = await this.store.listEntities();
    this.view.webview.html = this.getHtml(entities);
  }

  private getHtml(
    entities: Awaited<ReturnType<EntityStore["listEntities"]>>
  ): string {
    const typeOptions = ENTITY_TYPES.map(
      (t) =>
        `<option value="${t}">${escapeHtml(ENTITY_DEFS[t].label)} (${entityPrefix(t)}:)</option>`
    ).join("");

    const listItems = entities
      .map((e) => {
        const short = entityPrefix(e.type);
        return `<li data-id="${e.id}">
          <span class="pill pill-${e.type}">${short}</span>
          <strong>${escapeHtml(e.displayName)}</strong>
        </li>`;
      })
      .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --font: var(--vscode-font-family);
      --fg: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --input-border: var(--vscode-input-border);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --btn-danger: var(--vscode-errorForeground);
      --list-hover: var(--vscode-list-hoverBackground);
    }
    * { box-sizing: border-box; }
    body {
      font-family: var(--font);
      font-size: 13px;
      color: var(--fg);
      padding: 12px;
      line-height: 1.45;
    }
    h1 { font-size: 14px; font-weight: 600; margin: 0 0 6px; }
    .muted { color: var(--muted); font-size: 12px; margin: 0 0 12px; }
    .muted code { font-size: 11px; }
    label { display: block; font-size: 11px; color: var(--muted); margin: 10px 0 4px; }
    select, input, textarea {
      width: 100%;
      font: inherit;
      color: var(--input-fg);
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      padding: 6px 8px;
    }
    textarea { min-height: 72px; resize: vertical; }
    .row { display: flex; gap: 8px; margin-top: 12px; }
    button {
      flex: 1;
      font: inherit;
      padding: 6px 10px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      background: var(--btn-bg);
      color: var(--btn-fg);
    }
    button.secondary { background: transparent; color: var(--fg); border: 1px solid var(--input-border); }
    button.danger { background: transparent; color: var(--btn-danger); border: 1px solid var(--btn-danger); }
    button:disabled { opacity: 0.45; cursor: default; }
    ul { list-style: none; padding: 0; margin: 8px 0 0; max-height: 220px; overflow: auto; }
    li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
    }
    li:hover { background: var(--list-hover); }
    .pill {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 999px;
      opacity: 0.9;
    }
    .pill-character { background: #3b599833; }
    .pill-location { background: #2d6a4f33; }
    .pill-religion { background: #6a4c9333; }
    .pill-idea { background: #e9c46a33; }
    .pill-event { background: #e76f5133; }
    .pill-organization { background: #457b9d33; }
  </style>
</head>
<body>
  <h1>Story bible</h1>
  <p class="muted">Type <code>C:</code> <code>L:</code> <code>R:</code> <code>I:</code> <code>E:</code> <code>O:</code> in your manuscript for autocomplete. Entities are stored locally in this workspace.</p>

  <label for="type">Type</label>
  <select id="type">${typeOptions}</select>

  <label for="name">Name</label>
  <input id="name" type="text" autocomplete="off" />

  <label for="notes">Notes</label>
  <textarea id="notes"></textarea>

  <div class="row">
    <button id="save">Save</button>
    <button id="clear" class="secondary">New</button>
    <button id="delete" class="danger" disabled>Delete</button>
  </div>

  <label>All entities</label>
  <ul id="list">${listItems || '<li class="muted">No entities yet.</li>'}</ul>

  <script>
    const vscode = acquireVsCodeApi();
    let editingId = null;

    const typeEl = document.getElementById('type');
    const nameEl = document.getElementById('name');
    const notesEl = document.getElementById('notes');
    const saveBtn = document.getElementById('save');
    const clearBtn = document.getElementById('clear');
    const deleteBtn = document.getElementById('delete');
    const list = document.getElementById('list');

    function syncDelete() {
      deleteBtn.disabled = !editingId;
    }

    function clearForm() {
      editingId = null;
      nameEl.value = '';
      notesEl.value = '';
      syncDelete();
    }

    saveBtn.addEventListener('click', () => {
      vscode.postMessage({
        type: 'save',
        payload: {
          id: editingId,
          type: typeEl.value,
          displayName: nameEl.value,
          notes: notesEl.value,
        },
      });
    });

    clearBtn.addEventListener('click', clearForm);

    deleteBtn.addEventListener('click', () => {
      if (!editingId) return;
      vscode.postMessage({ type: 'delete', payload: { id: editingId } });
      clearForm();
    });

    list.querySelectorAll('li[data-id]').forEach((li) => {
      li.addEventListener('click', () => {
        vscode.postMessage({ type: 'select', payload: { id: li.dataset.id } });
      });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'loadEntity') {
        const e = msg.payload;
        editingId = e.id;
        typeEl.value = e.type;
        nameEl.value = e.displayName;
        notesEl.value = e.notes || '';
        syncDelete();
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
