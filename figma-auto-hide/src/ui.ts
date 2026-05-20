import { getSamplePointsForStrip } from "./geometry";
import { drawMaskPreview, isPreviewReady, loadPreviewImage, type PreviewDrawState } from "./preview";
import {
  formatRgb,
  loadImageData,
  pickAutoEdgeColor,
  sampleAboveBelow,
  sampleAtPixel,
} from "./sampling";
import type {
  MainToUiMessage,
  MaskPreviewPayload,
  PluginOptions,
  SampleRequestPayload,
  SampleResponsePayload,
  StripColor,
} from "./types";

const form = document.getElementById("form") as HTMLFormElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;
const runBtn = document.getElementById("run") as HTMLButtonElement;
const previewEl = document.getElementById("preview") as HTMLDivElement;
const previewCanvas = document.getElementById("preview-canvas") as HTMLCanvasElement;
const previewLabel = document.getElementById("preview-label") as HTMLParagraphElement;

let previewState: PreviewDrawState | null = null;
let previewImage: HTMLImageElement | null = null;

function setStatus(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.className = isError ? "status error" : "status";
}

function readOptions(): PluginOptions {
  const fd = new FormData(form);
  return {
    orientation: (fd.get("orientation") as PluginOptions["orientation"]) || "vertical",
    stripCount: Math.max(1, Math.min(100, Number(fd.get("stripCount")) || 4)),
    sampleEdge: (fd.get("sampleEdge") as PluginOptions["sampleEdge"]) || "top",
    sampleOffset: Math.max(0, Number(fd.get("sampleOffset")) || 2),
    smoothing: fd.get("smoothing") === "on",
    removeMask: fd.get("removeMask") === "on",
  };
}

function redrawPreview(): void {
  if (!previewState || !previewImage) return;

  const options = readOptions();
  drawMaskPreview(previewCanvas, {
    ...previewState,
    image: previewImage,
    stripCount: options.stripCount,
    orientation: options.orientation,
  });
}

function setPreviewEmpty(message: string): void {
  previewState = null;
  previewImage = null;
  previewEl.classList.add("preview--empty");
  previewLabel.textContent = message;

  const ctx = previewCanvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  }
}

async function handleMaskPreview(payload: MaskPreviewPayload): Promise<void> {
  if (!isPreviewReady(payload)) {
    setPreviewEmpty(payload.message ?? "Select your mask rectangle");
    return;
  }

  try {
    previewImage = await loadPreviewImage(payload.pngBytes);
    previewState = {
      maskBounds: payload.maskBounds,
      sourceBounds: payload.sourceBounds,
      image: previewImage,
      stripCount: readOptions().stripCount,
      orientation: readOptions().orientation,
    };

    previewEl.classList.remove("preview--empty");
    previewLabel.textContent = payload.maskName ? `Mask: ${payload.maskName}` : "Mask selected";
    redrawPreview();
  } catch {
    setPreviewEmpty("Could not load preview");
  }
}

async function handleSampleRequest(payload: SampleRequestPayload): Promise<void> {
  setStatus("Sampling colors…");
  runBtn.disabled = true;

  try {
    const { imageData, width, height } = await loadImageData(payload.pngBytes);
    const colors: StripColor[] = [];

    for (const strip of payload.strips) {
      const points = getSamplePointsForStrip(
        strip,
        payload.maskBounds,
        payload.options.orientation,
        payload.options.sampleEdge,
        payload.options.sampleOffset
      );

      let color;
      if (payload.options.sampleEdge === "auto" && points.length > 1) {
        color = pickAutoEdgeColor(
          imageData,
          payload.sourceBounds,
          width,
          height,
          strip,
          points,
          payload.options.sampleOffset,
          payload.options.smoothing
        );
      } else {
        const point = points[0];
        const pixelX = Math.round(
          ((point.figmaX - payload.sourceBounds.x) / payload.sourceBounds.width) * width
        );
        const pixelY = Math.round(
          ((point.figmaY - payload.sourceBounds.y) / payload.sourceBounds.height) * height
        );
        const x = Math.max(0, Math.min(width - 1, pixelX));
        const y = Math.max(0, Math.min(height - 1, pixelY));
        color = sampleAtPixel(imageData, x, y, payload.options.smoothing);
      }

      const { above, below } = sampleAboveBelow(
        imageData,
        payload.sourceBounds,
        width,
        height,
        strip,
        payload.options.sampleOffset,
        payload.options.smoothing
      );

      console.log(`[AutoCover] Strip ${strip.index + 1}`, {
        above: formatRgb(above),
        below: formatRgb(below),
        picked: formatRgb(color),
        sampleEdge: payload.options.sampleEdge,
      });

      colors.push({ index: strip.index, color });
    }

    const response: SampleResponsePayload = { type: "sample-response", colors };
    parent.postMessage({ pluginMessage: response }, "*");
    setStatus(`Sampled ${colors.length} strips. Applying…`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sampling failed";
    const response: SampleResponsePayload = { type: "sample-response", colors: [], error: message };
    parent.postMessage({ pluginMessage: response }, "*");
    setStatus(message, true);
  } finally {
    runBtn.disabled = false;
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const options = readOptions();
  setStatus("Waiting for Figma…");
  parent.postMessage({ pluginMessage: { type: "run", ...options } }, "*");
});

form.addEventListener("change", () => {
  redrawPreview();
});

form.addEventListener("input", () => {
  redrawPreview();
});

window.onmessage = async (event: MessageEvent) => {
  const msg = event.data.pluginMessage as MainToUiMessage | undefined;
  if (!msg) return;

  if (msg.type === "error") {
    setStatus(msg.message, true);
    return;
  }

  if (msg.type === "mask-preview") {
    await handleMaskPreview(msg);
    return;
  }

  if (msg.type === "sample-request") {
    await handleSampleRequest(msg);
  }
};

setStatus("Select the mask rectangle, then click AutoCover.");
setPreviewEmpty("Select your mask rectangle");
