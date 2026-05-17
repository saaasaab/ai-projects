import { createEntity, searchEntitiesByPrefix } from "./entityStorage";
import {
  getCaretPrefixMatch,
  getPrefixReplaceRange,
  replacePrefixWithToken,
  parsePrefixTail,
  tryReplaceWithSelectionModify,
  isNodeUnderGoogleDocSurface,
  type CaretPrefixMatch,
} from "./caretPrefix";
import { clearDocsKeyBuffer, getDocsKeyBuffer, recordDocsKeydown } from "./docsKeyBuffer";
import { swlDebug } from "./debugLog";
import {
  ENTITY_PREFIX,
  ENTITY_TYPE_CREATE_PHRASE,
  ENTITY_TYPE_LIST_HEADING,
  type EntityType,
} from "../types";
import { tokenForEntity } from "./insertBridge";
import pagePopupCss from "./pagePopup.scss";

const POPUP_ID = "swl-page-popup";
let styleInjected = false;
let pagePopupInstalled = false;

type PopupCtx = {
  type: EntityType;
  query: string;
  matchLen: number;
  rect: DOMRect;
  /** When the DOM still exposes a prefix range (non-canvas or hybrid). */
  domMatch: CaretPrefixMatch | null;
};

function ensurePopupStyles(): void {
  if (styleInjected) return;
  styleInjected = true;
  const id = "swl-page-popup-styles";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = pagePopupCss;
  document.documentElement.appendChild(style);
}

function positionPopup(el: HTMLElement, rect: DOMRect): void {
  const pad = 4;
  let top = rect.bottom + pad;
  let left = rect.left;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  el.className = "swl-page-popup";
  document.documentElement.appendChild(el);
  const w = el.offsetWidth || 260;
  const h = el.offsetHeight || 140;
  if (left + w > vw - 8) left = Math.max(8, vw - w - 8);
  if (top + h > vh - 8) top = Math.max(8, rect.top - h - pad);
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

function hidePagePopup(): void {
  document.getElementById(POPUP_ID)?.remove();
}

/** True when this frame looks like a Docs editor (canvas or paginated surface exists). */
function frameHasKixEditorSurface(): boolean {
  return !!document.querySelector(
    ".kix-canvas-tile-content, .kix-page-paginated, .kix-appview-editor, .kix-paginateddocumentplugin"
  );
}

/**
 * Google Docs usually does NOT focus the canvas for typing. Keys go to a tiny/off-screen
 * textarea or a contenteditable bridge — so we must not require e.target === canvas.
 */
function keydownTargetsManuscript(e: KeyboardEvent): boolean {
  const t = e.target;
  if (!(t instanceof Element)) return false;
  if (t.closest("#swl-host")) return false;

  if (t.matches(".kix-canvas-tile-content") || t.closest(".kix-canvas-tile-content")) return true;
  if (t.closest(".kix-page-paginated")) return true;
  if (isNodeUnderGoogleDocSurface(t)) return true;

  if (!frameHasKixEditorSurface()) return false;

  // Off-screen or 1×1 text event target (common for canvas-based Kix).
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) {
    const r = t.getBoundingClientRect();
    if (r.width <= 12 || r.height <= 12) return true;
    if (r.bottom < 0 || r.right < 0 || r.top > window.innerHeight + 50) return true;
  }

  if ((t as HTMLElement).isContentEditable) return true;
  const role = t.getAttribute("role");
  if (role === "textbox") return true;

  return false;
}

function anchorRectForPopup(domMatch: CaretPrefixMatch | null): DOMRect {
  if (domMatch) {
    const pr = getPrefixReplaceRange(domMatch)?.getBoundingClientRect();
    if (pr && (pr.width > 0 || pr.height > 0)) return pr;
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.width > 0 || r.height > 0) return r;
    }
  }
  const page = document.querySelector(".kix-page-paginated.canvas-first-page, .kix-page-paginated");
  if (page instanceof HTMLElement) {
    const b = page.getBoundingClientRect();
    return new DOMRect(b.left + b.width * 0.38, b.top + b.height * 0.12, 0, 0);
  }
  const c = document.querySelector(".kix-canvas-tile-content");
  if (c instanceof HTMLElement) {
    const b = c.getBoundingClientRect();
    return new DOMRect(b.left + b.width * 0.38, b.top + b.height * 0.42, 0, 0);
  }
  return new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
}

