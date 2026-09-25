import * as vscode from "vscode";
import {
  entityPrefix,
  entityPrefixPattern,
  entityTypeFromPrefix,
  isBraceSyntaxType,
  PLAIN_ENTITY_NAME,
  standardEntityPrefixPattern,
  type Entity,
  type EntityType,
} from "./types";

export type ReferenceSyntax = "bracket" | "plain";

export function getReferenceSyntax(): ReferenceSyntax {
  const cfg = vscode.workspace.getConfiguration("semanticWriting");
  const v = cfg.get<string>("referenceSyntax");
  return v === "plain" ? "plain" : "bracket";
}

/** Bracket form stored in the manuscript: `[[C:Claire]]` or `[[N:{text}]]`. */
export function bracketReference(type: EntityType, displayName: string): string {
  if (isBraceSyntaxType(type)) {
    const body = displayName.startsWith("{") ? displayName : `{${displayName}}`;
    return `[[${entityPrefix(type)}:${body}]]`;
  }
  return `[[${entityPrefix(type)}:${displayName}]]`;
}

/** Plain form: `C:Claire` or `N:{note text}`. */
export function plainToken(type: EntityType, displayName: string): string {
  if (isBraceSyntaxType(type)) {
    const body = displayName.startsWith("{") ? displayName : `{${displayName}}`;
    return `${entityPrefix(type)}:${body}`;
  }
  return `${entityPrefix(type)}:${displayName}`;
}

export function referenceInsertText(entity: Entity): string {
  return getReferenceSyntax() === "plain"
    ? plainToken(entity.type, entity.displayName)
    : bracketReference(entity.type, entity.displayName);
}

/** Inline note token: `N:{content}`. Content may not contain `}`. */
export function noteToken(content: string): string {
  return `N:{${content}}`;
}

const BRACKET_RE = new RegExp(
  `\\[\\[(${entityPrefixPattern()}):([^\\]]+)\\]\\]`,
  "gi"
);
const PLAIN_RE = new RegExp(
  `\\b(${standardEntityPrefixPattern()}):(${PLAIN_ENTITY_NAME})`,
  "g"
);
const NOTE_PLAIN_RE = /\bN:\{([^}]*)\}/g;
const NOTE_BRACKET_RE = /\[\[N:\{([^}]*)\}\]\]/gi;

export interface ReferenceSpan {
  start: number;
  end: number;
  type: EntityType;
  displayName: string;
}

function overlapsSpan(spans: ReferenceSpan[], index: number, end: number): boolean {
  return spans.some((s) => index >= s.start && index < s.end);
}

export function findReferenceSpans(text: string): ReferenceSpan[] {
  const spans: ReferenceSpan[] = [];
  let m: RegExpExecArray | null;

  BRACKET_RE.lastIndex = 0;
  while ((m = BRACKET_RE.exec(text)) !== null) {
    const type = entityTypeFromPrefix(m[1]);
    if (!type) continue;
    if (isBraceSyntaxType(type)) continue;
    spans.push({
      start: m.index,
      end: m.index + m[0].length,
      type,
      displayName: m[2].trim(),
    });
  }

  NOTE_BRACKET_RE.lastIndex = 0;
  while ((m = NOTE_BRACKET_RE.exec(text)) !== null) {
    const overlaps = overlapsSpan(spans, m.index, m.index + m[0].length);
    if (overlaps) continue;
    spans.push({
      start: m.index,
      end: m.index + m[0].length,
      type: "notes",
      displayName: m[1],
    });
  }

  PLAIN_RE.lastIndex = 0;
  while ((m = PLAIN_RE.exec(text)) !== null) {
    const type = entityTypeFromPrefix(m[1]);
    if (!type) continue;
    const name = m[2];
    if (overlapsSpan(spans, m.index, m.index + m[1].length + 1 + name.length)) continue;
    spans.push({
      start: m.index,
      end: m.index + m[1].length + 1 + name.length,
      type,
      displayName: name,
    });
  }

  NOTE_PLAIN_RE.lastIndex = 0;
  while ((m = NOTE_PLAIN_RE.exec(text)) !== null) {
    if (overlapsSpan(spans, m.index, m.index + m[0].length)) continue;
    spans.push({
      start: m.index,
      end: m.index + m[0].length,
      type: "notes",
      displayName: m[1],
    });
  }

  spans.sort((a, b) => a.start - b.start);
  return spans;
}

export function bracketPatternForRename(type: EntityType, oldName: string): RegExp {
  const letter = entityPrefix(type);
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\[\\[${letter}:${escaped}\\]\\]`, "g");
}

export function plainPatternForRename(type: EntityType, oldName: string): RegExp {
  const letter = entityPrefix(type);
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${letter}:${escaped}\\b`, "g");
}

export function renameReferenceText(
  text: string,
  type: EntityType,
  oldName: string,
  newName: string
): string {
  if (isBraceSyntaxType(type)) return text;
  const bracketRe = bracketPatternForRename(type, oldName);
  const plainRe = plainPatternForRename(type, oldName);
  const syntax = getReferenceSyntax();
  let next = text.replace(bracketRe, bracketReference(type, newName));
  next = next.replace(
    plainRe,
    syntax === "plain" ? plainToken(type, newName) : bracketReference(type, newName)
  );
  return next;
}
