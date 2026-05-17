import { createEntity, deleteEntity, listEntities, updateEntity } from "./entityStorage";
import { registerDebugSink, swlDebug } from "./debugLog";
import panelCss from "./panel.scss";
import { ENTITY_TYPE_LABEL, ENTITY_TYPES, type EntityType } from "../types";

function escapeHtml(s: string): string {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function injectStyles(shadow: ShadowRoot): void {
  const style = document.createElement("style");
  style.textContent = panelCss;
  shadow.appendChild(style);
}

export function mountPanel(docId: string): void {
  if (document.getElementById("swl-host")) return;

  const host = document.createElement("div");
  host.id = "swl-host";
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
      <button type="button" class="swl-fab" id="swl-fab" title="Story bible" aria-expanded="false">◎</button>
      <aside class="swl-aside" id="swl-aside" aria-label="Semantic writing layer panel">
        <h1>Story bible</h1>
        <p class="swl-muted">Type prefixes in the document — <code>C:</code> <code>L:</code> <code>R:</code> <code>I:</code> <code>E:</code> <code>O:</code> — to open the picker over the page. Use this panel to browse and edit entities.</p>
        <label class="swl-field" for="swl-type">Type</label>
        <select class="swl-select" id="swl-type">
          ${ENTITY_TYPES.map(
            (t) => `<option value="${t}">${escapeHtml(ENTITY_TYPE_LABEL[t])}</option>`
          ).join("")}
        </select>
        <label class="swl-field" for="swl-name">Name</label>
        <input class="swl-input" id="swl-name" type="text" autocomplete="off" />
        <label class="swl-field" for="swl-notes">Notes</label>
        <textarea class="swl-textarea" id="swl-notes"></textarea>
        <div class="swl-row">
          <button type="button" class="swl-btn swl-btn-primary" id="swl-save">Save</button>
          <button type="button" class="swl-btn swl-btn-danger" id="swl-delete" disabled>Delete</button>
        </div>
        <label class="swl-field">All entities</label>
        <ul class="swl-list" id="swl-list"></ul>
        <details class="swl-debug">
          <summary>Extension log</summary>
          <p class="swl-muted swl-debug-hint">Logs from this tab and editor frames. Open DevTools on the docs.google.com document (or editor iframe) to see <code>[SWL]</code> in the console.</p>
          <pre class="swl-log-pre" id="swl-log" aria-label="Extension log"></pre>
        </details>
      </aside>
    `;

  injectStyles(shadow);

  const fab = shadow.getElementById("swl-fab") as HTMLButtonElement;
  const aside = shadow.getElementById("swl-aside") as HTMLElement;
  const typeSel = shadow.getElementById("swl-type") as HTMLSelectElement;
  const nameIn = shadow.getElementById("swl-name") as HTMLInputElement;
  const notesIn = shadow.getElementById("swl-notes") as HTMLTextAreaElement;
  const btnSave = shadow.getElementById("swl-save") as HTMLButtonElement;
  const btnDelete = shadow.getElementById("swl-delete") as HTMLButtonElement;
  const list = shadow.getElementById("swl-list") as HTMLUListElement;
  const logPre = shadow.getElementById("swl-log") as HTMLPreElement;

  registerDebugSink((chunk) => {
    logPre.textContent += chunk;
    if (logPre.textContent.length > 12000) {
      logPre.textContent = logPre.textContent.slice(-8000);
    }
  });
  swlDebug("panel mounted", docId);

  const toggleAside = (): void => {
    const open = aside.classList.toggle("swl-open");
    fab.setAttribute("aria-expanded", String(open));
  };

  const closeAside = (): void => {
    if (!aside.classList.contains("swl-open")) return;
    aside.classList.remove("swl-open");
    fab.setAttribute("aria-expanded", "false");
  };

  fab.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleAside();
  });

  window.addEventListener(
    "mousedown",
    (e) => {
      if (!aside.classList.contains("swl-open")) return;
      const path = e.composedPath();
      if (path.includes(host)) return;
      closeAside();
    },
    true
  );

  const syncDeleteBtn = (): void => {
    btnDelete.disabled = !nameIn.dataset.editingId;
  };

  const typePill = (t: EntityType): string => {
    const short = ENTITY_TYPE_LABEL[t].split(" ")[0] ?? t;
    return escapeHtml(short);
  };

  const refreshList = async (): Promise<void> => {
    const entities = await listEntities(docId);
    list.innerHTML = "";
    for (const e of entities) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="swl-pill">${typePill(e.type)}</span> <strong>${escapeHtml(e.displayName)}</strong>`;
      li.addEventListener("click", () => {
        nameIn.value = e.displayName;
        notesIn.value = e.notes || "";
        typeSel.value = e.type;
        nameIn.dataset.editingId = e.id;
        syncDeleteBtn();
      });
      list.appendChild(li);
    }
  };

  btnSave.addEventListener("click", () => {
    void (async () => {
      const type = typeSel.value as EntityType;
      const displayName = nameIn.value;
      const notes = notesIn.value;
      const editingId = nameIn.dataset.editingId;
      try {
        if (editingId) {
          await updateEntity(docId, editingId, { displayName, notes });
        } else {
          await createEntity(docId, type, displayName, notes);
        }
        nameIn.value = "";
        notesIn.value = "";
        delete nameIn.dataset.editingId;
        syncDeleteBtn();
        await refreshList();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    })();
  });

  btnDelete.addEventListener("click", () => {
    const id = nameIn.dataset.editingId;
    if (!id) return;
    const label = nameIn.value.trim() || "this entity";
    if (!confirm(`Delete “${label}” permanently?`)) return;
    void (async () => {
      try {
        await deleteEntity(docId, id);
        nameIn.value = "";
        notesIn.value = "";
        delete nameIn.dataset.editingId;
        syncDeleteBtn();
        await refreshList();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    })();
  });

  void refreshList();
  syncDeleteBtn();
  document.documentElement.appendChild(host);
}
