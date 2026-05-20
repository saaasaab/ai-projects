import { boundsFromNode, stripToParentCoords } from "./figma-geometry";
import { generateStrips, rectsIntersect } from "./geometry";
import type {
  PluginOptions,
  SampleResponsePayload,
  Strip,
  StripColor,
  UiToMainMessage,
} from "./types";

figma.showUI(__html__, { width: 320, height: 560, themeColors: true });

let pendingApply: { maskId: string; sourceId: string; options: PluginOptions } | null = null;
let previewTimer: ReturnType<typeof setTimeout> | undefined;

function isRectangle(node: BaseNode): node is RectangleNode {
  return node.type === "RECTANGLE";
}

function isSceneNode(node: BaseNode): node is SceneNode {
  return node.type !== "PAGE" && node.type !== "DOCUMENT";
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

function buildPaintOrder(root: BaseNode): Map<string, number> {
  const order = new Map<string, number>();
  let index = 0;

  function walk(node: BaseNode): void {
    if (!("children" in node)) return;
    for (const child of node.children) {
      if (isSceneNode(child)) {
        order.set(child.id, index++);
      }
      walk(child);
    }
  }

  walk(root);
  return order;
}

function findSourceUnderMask(mask: RectangleNode): SceneNode | null {
  const maskBounds = boundsFromNode(mask);
  if (!maskBounds) return null;

  const paintOrder = buildPaintOrder(figma.currentPage);
  const maskOrder = paintOrder.get(mask.id);
  if (maskOrder === undefined) return null;

  let best: SceneNode | null = null;
  let bestOrder = -1;

  for (const node of figma.currentPage.findAll((n): n is SceneNode => isSceneNode(n))) {
    if (node.id === mask.id) continue;
    if (isDescendantOf(node, mask) || isDescendantOf(mask, node)) continue;
    if (!canExport(node) || !node.visible) continue;

    const nodeOrder = paintOrder.get(node.id);
    if (nodeOrder === undefined || nodeOrder >= maskOrder) continue;

    const nodeBounds = boundsFromNode(node);
    if (!nodeBounds || !rectsIntersect(maskBounds, nodeBounds)) continue;

    if (nodeOrder > bestOrder) {
      bestOrder = nodeOrder;
      best = node;
    }
  }

  return best;
}

function resolveSelection(): { mask: RectangleNode; source: SceneNode } | string {
  const rectangles = figma.currentPage.selection.filter(isRectangle);

  if (rectangles.length === 0) {
    return "Select the rectangle drawn over the area you want to cover.";
  }

  if (rectangles.length > 1) {
    return "Select only one rectangle.";
  }

  const mask = rectangles[0];
  const source = findSourceUnderMask(mask);

  if (!source) {
    return "No layer found under the rectangle. Place it over an image or exportable frame.";
  }

  return { mask, source };
}

function createCoverGroup(
  mask: RectangleNode,
  source: SceneNode,
  strips: Strip[],
  colors: StripColor[],
  options: PluginOptions
): void {
  const parent = mask.parent;
  if (!parent || !("appendChild" in parent)) {
    figma.notify("Mask must be inside a frame or group.", { error: true });
    return;
  }

  const colorByIndex = new Map(colors.map((c) => [c.index, c.color]));
  const rects: RectangleNode[] = [];
  const maskIndex = parent.children.indexOf(mask);
  const sourceIndex = parent.children.indexOf(source);

  for (const strip of strips) {
    const color = colorByIndex.get(strip.index);
    if (!color) continue;

    const coords = stripToParentCoords(strip, mask);
    const rect = figma.createRectangle();
    rect.name = `AutoCover Strip ${strip.index + 1}`;
    rect.resize(coords.width, coords.height);
    rect.x = coords.x;
    rect.y = coords.y;
    rect.fills = [{ type: "SOLID", color }];
    rect.strokes = [];
    parent.appendChild(rect);
    rects.push(rect);
  }

  if (rects.length === 0) {
    figma.notify("No strips were created.", { error: true });
    return;
  }

  const group = figma.group(rects, parent);
  group.name = "AutoCover";

  const insertAbove = Math.max(maskIndex, sourceIndex);
  parent.insertChild(insertAbove + 1, group);

  if (options.removeMask) {
    mask.visible = false;
  }

  figma.currentPage.selection = [group];
  figma.viewport.scrollAndZoomIntoView([group]);
  figma.notify(`Created ${rects.length} cover strips.`);
}

async function sendMaskPreview(): Promise<void> {
  const rectangles = figma.currentPage.selection.filter(isRectangle);

  if (rectangles.length === 0) {
    figma.ui.postMessage({
      type: "mask-preview",
      status: "none",
      message: "Select your mask rectangle",
    });
    return;
  }

  if (rectangles.length > 1) {
    figma.ui.postMessage({
      type: "mask-preview",
      status: "none",
      message: "Select only one rectangle",
    });
    return;
  }

  const mask = rectangles[0];
  const source = findSourceUnderMask(mask);

  if (!source) {
    figma.ui.postMessage({
      type: "mask-preview",
      status: "error",
      message: "No layer found under the rectangle",
    });
    return;
  }

  const maskBounds = boundsFromNode(mask);
  const sourceBounds = boundsFromNode(source);

  if (!maskBounds || !sourceBounds) {
    figma.ui.postMessage({
      type: "mask-preview",
      status: "error",
      message: "Could not read layer bounds",
    });
    return;
  }

  try {
    const bytes = await source.exportAsync({
      format: "PNG",
      constraint: { type: "WIDTH", value: 280 },
    });

    figma.ui.postMessage({
      type: "mask-preview",
      status: "ok",
      maskName: mask.name,
      maskBounds,
      sourceBounds,
      pngBytes: Array.from(bytes),
    });
  } catch {
    figma.ui.postMessage({
      type: "mask-preview",
      status: "error",
      message: "Could not load preview",
    });
  }
}

function scheduleMaskPreview(): void {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    sendMaskPreview();
  }, 200);
}

