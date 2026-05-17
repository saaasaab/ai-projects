import { ENTITY_PREFIX, type EntityType } from "../types";

export const INSERT_CHANNEL = "semantic-writing-layer:insert";

export type InsertMessage = { type: "INSERT_AT_CURSOR"; text: string };

export function broadcastInsert(text: string): void {
  const bc = new BroadcastChannel(INSERT_CHANNEL);
  bc.postMessage({ type: "INSERT_AT_CURSOR", text } satisfies InsertMessage);
  bc.close();
}

/** Register in every Docs frame; only the focused editor frame should accept insert. */
export function setupInsertListener(): void {
  const bc = new BroadcastChannel(INSERT_CHANNEL);
  bc.addEventListener("message", (ev: MessageEvent<InsertMessage>) => {
    if (!ev.data || ev.data.type !== "INSERT_AT_CURSOR") return;
    const text = ev.data.text;
    if (typeof text !== "string" || !text) return;
    tryInsertAtCaret(text);
  });
}

function tryInsertAtCaret(text: string): void {
  const el = document.activeElement as HTMLElement | null;
  if (!el?.isContentEditable) return;
  try {
    const ok = document.execCommand("insertText", false, text);
    if (!ok) {
      console.warn("[semantic-writing-layer] insertText was rejected");
    }
  } catch (e) {
    console.warn("[semantic-writing-layer] insert failed", e);
  }
}

export function tokenForEntity(type: EntityType, displayName: string): string {
  return `${ENTITY_PREFIX[type]}:${displayName}`;
}
