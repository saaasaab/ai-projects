import {
  boundsFromNode,
  fillsForStripColor,
  maskLocalBounds,
  stripRelativeTransform,
  type CoverParent,
} from "./figma-geometry";
import type { Bounds } from "./types";
import { generateStrips, rectsIntersect, suggestOrientation } from "./geometry";
import type { PluginOptions, SampleResponsePayload, StripColor, UiToMainMessage } from "./types";

let pendingApply: {
  maskId: string;
  sourceId: string;
  pageId: string;
  options: PluginOptions;
} | null = null;

figma.showUI(__html__, { width: 300, height: 440, themeColors: true });

type MaskNode = SceneNode & LayoutMixin;

function isSceneNode(node: BaseNode): node is SceneNode {
  return node.type !== "PAGE" && node.type !== "DOCUMENT";
}

function isMaskNode(node: BaseNode): node is MaskNode {
  return isSceneNode(node) && "width" in node && "height" in node;
}

function isCoverParent(node: BaseNode): node is CoverParent {
  return node.type === "PAGE" || isSceneNode(node);
}

function canExport(node: SceneNode): boolean {
  return "exportAsync" in node;
}

function isDescendantOf(node: BaseNode, ancestor: BaseNode): boolean {
  let parent = node.parent;
  while (parent) {
    if (parent.id === ancestor.id) return true;
    parent = parent.parent;
  }
  return false;
}

function getSelectedMask(): MaskNode | null {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) return null;
  return isMaskNode(selection[0]) ? selection[0] : null;
}

function findExportableIntersecting(
  node: BaseNode,
  maskBounds: Bounds,
  mask: MaskNode
): SceneNode | null {
  if (!isSceneNode(node) || node.id === mask.id) return null;
  if (isDescendantOf(mask, node)) return null;

  if (canExport(node) && node.visible) {
    const bounds = boundsFromNode(node);
    if (bounds && rectsIntersect(maskBounds, bounds)) return node;
  }

  if ("children" in node) {
    for (let i = node.children.length - 1; i >= 0; i--) {
      const hit = findExportableIntersecting(node.children[i], maskBounds, mask);
      if (hit) return hit;
    }
  }

  return null;
}

function findSourceUnderMask(mask: MaskNode): SceneNode | null {
  const maskBounds = boundsFromNode(mask);
  if (!maskBounds) return null;

  const parent = mask.parent;
  if (parent && "children" in parent) {
    const maskIndex = parent.children.indexOf(mask);
    for (let i = maskIndex - 1; i >= 0; i--) {
      const hit = findExportableIntersecting(parent.children[i], maskBounds, mask);
      if (hit) return hit;
    }
  }

  let ancestor: BaseNode | null = mask.parent;
  while (ancestor && ancestor.type !== "PAGE" && ancestor.type !== "DOCUMENT") {
    const ancestorParent = ancestor.parent;
    if (ancestorParent && "children" in ancestorParent) {
      const ancestorIndex = ancestorParent.children.indexOf(ancestor);
      for (let i = ancestorIndex - 1; i >= 0; i--) {
        const hit = findExportableIntersecting(ancestorParent.children[i], maskBounds, mask);
        if (hit) return hit;
      }
    }
    ancestor = ancestorParent;
  }

  return null;
}

function resolveSelection(): { mask: MaskNode; source: SceneNode } | string {
  const mask = getSelectedMask();

  if (!mask) {
    const count = figma.currentPage.selection.length;
    if (count === 0) return "Select one rectangle or frame over the area to cover.";
    if (count > 1) return "Select only one layer.";
    return "Selected layer cannot be used. Try a rectangle or frame.";
  }

  const source = findSourceUnderMask(mask);

  if (!source) {
    return "No layer found under the selection. Place it over an image or exportable frame.";
  }

  return { mask, source };
}

function logSelection(): void {
  const selection = [...figma.currentPage.selection];

  console.log("[AutoCover] selection changed", {
    count: selection.length,
    nodes: selection.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      width: "width" in node ? node.width : undefined,
      height: "height" in node ? node.height : undefined,
      isMaskCandidate: isMaskNode(node),
    })),
  });
}

function sendMaskPreview(): void {
  logSelection();

  const mask = getSelectedMask();

  if (!mask) {
    const count = figma.currentPage.selection.length;
    console.log("[AutoCover] no valid mask", {
      count,
      reason:
        count === 0
          ? "nothing selected"
          : count > 1
            ? "multiple layers selected"
            : "selected layer is not a rectangle/frame",
    });
    figma.ui.postMessage({
      type: "mask-preview",
      status: "none",
      message:
        count === 0
          ? "Select your rectangle"
          : count > 1
            ? "Select only one layer"
            : "Select a rectangle or frame",
    });
    return;
  }

  console.log("[AutoCover] mask selected", {
    id: mask.id,
    name: mask.name,
    type: mask.type,
    width: mask.width,
    height: mask.height,
    x: mask.x,
    y: mask.y,
  });

  const maskBounds = boundsFromNode(mask);

  figma.ui.postMessage({
    type: "mask-preview",
    status: "ok",
    maskId: mask.id,
    maskName: mask.name,
    maskWidth: maskBounds?.width ?? mask.width,
    maskHeight: maskBounds?.height ?? mask.height,
    suggestedOrientation: maskBounds ? suggestOrientation(maskBounds) : undefined,
  });
}

