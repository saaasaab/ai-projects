import type { Bounds, Orientation, SampleEdge, SamplePoint, Strip } from "./types";

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

export function getSamplePointsForStrip(
  strip: Strip,
  maskBounds: Bounds,
  orientation: Orientation,
  sampleEdge: SampleEdge,
  sampleOffset: number
): SamplePoint[] {
  const centerX = strip.x + strip.width / 2;
  const centerY = strip.y + strip.height / 2;

  if (orientation === "vertical") {
    const top: SamplePoint = {
      figmaX: centerX,
      figmaY: maskBounds.y - sampleOffset,
      edge: "top",
    };
    const bottom: SamplePoint = {
      figmaX: centerX,
      figmaY: maskBounds.y + maskBounds.height + sampleOffset,
      edge: "bottom",
    };

    if (sampleEdge === "auto") return [top, bottom];
    if (sampleEdge === "bottom") return [bottom];
    return [top];
  }

  const left: SamplePoint = {
    figmaX: maskBounds.x - sampleOffset,
    figmaY: centerY,
    edge: "left",
  };
  const right: SamplePoint = {
    figmaX: maskBounds.x + maskBounds.width + sampleOffset,
    figmaY: centerY,
    edge: "right",
  };

  if (sampleEdge === "auto") return [left, right];
  if (sampleEdge === "right") return [right];
  return [left];
}
