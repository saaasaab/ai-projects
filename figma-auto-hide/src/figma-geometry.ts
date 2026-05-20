import type { Bounds, Strip } from "./types";

export function boundsFromNode(node: SceneNode): Bounds | null {
  const box = node.absoluteBoundingBox;
  if (!box) return null;
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

export function stripToParentCoords(
  strip: Strip,
  mask: RectangleNode
): { x: number; y: number; width: number; height: number } {
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
