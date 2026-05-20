import { boundsFromNode, generateStrips, rectsIntersect, stripToParentCoords, } from "./geometry";
figma.showUI(__html__, { width: 320, height: 480, themeColors: true });
let pendingApply = null;
function isRectangle(node) {
    return node.type === "RECTANGLE";
}
function canExport(node) {
    return "exportAsync" in node;
}
function depthInParent(node) {
    const parent = node.parent;
    if (!parent || !("children" in parent))
        return 0;
    return parent.children.indexOf(node);
}
function resolveSelection() {
    const selection = [...figma.currentPage.selection];
    if (selection.length === 0) {
        return "Select a mask rectangle and the image underneath.";
    }
    if (selection.length === 2) {
        const sorted = [...selection].sort((a, b) => depthInParent(b) - depthInParent(a));
        const top = sorted[0];
        const bottom = sorted[1];
        if (!isRectangle(top)) {
            return "The top selected node must be a rectangle (mask).";
        }
        if (!canExport(bottom)) {
            return "The lower selected node cannot be exported.";
        }
        return { mask: top, source: bottom };
    }
    const rectangles = selection.filter(isRectangle);
    if (rectangles.length === 1) {
        const mask = rectangles[0];
        const maskBounds = boundsFromNode(mask);
        if (!maskBounds)
            return "Mask rectangle has no bounds.";
        const parent = mask.parent;
        if (!parent || !("children" in parent)) {
            return "Place the mask over an exportable image or frame.";
        }
        const underneath = [...parent.children]
            .reverse()
            .find((child) => {
            if (child.id === mask.id || !canExport(child) || !child.visible)
                return false;
            const childBounds = boundsFromNode(child);
            return childBounds ? rectsIntersect(maskBounds, childBounds) : false;
        });
        if (!underneath) {
            return "No exportable layer found beneath the mask. Select mask + image together.";
        }
        return { mask, source: underneath };
    }
    const exportable = selection.filter(canExport);
    if (rectangles.length >= 1 && exportable.length >= 1) {
        const mask = rectangles.sort((a, b) => depthInParent(b) - depthInParent(a))[0];
        const source = exportable.find((n) => n.id !== mask.id);
        if (source)
            return { mask, source };
    }
    return "Select one mask rectangle and one source image (or draw a mask over the image).";
}
function findSourceUnderMask(mask) {
    var _a;
    const maskBounds = boundsFromNode(mask);
    const parent = mask.parent;
    if (!maskBounds || !parent || !("children" in parent))
        return null;
    return ((_a = [...parent.children]
        .reverse()
        .find((child) => {
        if (child.id === mask.id || !canExport(child) || !child.visible)
            return false;
        const childBounds = boundsFromNode(child);
        return childBounds ? rectsIntersect(maskBounds, childBounds) : false;
    })) !== null && _a !== void 0 ? _a : null);
}
function createCoverGroup(mask, source, strips, colors, options) {
    const parent = mask.parent;
    if (!parent || !("appendChild" in parent)) {
        figma.notify("Mask must be inside a frame or group.", { error: true });
        return;
    }
    const colorByIndex = new Map(colors.map((c) => [c.index, c.color]));
    const rects = [];
    const maskIndex = parent.children.indexOf(mask);
    const sourceIndex = parent.children.indexOf(source);
    for (const strip of strips) {
        const color = colorByIndex.get(strip.index);
        if (!color)
            continue;
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
async function runAutoCover(options) {
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
    pendingApply = { maskId: mask.id, options };
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
    }
    catch (_a) {
        pendingApply = null;
        const message = "Failed to export the source layer as PNG.";
        figma.ui.postMessage({ type: "error", message });
        figma.notify(message, { error: true });
    }
}
figma.ui.onmessage = async (msg) => {
    var _a, _b, _c, _d, _e, _f;
    if (msg.type === "run") {
        const options = {
            orientation: (_a = msg.orientation) !== null && _a !== void 0 ? _a : "vertical",
            stripCount: Math.max(1, Math.min(100, (_b = msg.stripCount) !== null && _b !== void 0 ? _b : 4)),
            sampleEdge: (_c = msg.sampleEdge) !== null && _c !== void 0 ? _c : "top",
            sampleOffset: (_d = msg.sampleOffset) !== null && _d !== void 0 ? _d : 2,
            smoothing: (_e = msg.smoothing) !== null && _e !== void 0 ? _e : false,
            removeMask: (_f = msg.removeMask) !== null && _f !== void 0 ? _f : true,
        };
        await runAutoCover(options);
        return;
    }
    if (msg.type === "sample-response") {
        const response = msg;
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
        const resolved = resolveSelection();
        const source = typeof resolved !== "string" && resolved.mask.id === mask.id
            ? resolved.source
            : findSourceUnderMask(mask);
        if (!source) {
            figma.notify("Could not find source layer.", { error: true });
            pendingApply = null;
            return;
        }
        const maskBounds = boundsFromNode(mask);
        if (!maskBounds)
            return;
        const options = pendingApply.options;
        const strips = generateStrips(maskBounds, options.orientation, options.stripCount);
        createCoverGroup(mask, source, strips, response.colors, options);
        pendingApply = null;
    }
};
