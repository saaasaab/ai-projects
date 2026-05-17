import * as vscode from "vscode";
import {
  EntityCompletionProvider,
  registerSuggestOnPrefix,
} from "./completionProvider";
import { EntityDecorationManager } from "./decorations";
import { EntityStore } from "./entityStorage";
import { renameEntityAcrossWorkspace } from "./rename";
import { referenceInsertText } from "./referenceSyntax";
import { registerReferenceNavigation } from "./referenceNavigation";
import { StoryBiblePanelProvider } from "./storyBiblePanel";
import { registerUsageTracking } from "./usageTracker";
import { ENTITY_DEFS, ENTITY_TYPES } from "./types";

let store: EntityStore;
let decorations: EntityDecorationManager;
let storyBible: StoryBiblePanelProvider;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    store = new EntityStore(context);
    await store.initialize();
  } catch (err) {
    console.error("Semantic Writing: store init failed", err);
    void vscode.window.showErrorMessage(
      `Semantic Writing failed to start: ${err instanceof Error ? err.message : String(err)}`
    );
    store = new EntityStore(context);
  }

  decorations = new EntityDecorationManager(store);
  storyBible = new StoryBiblePanelProvider(context.extensionUri, store);

  const completionSelector: vscode.DocumentSelector = [
    { language: "markdown" },
    { language: "plaintext" },
  ];

  registerSuggestOnPrefix(context);
  registerReferenceNavigation(context, store);
  registerUsageTracking(context, store, () => {
    void storyBible.refresh();
    const ed = vscode.window.activeTextEditor;
    if (ed) void decorations.refresh(ed);
  });

  context.subscriptions.push(
    store,
    decorations,
    vscode.languages.registerCompletionItemProvider(
      completionSelector,
      new EntityCompletionProvider(store),
      ":",
      ...ENTITY_TYPES.map((t) => ENTITY_DEFS[t].prefix)
    ),
    vscode.window.registerWebviewViewProvider(StoryBiblePanelProvider.viewType, storyBible),
    vscode.commands.registerCommand("semanticWriting.openStoryBible", async () => {
      await vscode.commands.executeCommand("workbench.view.explorer");
      await vscode.commands.executeCommand(`${StoryBiblePanelProvider.viewType}.focus`);
    }),
    vscode.commands.registerCommand("semanticWriting.openStoryBibleFile", async () => {
      const uri = store.getStoryBibleUri();
      if (!uri) {
        void vscode.window.showWarningMessage(
          "Open a workspace folder first — the Story Bible is saved as a file in your project."
        );
        return;
      }
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    }),
    vscode.commands.registerCommand("semanticWriting.refreshDecorations", () => {
      const ed = vscode.window.activeTextEditor;
      if (ed) void decorations.refresh(ed);
    }),
    vscode.commands.registerCommand("semanticWriting.renameEntity", async () => {
      const entities = await store.listEntities();
      if (entities.length === 0) {
        void vscode.window.showInformationMessage("No entities in this workspace yet.");
        return;
      }
      const pick = await vscode.window.showQuickPick(
        entities.map((e) => ({
          label: e.displayName,
          description: e.type,
          entity: e,
        })),
        { placeHolder: "Choose an entity to rename" }
      );
      if (!pick) return;
      const newName = await vscode.window.showInputBox({
        prompt: "New display name",
        value: pick.entity.displayName,
      });
      if (!newName || newName === pick.entity.displayName) return;
      try {
        await renameEntityAcrossWorkspace(store, pick.entity, newName);
        void storyBible.refresh();
        const ed = vscode.window.activeTextEditor;
        if (ed) void decorations.refresh(ed);
        void vscode.window.showInformationMessage(`Renamed "${pick.entity.displayName}" → "${newName.trim()}".`);
      } catch (err) {
        void vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
      }
    }),
    vscode.commands.registerCommand("semanticWriting.insertReference", async () => {
      const entities = await store.listEntities();
      if (entities.length === 0) {
        void vscode.window.showInformationMessage("Create entities in the Story Bible or type C: in the editor.");
        return;
      }
      const pick = await vscode.window.showQuickPick(
        entities.map((e) => ({
          label: e.displayName,
          description: e.type,
          entity: e,
        })),
        { placeHolder: "Insert entity reference at cursor" }
      );
      if (!pick) return;
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const insert = referenceInsertText(pick.entity);
      await editor.edit((eb) => eb.insert(editor.selection.active, insert));
      void decorations.refresh(editor);
    })
  );

  if (vscode.window.activeTextEditor) {
    void decorations.refresh(vscode.window.activeTextEditor);
  }
}

export function deactivate(): void {}
