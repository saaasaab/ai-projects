const DOC_ID_RE = /\/document\/d\/([a-zA-Z0-9-_]+)/;

function idFromHref(href: string | undefined | null): string | null {
  if (!href) return null;
  return DOC_ID_RE.exec(href)?.[1] ?? null;
}

/**
 * Resolves the Google Doc id for storage + UI. Uses the top URL when readable, then this frame,
 * then `document.referrer` (helps inner iframes whose own URL does not include `/document/d/…`).
 */
export function getDocIdFromUrl(): string | null {
  try {
    const topHref = window.top?.location?.href;
    const fromTop = idFromHref(topHref);
    if (fromTop) return fromTop;
  } catch {
    // cross-origin top — fall through
  }

  const fromSelf = idFromHref(window.location.href);
  if (fromSelf) return fromSelf;

  try {
    const fromRef = idFromHref(document.referrer);
    if (fromRef) return fromRef;
  } catch {
    // ignore
  }

  return null;
}
