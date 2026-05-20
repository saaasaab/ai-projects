import { getSamplePointsForStrip } from "./geometry";
import { loadImageData, pickAutoEdgeColor, sampleAtPixel } from "./sampling";
const form = document.getElementById("form");
const statusEl = document.getElementById("status");
const runBtn = document.getElementById("run");
function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.className = isError ? "status error" : "status";
}
function readOptions() {
    const fd = new FormData(form);
    return {
        orientation: fd.get("orientation") || "vertical",
        stripCount: Math.max(1, Math.min(100, Number(fd.get("stripCount")) || 4)),
        sampleEdge: fd.get("sampleEdge") || "top",
        sampleOffset: Math.max(0, Number(fd.get("sampleOffset")) || 2),
        smoothing: fd.get("smoothing") === "on",
        removeMask: fd.get("removeMask") === "on",
    };
}
async function handleSampleRequest(payload) {
    setStatus("Sampling colors…");
    runBtn.disabled = true;
    try {
        const { imageData, width, height } = await loadImageData(payload.pngBytes);
        const colors = [];
        for (const strip of payload.strips) {
            const points = getSamplePointsForStrip(strip, payload.maskBounds, payload.options.orientation, payload.options.sampleEdge, payload.options.sampleOffset);
            let color;
            if (payload.options.sampleEdge === "auto" && points.length > 1) {
                color = pickAutoEdgeColor(imageData, payload.sourceBounds, width, height, strip, points, payload.options.sampleOffset, payload.options.smoothing);
            }
            else {
                const point = points[0];
                const pixelX = Math.round(((point.figmaX - payload.sourceBounds.x) / payload.sourceBounds.width) * width);
                const pixelY = Math.round(((point.figmaY - payload.sourceBounds.y) / payload.sourceBounds.height) * height);
                const x = Math.max(0, Math.min(width - 1, pixelX));
                const y = Math.max(0, Math.min(height - 1, pixelY));
                color = sampleAtPixel(imageData, x, y, payload.options.smoothing);
            }
            colors.push({ index: strip.index, color });
        }
        const response = { type: "sample-response", colors };
        parent.postMessage({ pluginMessage: response }, "*");
        setStatus(`Sampled ${colors.length} strips. Applying…`);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Sampling failed";
        const response = { type: "sample-response", colors: [], error: message };
        parent.postMessage({ pluginMessage: response }, "*");
        setStatus(message, true);
    }
    finally {
        runBtn.disabled = false;
    }
}
form.addEventListener("submit", (e) => {
    e.preventDefault();
    const options = readOptions();
    setStatus("Waiting for Figma…");
    parent.postMessage({ pluginMessage: Object.assign({ type: "run" }, options) }, "*");
});
window.onmessage = async (event) => {
    const msg = event.data.pluginMessage;
    if (!msg)
        return;
    if (msg.type === "error") {
        setStatus(msg.message, true);
        return;
    }
    if (msg.type === "sample-request") {
        await handleSampleRequest(msg);
    }
};
setStatus("Select a mask rectangle over your image, then click AutoCover.");