/** Debug: you cannot read typed text from canvas pixels; this only logs DOM presence. */
export function logKixSurfaceDebug(): void {
  const pages = document.querySelectorAll(".kix-page-paginated");
  const tiles = document.querySelectorAll(".kix-canvas-tile-content");
  console.log("[SWL] kix surface snapshot", {
    frame: window === window.top ? "top" : "iframe",
    pagePaginated: pages.length,
    canvasTiles: tiles.length,
    firstPage: pages[0] instanceof HTMLElement ? pages[0].className : null,
  });
}

function stillMatchesCtx(ctx: PopupCtx): boolean {
  const buf = parsePrefixTail(getDocsKeyBuffer());
  if (!buf || buf.type !== ctx.type || buf.query !== ctx.query || buf.matchLen !== ctx.matchLen) return false;
  if (ctx.domMatch) {
    const st = getCaretPrefixMatch();
    if (
      !st ||
      st.root !== ctx.domMatch.root ||
      st.caretNode !== ctx.domMatch.caretNode ||
      st.caretOffset !== ctx.domMatch.caretOffset ||
      st.matchLen !== ctx.domMatch.matchLen ||
      st.type !== ctx.domMatch.type ||
      st.query !== ctx.domMatch.query
    ) {
      return false;
    }
  }
  return true;
}

function insertChosen(ctx: PopupCtx, token: string): void {
  const live = getCaretPrefixMatch();
  if (live && live.type === ctx.type && live.query === ctx.query) {
    replacePrefixWithToken(live, token);
    clearDocsKeyBuffer();
    return;
  }
  const ok = tryReplaceWithSelectionModify(ctx.matchLen, token);
  clearDocsKeyBuffer();
  if (!ok) {
    void navigator.clipboard.writeText(token);
    console.warn("[SWL] could not insert in-doc; token copied to clipboard:", token);
  }
}

