import { generateStrips } from "./geometry";
import type { Bounds, MaskPreviewPayload, Orientation } from "./types";

export interface PreviewDrawState {
  maskBounds: Bounds;
  sourceBounds: Bounds;
  image: HTMLImageElement;
  stripCount: number;
  orientation: Orientation;
}

function boundsToCanvas(
  bounds: Bounds,
  sourceBounds: Bounds,
  offsetX: number,
  offsetY: number,
  scale: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: offsetX + (bounds.x - sourceBounds.x) * scale,
    y: offsetY + (bounds.y - sourceBounds.y) * scale,
    width: bounds.width * scale,
    height: bounds.height * scale,
  };
}

export function drawMaskPreview(
  canvas: HTMLCanvasElement,
  state: PreviewDrawState
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { image, maskBounds, sourceBounds, stripCount, orientation } = state;
  const canvasW = canvas.width;
  const canvasH = canvas.height;

  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = "#2c2c2c";
  ctx.fillRect(0, 0, canvasW, canvasH);

  const scale = Math.min(canvasW / image.naturalWidth, canvasH / image.naturalHeight);
  const drawW = image.naturalWidth * scale;
  const drawH = image.naturalHeight * scale;
  const offsetX = (canvasW - drawW) / 2;
  const offsetY = (canvasH - drawH) / 2;

  ctx.drawImage(image, offsetX, offsetY, drawW, drawH);

  const mask = boundsToCanvas(maskBounds, sourceBounds, offsetX, offsetY, scale);
  const strips = generateStrips(maskBounds, orientation, stripCount);

  ctx.save();
  ctx.fillStyle = "rgba(24, 160, 251, 0.25)";
  ctx.fillRect(mask.x, mask.y, mask.width, mask.height);

  ctx.strokeStyle = "#18a0fb";
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.strokeRect(mask.x, mask.y, mask.width, mask.height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);

  for (const strip of strips) {
    const stripCanvas = boundsToCanvas(strip, sourceBounds, offsetX, offsetY, scale);
    if (orientation === "vertical" && strip.index > 0) {
      ctx.beginPath();
      ctx.moveTo(stripCanvas.x, stripCanvas.y);
      ctx.lineTo(stripCanvas.x, stripCanvas.y + stripCanvas.height);
      ctx.stroke();
    }
    if (orientation === "horizontal" && strip.index > 0) {
      ctx.beginPath();
      ctx.moveTo(stripCanvas.x, stripCanvas.y);
      ctx.lineTo(stripCanvas.x + stripCanvas.width, stripCanvas.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export async function loadPreviewImage(pngBytes: number[]): Promise<HTMLImageElement> {
  const blob = new Blob([new Uint8Array(pngBytes)], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  const img = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load preview"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function isPreviewReady(payload: MaskPreviewPayload): payload is MaskPreviewPayload & {
  status: "ok";
  maskBounds: Bounds;
  sourceBounds: Bounds;
  pngBytes: number[];
} {
  return (
    payload.status === "ok" &&
    !!payload.maskBounds &&
    !!payload.sourceBounds &&
    !!payload.pngBytes
  );
}
