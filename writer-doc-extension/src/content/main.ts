import "./debugLog";
import { getDocIdFromUrl } from "./docId";
import { setupPagePopup } from "./pagePopup";
import { mountPanel } from "./panel";

const DOC_ID_POLL_MS = 200;
const DOC_ID_POLL_MAX = 100;

function initWithDocId(docId: string): void {
  console.log("[SWL] init content script", { docId, frame: window === window.top ? "top" : "iframe", path: location.pathname });
  setupPagePopup(docId);
  if (window === window.top) mountPanel(docId);
}

/**
 * Runs in every matching frame on docs.google.com (see manifest all_frames).
 * Editor iframes often load before `/document/d/…` is visible on `location` or `referrer`;
 * polling avoids bailing once with no listeners so typing `C:` never opens the page popup.
 */
function main(): void {
  console.log("[SWL] main()", {
    frame: window === window.top ? "top" : "iframe",
    path: location.pathname,
    docIdNow: getDocIdFromUrl(),
  });

  const now = getDocIdFromUrl();
  if (now) {
    initWithDocId(now);
    return;
  }

  console.log("[SWL] doc id not ready; polling…");

  let ticks = 0;
  const id = window.setInterval(() => {
    ticks++;
    const docId = getDocIdFromUrl();
    if (docId) {
      window.clearInterval(id);
      console.log("[SWL] doc id resolved after polls", { ticks, docId });
      initWithDocId(docId);
      return;
    }
    if (ticks >= DOC_ID_POLL_MAX) {
      window.clearInterval(id);
      console.warn("[SWL] gave up waiting for doc id", { ticks, path: location.pathname });
    }
  }, DOC_ID_POLL_MS);
}

main();
