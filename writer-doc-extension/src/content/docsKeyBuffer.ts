const MAX = 240;
let buf = "";

export function clearDocsKeyBuffer(): void {
  buf = "";
}

/** Call from capture-phase keydown when the user is typing in the manuscript. */
export function recordDocsKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    buf = "";
    return;
  }
  if (e.isComposing) return;
  if (e.key === "Backspace") {
    buf = buf.slice(0, -1);
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length === 1) {
    buf = (buf + e.key).slice(-MAX);
  }
}

export function getDocsKeyBuffer(): string {
  return buf;
}
