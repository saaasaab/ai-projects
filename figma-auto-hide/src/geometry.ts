import type { Bounds, Orientation, SampleEdge, SamplePoint, Strip } from "./types";

/** Wide masks → columns side by side (`horizontal`). Tall masks → rows stacked (`vertical`). */
export function suggestOrientation(bounds: Bounds): Orientation {
  return bounds.width >= bounds.height ? "horizontal" : "vertical";
}

export function rectsIntersect(a: Bounds, b: Bounds): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function generateStrips(maskBounds: Bounds, orientation: Orientation, stripCount: number): Strip[] {
  const count = Math.max(1, Math.min(100, Math.round(stripCount)));
  const strips: Strip[] = [];

  // horizontal = columns side by side; vertical = rows stacked
  if (orientation === "horizontal") {
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
  } else {
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

export function figmaToPixel(
  figmaX: number,
  figmaY: number,
  sourceBounds: Bounds,
  imageWidth: number,
  imageHeight: number
): { x: number; y: number } {
  const relativeX = figmaX - sourceBounds.x;
  const relativeY = figmaY - sourceBounds.y;
  const pixelX = Math.round((relativeX / sourceBounds.width) * imageWidth);
  const pixelY = Math.round((relativeY / sourceBounds.height) * imageHeight);
  return {
    x: Math.max(0, Math.min(imageWidth - 1, pixelX)),
    y: Math.max(0, Math.min(imageHeight - 1, pixelY)),
  };
}

/** Opposite edge pair for the current layout (columns → top/bottom, rows → left/right). */
export function getSamplePointsForStrip(
  strip: Strip,
  maskBounds: Bounds,
  orientation: Orientation,
  sampleOffset: number
): SamplePoint[] {
  const centerX = strip.x + strip.width / 2;
  const centerY = strip.y + strip.height / 2;

  if (orientation === "horizontal") {
    return [
      { figmaX: centerX, figmaY: maskBounds.y - sampleOffset, edge: "top" },
      { figmaX: centerX, figmaY: maskBounds.y + maskBounds.height + sampleOffset, edge: "bottom" },
    ];
  }

  return [
    { figmaX: maskBounds.x - sampleOffset, figmaY: centerY, edge: "left" },
    { figmaX: maskBounds.x + maskBounds.width + sampleOffset, figmaY: centerY, edge: "right" },
  ];
}
