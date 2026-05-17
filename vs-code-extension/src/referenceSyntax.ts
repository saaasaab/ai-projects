import * as vscode from "vscode";
import {
  entityPrefix,
  entityPrefixPattern,
  entityTypeFromPrefix,
  PLAIN_ENTITY_NAME,
  type Entity,
  type EntityType,
} from "./types";

export type ReferenceSyntax = "bracket" | "plain";

export function getReferenceSyntax(): ReferenceSyntax {
  const cfg = vscode.workspace.getConfiguration("semanticWriting");
  const v = cfg.get<string>("referenceSyntax");
  return v === "plain" ? "plain" : "bracket";
}

/** Bracket form stored in the manuscript: `[[C:Claire]]`. */
export function bracketReference(type: EntityType, displayName: string): string {
  return `[[${entityPrefix(type)}:${displayName}]]`;
}

/** Plain form: `C:Claire`. */
export function plainToken(type: EntityType, displayName: string): string {
  return `${entityPrefix(type)}:${displayName}`;
}

export function referenceInsertText(entity: Entity): string {
  return getReferenceSyntax() === "plain"
    ? plainToken(entity.type, entity.displayName)
    : bracketReference(entity.type, entity.displayName);
}

const BRACKET_RE = new RegExp(
  `\\[\\[(${entityPrefixPattern()}):([^\\]]+)\\]\\]`,
  "gi"
);
const PLAIN_RE = new RegExp(`\\b(${entityPrefixPattern()}):(${PLAIN_ENTITY_NAME})`, "g");

export interface ReferenceSpan {
  start: number;
  end: number;
  type: EntityType;
  displayName: string;
}

export function findReferenceSpans(text: string): ReferenceSpan[] {
  const spans: ReferenceSpan[] = [];
  let m: RegExpExecArray | null;

  BRACKET_RE.lastIndex = 0;
  while ((m = BRACKET_RE.exec(text)) !== null) {
    const type = entityTypeFromPrefix(m[1]);
    if (!type) continue;
    spans.push({
      start: m.index,
      end: m.index + m[0].length,
      type,
      displayName: m[2].trim(),
    });
  }

  PLAIN_RE.lastIndex = 0;
  while ((m = PLAIN_RE.exec(text)) !== null) {
    const type = entityTypeFromPrefix(m[1]);
    if (!type) continue;
    const name = m[2];
    const overlaps = spans.some((s) => m!.index >= s.start && m!.index < s.end);
    if (overlaps) continue;
    spans.push({
      start: m.index,
      end: m.index + m[1].length + 1 + name.length,
      type,
      displayName: name,
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