export function setupPagePopup(docId: string): void {
  if (pagePopupInstalled) return;
  pagePopupInstalled = true;

  console.log("[SWL] setupPagePopup (canvas + DOM key path)", {
    docId,
    frame: window === window.top ? "top" : "iframe",
    path: location.pathname,
  });

  ensurePopupStyles();

  let popupGeneration = 0;

  const openPopup = (ctx: PopupCtx): void => {
    popupGeneration++;
    const gen = popupGeneration;
    hidePagePopup();

    swlDebug("page popup: open", ENTITY_PREFIX[ctx.type], ctx.query);

    const root = document.createElement("div");
    root.id = POPUP_ID;

    const header = document.createElement("div");
    header.className = "swl-page-popup-header";

    const kind = document.createElement("div");
    kind.className = "swl-page-popup-kind";
    kind.textContent = ENTITY_TYPE_LIST_HEADING[ctx.type];
    header.appendChild(kind);

    const ul = document.createElement("ul");
    ul.className = "swl-page-popup-list";

    const footer = document.createElement("div");
    footer.className = "swl-page-popup-footer";

    root.appendChild(header);
    root.appendChild(footer);

    void (async () => {
      const matches = await searchEntitiesByPrefix(docId, ctx.type, ctx.query);
      if (gen !== popupGeneration || !stillMatchesCtx(ctx)) return;

      const q = ctx.query.trim();
      const slice = matches.slice(0, 20);

      if (slice.length === 0) {
        const empty = document.createElement("div");
        empty.className = "swl-page-popup-empty";
        empty.textContent =
          q.length === 0
            ? "No saved entries yet. Type a name, then create below."
            : "No matches. Create a new entry below.";
        header.appendChild(empty);
      } else {
        for (const ent of slice) {
          const li = document.createElement("li");
          li.className = "swl-page-popup-item";
          li.textContent = ent.displayName;
          li.addEventListener("mousedown", (ev) => ev.preventDefault());
          li.addEventListener("click", () => {
            const tok = tokenForEntity(ctx.type, ent.displayName);
            insertChosen(ctx, tok);
            hidePagePopup();
            swlDebug("page popup: picked", tok);
          });
          ul.appendChild(li);
        }
        header.appendChild(ul);
      }

      if (q.length > 0) {
        const phrase = ENTITY_TYPE_CREATE_PHRASE[ctx.type];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "swl-page-popup-action";
        const icon = document.createElement("span");
        icon.className = "swl-page-popup-action-icon";
        icon.textContent = "+";
        const lab = document.createElement("span");
        lab.className = "swl-page-popup-action-label";
        lab.textContent = `Create new ${phrase} “${q}”`;
        btn.appendChild(icon);
        btn.appendChild(lab);
        btn.addEventListener("mousedown", (ev) => ev.preventDefault());
        btn.addEventListener("click", () => {
          void (async () => {
            try {
              const ent = await createEntity(docId, ctx.type, q, "");
              const tok = tokenForEntity(ent.type, ent.displayName);
              insertChosen(ctx, tok);
              hidePagePopup();
              swlDebug("page popup: created", tok);
            } catch (e) {
              swlDebug("page popup: create failed", String(e));
            }
          })();
        });
        footer.appendChild(btn);
      } else {
        footer.style.display = "none";
      }

      if (gen !== popupGeneration || !stillMatchesCtx(ctx)) return;
      positionPopup(root, ctx.rect);
    })();
  };

  const cap = true;

  /** Same keydown can hit window capture then canvas capture — process once. */
  const keydownSeen = new WeakSet<KeyboardEvent>();

  const onTypingKeydown = (e: KeyboardEvent): void => {
    if (keydownSeen.has(e)) return;
    keydownSeen.add(e);

    const t = e.target;
    const targetHint =
      t instanceof Element
        ? `${t.tagName}.${(t as HTMLElement).className?.split?.(" ")?.slice(0, 3)?.join(".") ?? ""}`
        : String(t);    

    if (e.key === "Escape") {
      hidePagePopup();
      clearDocsKeyBuffer();
      return;
    }
    if (!keydownTargetsManuscript(e)) return;

    recordDocsKeydown(e);
    const parsed = parsePrefixTail(getDocsKeyBuffer());

    if (!parsed) {
      hidePagePopup();
      return;
    }

    const domMatch = getCaretPrefixMatch();
    const rect = anchorRectForPopup(domMatch);
    openPopup({
      type: parsed.type,
      query: parsed.query,
      matchLen: parsed.matchLen,
      rect,
      domMatch: domMatch && domMatch.type === parsed.type && domMatch.query === parsed.query ? domMatch : null,
    });
  };

  const KIX_KEYDOWN_ATTR = "data-swl-kix-keydown";

  const bindKixKeyTargets = (): void => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".kix-canvas-tile-content, .kix-page-paginated.canvas-first-page, .kix-page-paginated"
      )
    );
    for (const el of nodes) {
      if (el.hasAttribute(KIX_KEYDOWN_ATTR)) continue;
      el.setAttribute(KIX_KEYDOWN_ATTR, "1");
      el.addEventListener("keydown", onTypingKeydown, true);
    }
  };

  let moTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleKixBind = (): void => {
    if (moTimer) clearTimeout(moTimer);
    moTimer = setTimeout(() => {
      moTimer = undefined;
      bindKixKeyTargets();
    }, 50);
  };

  window.addEventListener("keydown", onTypingKeydown, cap);

  const mo = new MutationObserver(scheduleKixBind);
  mo.observe(document.documentElement, { childList: true, subtree: true });

  queueMicrotask(() => {
    bindKixKeyTargets();
    logKixSurfaceDebug();
  });

  document.addEventListener(
    "mousedown",
    (e) => {
      const el = e.target as Node | null;
      const pop = document.getElementById(POPUP_ID);
      if (pop && el && !pop.contains(el)) hidePagePopup();
    },
    true
  );

  swlDebug("page popup listener installed", location.pathname.slice(0, 40));
  console.log("[SWL] pagePopup: window + kix canvas/page keydown (capture), MutationObserver rebind");
}