figma.on("selectionchange", scheduleMaskPreview);
scheduleMaskPreview();

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
  pendingApply = { maskId: mask.id, sourceId: source.id, options };

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
  if (msg.type === "run") {
    const options: PluginOptions = {
      orientation: msg.orientation ?? "vertical",
      stripCount: Math.max(1, Math.min(100, msg.stripCount ?? 4)),
      sampleEdge: msg.sampleEdge ?? "top",
      sampleOffset: msg.sampleOffset ?? 2,
      smoothing: msg.smoothing ?? false,
      removeMask: msg.removeMask ?? true,
    };
    await runAutoCover(options);
    return;
  }

  if (msg.type === "sample-response") {
    const response = msg as SampleResponsePayload;
    if (response.error) {
      figma.notify(response.error, { error: true });
      pendingApply = null;
      return;
    }

    if (!pendingApply) {
      figma.notify("Session expired. Click AutoCover again.", { error: true });
      return;
    }

    const mask = figma.getNodeById(pendingApply.maskId);
    if (!mask || !isRectangle(mask)) {
      figma.notify("Mask rectangle was deleted. Run AutoCover again.", { error: true });
      pendingApply = null;
      return;
    }

    const storedSource = figma.getNodeById(pendingApply.sourceId);
    const source =
      storedSource && isSceneNode(storedSource) && canExport(storedSource)
        ? storedSource
        : findSourceUnderMask(mask);

    if (!source) {
      figma.notify("Could not find source layer.", { error: true });
      pendingApply = null;
      return;
    }

    const maskBounds = boundsFromNode(mask);
    if (!maskBounds) return;

    const options = pendingApply.options;
    const strips = generateStrips(maskBounds, options.orientation, options.stripCount);
    createCoverGroup(mask, source, strips, response.colors, options);
    pendingApply = null;
    scheduleMaskPreview();
  }
};
