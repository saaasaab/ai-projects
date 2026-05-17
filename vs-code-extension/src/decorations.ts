import * as vscode from "vscode";
import { EntityStore } from "./entityStorage";
import { findReferenceSpans } from "./referenceSyntax";
import { ENTITY_DEFS, type Entity, type EntityType } from "./types";

const CHIP_COLORS: Record<EntityType, { bg: string; border: string }> = {
  character: { bg: "#3b599866", border: "#3b5998cc" },
  location: { bg: "#2d6a4f66", border: "#2d6a4fcc" },
  religion: { bg: "#6a4c9366", border: "#6a4c93cc" },
  idea: { bg: "#e9c46a55", border: "#e9c46acc" },
  event: { bg: "#e76f5166", border: "#e76f51cc" },
  organization: { bg: "#457b9d66", border: "#457b9dcc" },
};

const CHIP_COLORS_VIVID: Record<EntityType, { bg: string; border: string }> = {
  character: { bg: "#3b599899", border: "#3b5998" },
  location: { bg: "#2d6a4f99", border: "#2d6a4f" },
  religion: { bg: "#6a4c9399", border: "#6a4c93" },
  idea: { bg: "#e9c46a99", border: "#e9c46a" },
  event: { bg: "#e76f5199", border: "#e76f51" },
  organization: { bg: "#457b9d99", border: "#457b9d" },
};

function entityLookupKey(type: EntityType, displayName: string): string {
  return `${type}:${displayName.trim().toLowerCase()}`;
}

export class EntityDecorationManager implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly styles = new Map<EntityType, vscode.TextEditorDecorationType>();
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private refreshGeneration = 0;

  constructor(private readonly store: EntityStore) {
    for (const type of Object.keys(CHIP_COLORS) as EntityType[]) {
      this.styles.set(type, this.createStyle(type));
    }

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((ed) => {
        if (ed) void this.refresh(ed);
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        const ed = vscode.window.activeTextEditor;
        if (ed && e.document === ed.document) this.scheduleRefresh(ed);
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("semanticWriting.chipStyle")) {
          this.rebuildStyles();
          for (const ed of vscode.window.visibleTextEditors) {
            void this.refresh(ed);
          }
        }
      })
    );

    for (const ed of vscode.window.visibleTextEditors) {
      void this.refresh(ed);
    }
  }

  private createStyle(type: EntityType): vscode.TextEditorDecorationType {
    const vivid = vscode.workspace.getConfiguration("semanticWriting").get("chipStyle") === "vivid";
    const palette = vivid ? CHIP_COLORS_VIVID : CHIP_COLORS;
    const { bg, border } = palette[type];
    return vscode.window.createTextEditorDecorationType({
      backgroundColor: bg,
      border: `2px solid ${border}`,
      borderRadius: "6px",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      cursor: "pointer",
    });
  }

  private rebuildStyles(): void {
    for (const d of this.styles.values()) d.dispose();
    this.styles.clear();
    for (const type of Object.keys(CHIP_COLORS) as EntityType[]) {
      this.styles.set(type, this.createStyle(type));
    }
  }

  private scheduleRefresh(editor: vscode.TextEditor): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      void this.refresh(editor);
    }, 80);
  }

  async refresh(editor: vscode.TextEditor): Promise<void> {
    const generation = ++this.refreshGeneration;
    try {
      const text = editor.document.getText();
      const spans = findReferenceSpans(text);
      const entities = await this.store.listEntitiesRaw();
      const entityByKey = new Map<string, Entity>();
      for (const entity of entities) {
        entityByKey.set(entityLookupKey(entity.type, entity.displayName), entity);
      }

      const byType = new Map<EntityType, vscode.DecorationOptions[]>();
      for (const type of Object.keys(CHIP_COLORS) as EntityType[]) {
        byType.set(type, []);
      }

      for (const span of spans) {
        const start = editor.document.positionAt(span.start);
        const end = editor.document.positionAt(span.end);
        const range = new vscode.Range(start, end);
        const label = span.displayName;
        const entity = entityByKey.get(entityLookupKey(span.type, span.displayName));

        const hover = new vscode.MarkdownString(
          `**${ENTITY_DEFS[span.type].label}** · ${label}` +
            (entity ? "" : " _(not in Story Bible)_") +
            `\n\nClick to open readme.`
        );
        hover.isTrusted = true;

        byType.get(span.type)?.push({ range, hoverMessage: hover });
      }

      if (generation !== this.refreshGeneration) return;

      for (const [type, options] of byType) {
        const style = this.styles.get(type);
        if (style) editor.setDecorations(style, options);
      }
    } catch (err) {
      console.error("Semantic Writing: decoration refresh failed", err);
    }
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    for (const d of this.styles.values()) d.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
