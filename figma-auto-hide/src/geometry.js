export function boundsFromNode(node) {
    const box = node.absoluteBoundingBox;
    if (!box)
        return null;
    return { x: box.x, y: box.y, width: box.width, height: box.height };
}
export function rectsIntersect(a, b) {
    return (a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y);
}
export function generateStrips(maskBounds, orientation, stripCount) {
    const count = Math.max(1, Math.min(100, Math.round(stripCount)));
    const strips = [];
    if (orientation === "vertical") {
        const stripWidth = maskBounds.width / count;
        for (let i = 0; i < count; i++) {
            const width = i === count - 1 ? maskBounds.width - stripWidth * i : stripWidth;
            strips.push({
                index: i,
                x: maskBounds.x + i * stripWidth,
                y: maskBounds.y,
                width,
                height: maskBounds.height,
            });
        }
    }
    else {
        const stripHeight = maskBounds.height / count;
        for (let i = 0; i < count; i++) {
            const height = i === count - 1 ? maskBounds.height - stripHeight * i : stripHeight;
            strips.push({
                index: i,
                x: maskBounds.x,
                y: maskBounds.y + i * stripHeight,
                width: maskBounds.width,
                height,
            });
        }
    }
    return strips;
}
export function figmaToPixel(figmaX, figmaY, sourceBounds, imageWidth, imageHeight) {
    const relativeX = figmaX - sourceBounds.x;
    const relativeY = figmaY - sourceBounds.y;
    const pixelX = Math.round((relativeX / sourceBounds.width) * imageWidth);
    const pixelY = Math.round((relativeY / sourceBounds.height) * imageHeight);
    return {
        x: Math.max(0, Math.min(imageWidth - 1, pixelX)),
        y: Math.max(0, Math.min(imageHeight - 1, pixelY)),
    };
}
export function getSamplePointsForStrip(strip, maskBounds, orientation, sampleEdge, sampleOffset) {
    const centerX = strip.x + strip.width / 2;
    const centerY = strip.y + strip.height / 2;
    if (orientation === "vertical") {
        const top = {
            figmaX: centerX,
            figmaY: maskBounds.y - sampleOffset,
            edge: "top",
        };
        const bottom = {
            figmaX: centerX,
            figmaY: maskBounds.y + maskBounds.height + sampleOffset,
            edge: "bottom",
        };
        if (sampleEdge === "auto")
            return [top, bottom];
        if (sampleEdge === "bottom")
            return [bottom];
        return [top];
    }
    const left = {
        figmaX: maskBounds.x - sampleOffset,
        figmaY: centerY,
        edge: "left",
    };
    const right = {
        figmaX: maskBounds.x + maskBounds.width + sampleOffset,
        figmaY: centerY,
        edge: "right",
    };
    if (sampleEdge === "auto")
        return [left, right];
    if (sampleEdge === "right")
        return [right];
    return [left];
}
export function stripToParentCoords(strip, mask) {
    const maskBounds = boundsFromNode(mask);
    if (!maskBounds) {
        return { x: mask.x, y: mask.y, width: strip.width, height: strip.height };
    }
    const offsetX = strip.x - maskBounds.x;
    const offsetY = strip.y - maskBounds.y;
    return {
        x: mask.x + offsetX,
        y: mask.y + offsetY,
        width: strip.width,
        height: strip.height,
    };
}
export function defaultOptions() {
    return {
        orientation: "vertical",
        stripCount: 4,
        sampleEdge: "top",
        sampleOffset: 2,
        smoothing: false,
        removeMask: true,
    };
}
