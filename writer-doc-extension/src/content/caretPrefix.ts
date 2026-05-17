import { PREFIX_TO_TYPE, type EntityType } from "../types";

const ZW = /[\u200b-\u200d\ufeff]/g;
/** Docs often inserts zero-width chars between the letter and `:`. */
/** Docs may use ASCII `:` or fullwidth `：`. */
const PREFIX_RE = /([CLRIEO])[\u200b-\u200d\ufeff]*[:\uff1a][\u200b-\u200d\ufeff]*([^:\uff1a]*)$/i;

/** Last `C:…` / `L:…` etc. in a plain string (e.g. accumulated keydown buffer for canvas Docs). */
export function parsePrefixTail(text: string): { type: EntityType; query: string; matchLen: number } | null {
  const tail = text.slice(-2048);
  const m = tail.match(PREFIX_RE);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const type = PREFIX_TO_TYPE[letter];
  if (!type) return null;
  const query = (m[2] ?? "").replace(ZW, "");
  return { type, query, matchLen: m[0].length };
}

export interface CaretPrefixMatch {
  type: EntityType;
  query: string;
  matchLen: number;
  /** Subtree used for Range.toString() when the prefix was detected. */
  root: Node;
  caretNode: Node;
  caretOffset: number;
}

const DOC_SURFACE_SELECTORS = [".kix-appview-editor", ".kix-paginateddocumentplugin"] as const;

/** True when the caret / node lives in the visible Google Docs manuscript surface (not chrome, not our panel). */
export function isNodeUnderGoogleDocSurface(node: Node | null): boolean {
  if (!node) return false;
  const el = node.nodeType === Node.TEXT_NODE ? (node as Text).parentElement : (node as Element | null);
  if (!el?.closest) return false;
  for (const sel of DOC_SURFACE_SELECTORS) {
    if (el.closest(sel)) return true;
  }
  return false;
}

/** True if any node in the event path sits under the Docs manuscript surface. */
export function eventTouchesGoogleDocSurface(ev: Event): boolean {
  for (const n of ev.composedPath()) {
    if (n instanceof Node && isNodeUnderGoogleDocSurface(n)) return true;
  }
  return false;
}

function findEditorRoot(anchor: Node | null): HTMLElement {
  const start =
    anchor?.nodeType === Node.TEXT_NODE ? (anchor as Text).parentElement : (anchor as Element | null);
  if (start) {
    for (const sel of DOC_SURFACE_SELECTORS) {
      const hit = start.closest(sel);
      if (hit instanceof HTMLElement) return hit;
    }
  }
  let el: Element | null = start;
  while (el && el !== document.documentElement) {
    if (el instanceof HTMLElement) {
      if (el.isContentEditable) return el;
      if (el.getAttribute("role") === "textbox") return el;
    }
    el = el.parentElement;
  }
  return document.body;
}

function getWalkRoot(anchor: Node): Node {
  const rn = anchor.getRootNode();
  if (rn instanceof ShadowRoot) return rn;
  return findEditorRoot(anchor);
}

function candidateRoots(anchor: Node): Node[] {
  const out: Node[] = [];
  const seen = new Set<Node>();
  const add = (n: Node | null | undefined): void => {
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  add(getWalkRoot(anchor));
  add(findEditorRoot(anchor));
  return out;
}

/** Text before caret — Range.toString() usually matches what Docs shows even when a raw Text walk does not. */
function stringBeforeCaret(root: Node, caretNode: Node, caretOffset: number): string {
  const endR = document.createRange();
  try {
    endR.selectNodeContents(root);
    endR.setEnd(caretNode, caretOffset);
    return endR.toString();
  } catch {
    return "";
  }
}

function firstIncludedOffset(t: Text, rng: Range): number {
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    try {
      if (rng.comparePoint(t, mid) === -1) lo = mid + 1;
      else hi = mid;
    } catch {
      return 0;
    }
  }
  return lo;
}

function lastIncludedExclusive(t: Text, rng: Range): number {
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    try {
      if (rng.comparePoint(t, mid) === 1) hi = mid - 1;
      else lo = mid;
    } catch {
      return 0;
    }
  }
  return lo;
}

function collectTextChunks(root: Node, endR: Range): { t: Text; s: number; e: number }[] {
  const chunks: { t: Text; s: number; e: number }[] = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = w.nextNode())) {
    const t = n as Text;
    try {
      if (!endR.intersectsNode(t)) continue;
    } catch {
      continue;
    }
    const s = firstIncludedOffset(t, endR);
    const e = lastIncludedExclusive(t, endR);
    if (e > s) chunks.push({ t, s, e });
  }
  return chunks;
}