function createCoverStrips(
  mask: MaskNode,
  source: SceneNode,
  colors: StripColor[],
  options: PluginOptions
): GroupNode | null {
  const parent = mask.parent;
  if (!parent || !isCoverParent(parent) || !("appendChild" in parent)) {
    figma.notify("Mask must be on the page or inside a frame or group.", { error: true });
    return null;
  }

  const colorByIndex = new Map(colors.map((c) => [c.index, c]));
  const localStrips = generateStrips(maskLocalBounds(mask), options.orientation, options.stripCount);
  const rects: RectangleNode[] = [];
  const maskIndex = parent.children.indexOf(mask);
  const sourceIndex = parent.children.indexOf(source);

  for (const strip of localStrips) {
    const stripColor = colorByIndex.get(strip.index);
    if (!stripColor) continue;

    const rect = figma.createRectangle();
    rect.name = `AutoCover Strip ${strip.index + 1}`;
    rect.resize(strip.width, strip.height);
    rect.relativeTransform = stripRelativeTransform(mask, strip);
    rect.fills = fillsForStripColor(stripColor);
    rect.strokes = [];
    parent.appendChild(rect);
    rects.push(rect);
  }

  if (rects.length === 0) {
    figma.notify("No strips were created.", { error: true });
    return null;
  }

  const group = figma.group(rects, parent);
  group.name = "AutoCover";
  parent.insertChild(Math.max(maskIndex, sourceIndex) + 1, group);

  if (options.removeMask) {
    mask.visible = false;
  }

  figma.currentPage.selection = [group];
  figma.viewport.scrollAndZoomIntoView([group]);
  figma.notify(`Created ${rects.length} cover strips.`);
  return group;
}

figma.on("selectionchange", sendMaskPreview);

async function runAutoCover(options: PluginOptions): Promise<void> {
  const resolved = resolveSelection();
  if (typeof resolved === "string") {
    figma.ui.postMessage({ type: "error", message: resolved });
    figma.notify(resolved, { error: true });
    return;
  }

  const { mask, source } = resolved;
  const maskBounds = boundsFromNode(mask);
  const sourceBounds = boundsFromNode(source);

  if (!maskBounds || !sourceBounds) {
    const message = "Could not read bounds for mask or source.";
    figma.ui.postMessage({ type: "error", message });
    figma.notify(message, { error: true });
    return;
  }

  const strips = generateStrips(maskBounds, options.orientation, options.stripCount);
  pendingApply = {
    maskId: mask.id,
    sourceId: source.id,
    pageId: figma.currentPage.id,
    options,
  };

  try {
    const bytes = await source.exportAsync({ format: "PNG" });
    figma.ui.postMessage({
      type: "sample-request",
      pngBytes: Array.from(bytes),
      sourceBounds,
      maskBounds,
      strips,
      options,
    });
  } catch {
    pendingApply = null;
    const message = "Failed to export the source layer as PNG.";
    figma.ui.postMessage({ type: "error", message });
    figma.notify(message, { error: true });
  }
}

figma.ui.onmessage = async (msg: UiToMainMessage) => {
  if (msg.type === "ui-ready") {
    sendMaskPreview();
    return;
  }

  if (msg.type === "run") {
    const options: PluginOptions = {
      orientation: msg.orientation ?? "horizontal",
      stripCount: Math.max(1, Math.min(100, msg.stripCount ?? 10)),
      useGradient: msg.useGradient !== false,
      sampleOffset: msg.sampleOffset ?? 2,
      smoothing: msg.smoothing ?? false,
      removeMask: msg.removeMask ?? true,
    };
    await runAutoCover(options);
    return;
  }

  if (msg.type === "sample-response") {
    const response = msg as SampleResponsePayload;

    try {
      if (response.error) {
        figma.notify(response.error, { error: true });
        pendingApply = null;
        return;
      }

      if (!pendingApply) {
        figma.notify("Session expired. Click AutoCover again.", { error: true });
        return;
      }

      const page = await figma.getNodeByIdAsync(pendingApply.pageId);
      if (page?.type === "PAGE") {
        await figma.setCurrentPageAsync(page);
      }

      const maskNode = await figma.getNodeByIdAsync(pendingApply.maskId);
      if (!maskNode || !isMaskNode(maskNode)) {
        figma.notify("Mask layer was deleted. Run AutoCover again.", { error: true });
        pendingApply = null;
        return;
      }

      const storedSource = await figma.getNodeByIdAsync(pendingApply.sourceId);
      const source =
        storedSource && isSceneNode(storedSource) && canExport(storedSource)
          ? storedSource
          : findSourceUnderMask(maskNode);

      if (!source) {
        figma.notify("Could not find source layer.", { error: true });
        pendingApply = null;
        return;
      }

      const options = pendingApply.options;
      createCoverStrips(maskNode, source, response.colors, options);
      pendingApply = null;
      figma.ui.postMessage({ type: "apply-done", message: "Cover strips created." });
      sendMaskPreview();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create cover strips";
      console.error("[AutoCover] sample-response failed", err);
      figma.notify(message, { error: true });
      pendingApply = null;
    }
  }
};
