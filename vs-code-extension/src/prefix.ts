import {
  entityPrefixPattern,
  entityTypeFromPrefix,
  PLAIN_ENTITY_NAME,
  type EntityType,
} from "./types";

const PREFIX_RE = new RegExp(`(${entityPrefixPattern()}):(${PLAIN_ENTITY_NAME})?$`, "i");

export interface PrefixMatch {
  type: EntityType;
  query: string;
  /** Start column of the matched prefix (0-based). */
  startColumn: number;
  /** End column (exclusive) — usually the cursor column. */
  endColumn: number;
}

/** Detect `C:query` immediately before the cursor on the current line. */
export function getPrefixMatch(lineText: string, cursorColumn: number): PrefixMatch | null {
  const before = lineText.slice(0, cursorColumn);
  const m = before.match(PREFIX_RE);
  if (!m) return null;
  const type = entityTypeFromPrefix(m[1]);
  if (!type) return null;
  const query = m[2] ?? "";
  const startColumn = before.length - m[0].length;
  return { type, query, startColumn, endColumn: cursorColumn };
}