function rangeForSuffixLenChunks(
  root: Node,
  caretNode: Node,
  caretOffset: number,
  suffixLen: number
): Range | null {
  const endR = document.createRange();
  try {
    endR.selectNodeContents(root);
    endR.setEnd(caretNode, caretOffset);
  } catch {
    return null;
  }
  const chunks = collectTextChunks(root, endR);
  const rebuilt = chunks.map((ch) => (ch.t.nodeValue ?? "").slice(ch.s, ch.e)).join("");
  if (suffixLen > rebuilt.length || suffixLen <= 0) return null;
  const skip = rebuilt.length - suffixLen;

  const out = document.createRange();
  let pos = 0;
  for (const ch of chunks) {
    const len = ch.e - ch.s;
    const next = pos + len;
    if (skip < next) {
      const startInT = ch.s + (skip - pos);
      try {
        out.setStart(ch.t, startInT);
        out.setEnd(caretNode, caretOffset);
      } catch {
        return null;
      }
      return out;
    }
    pos = next;
  }
  return null;
}

/** Chrome: extend selection backward by whole characters (works well in Docs when DOM ranges are awkward). */
function rangeViaSelectionModify(suffixLen: number): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const modify = sel.modify;
  if (typeof modify !== "function") return null;

  const anchorNode = sel.anchorNode;
  const anchorOffset = sel.anchorOffset;
  if (!anchorNode) return null;

  for (let i = 0; i < suffixLen; i++) {
    const fn = sel.focusNode;
    const fo = sel.focusOffset;
    modify.call(sel, "extend", "backward", "character");
    if (sel.focusNode === fn && sel.focusOffset === fo) {
      sel.removeAllRanges();
      try {
        sel.setPosition(anchorNode, anchorOffset);
      } catch {
        /* ignore */
      }
      return null;
    }
  }

  let r: Range | null = null;
  try {
    if (!sel.isCollapsed) r = sel.getRangeAt(0).cloneRange();
  } catch {
    r = null;
  }

  sel.removeAllRanges();
  try {
    sel.setPosition(anchorNode, anchorOffset);
  } catch {
    /* ignore */
  }

  if (!r) return null;
  try {
    if (r.toString().length !== suffixLen) return null;
  } catch {
    return null;
  }
  return r;
}

/**
 * Reads `C:query` (etc.) immediately left of the caret. Uses Range.toString() for detection (Docs-friendly),
 * then chunk-based or Selection.modify ranges for replacement.
 */
export function getCaretPrefixMatch(): CaretPrefixMatch | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;

  const caretNode = sel.anchorNode;
  const caretOffset = sel.anchorOffset;
  if (!caretNode) return null;

  if (!isNodeUnderGoogleDocSurface(caretNode)) return null;

  for (const root of candidateRoots(caretNode)) {
    const rebuilt = stringBeforeCaret(root, caretNode, caretOffset);
    const tail = rebuilt.slice(-2048);
    const m = tail.match(PREFIX_RE);
    if (!m) continue;

    const letter = m[1].toUpperCase();
    const type = PREFIX_TO_TYPE[letter];
    if (!type) continue;

    const query = (m[2] ?? "").replace(ZW, "");
    const matchLen = m[0].length;

    return { type, query, matchLen, root, caretNode, caretOffset };
  }

  return null;
}

export function getPrefixReplaceRange(m: CaretPrefixMatch): Range | null {
  return rangeForSuffixLenChunks(m.root, m.caretNode, m.caretOffset, m.matchLen);
}

export function replacePrefixWithToken(m: CaretPrefixMatch, token: string): void {
  const r =
    rangeForSuffixLenChunks(m.root, m.caretNode, m.caretOffset, m.matchLen) ??
    rangeViaSelectionModify(m.matchLen);
  const sel = window.getSelection();
  if (!r || !sel) return;
  sel.removeAllRanges();
  sel.addRange(r);
  document.execCommand("insertText", false, token);
}

/**
 * When there is no DOM range (canvas manuscript), try extending the collapsed selection
 * backward by `matchLen` character positions, then insertText.
 */
export function tryReplaceWithSelectionModify(matchLen: number, token: string): boolean {
  if (matchLen <= 0) return false;
  const r = rangeViaSelectionModify(matchLen);
  if (!r) return false;
  const sel = window.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(r);
  try {
    return document.execCommand("insertText", false, token);
  } catch {
    return false;
  }
}
