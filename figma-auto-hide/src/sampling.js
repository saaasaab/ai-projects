import { figmaToPixel } from "./geometry";
const SMOOTHING_RADIUS = 2;
const AUTO_VARIANCE_SAMPLES = 5;
function readPixel(data, width, x, y) {
    const i = (y * width + x) * 4;
    return {
        r: data[i] / 255,
        g: data[i + 1] / 255,
        b: data[i + 2] / 255,
    };
}
function colorVariance(colors) {
    if (colors.length === 0)
        return 0;
    const avg = colors.reduce((acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }), { r: 0, g: 0, b: 0 });
    avg.r /= colors.length;
    avg.g /= colors.length;
    avg.b /= colors.length;
    return colors.reduce((sum, c) => {
        const dr = c.r - avg.r;
        const dg = c.g - avg.g;
        const db = c.b - avg.b;
        return sum + dr * dr + dg * dg + db * db;
    }, 0);
}
export function sampleAtPixel(imageData, pixelX, pixelY, smoothing) {
    const { data, width, height } = imageData;
    if (!smoothing) {
        return readPixel(data, width, pixelX, pixelY);
    }
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let dy = -SMOOTHING_RADIUS; dy <= SMOOTHING_RADIUS; dy++) {
        for (let dx = -SMOOTHING_RADIUS; dx <= SMOOTHING_RADIUS; dx++) {
            const x = Math.max(0, Math.min(width - 1, pixelX + dx));
            const y = Math.max(0, Math.min(height - 1, pixelY + dy));
            const color = readPixel(data, width, x, y);
            r += color.r;
            g += color.g;
            b += color.b;
            count++;
        }
    }
    return { r: r / count, g: g / count, b: b / count };
}
export function sampleAlongEdge(imageData, sourceBounds, imageWidth, imageHeight, strip, edge, sampleOffset, smoothing) {
    const samples = [];
    const steps = AUTO_VARIANCE_SAMPLES;
    if (edge === "top" || edge === "bottom") {
        const baseY = edge === "top" ? strip.y - sampleOffset : strip.y + strip.height + sampleOffset;
        for (let i = 0; i < steps; i++) {
            const t = steps === 1 ? 0.5 : i / (steps - 1);
            const figmaX = strip.x + strip.width * t;
            const { x, y } = figmaToPixel(figmaX, baseY, sourceBounds, imageWidth, imageHeight);
            samples.push(sampleAtPixel(imageData, x, y, smoothing));
        }
    }
    else {
        const baseX = edge === "left" ? strip.x - sampleOffset : strip.x + strip.width + sampleOffset;
        for (let i = 0; i < steps; i++) {
            const t = steps === 1 ? 0.5 : i / (steps - 1);
            const figmaY = strip.y + strip.height * t;
            const { x, y } = figmaToPixel(baseX, figmaY, sourceBounds, imageWidth, imageHeight);
            samples.push(sampleAtPixel(imageData, x, y, smoothing));
        }
    }
    const avg = samples.reduce((acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }), { r: 0, g: 0, b: 0 });
    return {
        r: avg.r / samples.length,
        g: avg.g / samples.length,
        b: avg.b / samples.length,
    };
}
export function pickAutoEdgeColor(imageData, sourceBounds, imageWidth, imageHeight, strip, points, sampleOffset, smoothing) {
    var _a;
    const edgeGroups = new Map();
    for (const point of points) {
        const list = (_a = edgeGroups.get(point.edge)) !== null && _a !== void 0 ? _a : [];
        list.push(point);
        edgeGroups.set(point.edge, list);
    }
    let bestEdge = null;
    let lowestVariance = Infinity;
    let bestColor = { r: 0, g: 0, b: 0 };
    for (const [edge] of edgeGroups) {
        const colors = [];
        for (let i = 0; i < AUTO_VARIANCE_SAMPLES; i++) {
            const t = AUTO_VARIANCE_SAMPLES === 1 ? 0.5 : i / (AUTO_VARIANCE_SAMPLES - 1);
            let figmaX = strip.x + strip.width / 2;
            let figmaY = strip.y + strip.height / 2;
            if (edge === "top") {
                figmaX = strip.x + strip.width * t;
                figmaY = strip.y - sampleOffset;
            }
            else if (edge === "bottom") {
                figmaX = strip.x + strip.width * t;
                figmaY = strip.y + strip.height + sampleOffset;
            }
            else if (edge === "left") {
                figmaX = strip.x - sampleOffset;
                figmaY = strip.y + strip.height * t;
            }
            else {
                figmaX = strip.x + strip.width + sampleOffset;
                figmaY = strip.y + strip.height * t;
            }
            const { x, y } = figmaToPixel(figmaX, figmaY, sourceBounds, imageWidth, imageHeight);
            colors.push(sampleAtPixel(imageData, x, y, smoothing));
        }
        const variance = colorVariance(colors);
        if (variance < lowestVariance) {
            lowestVariance = variance;
            bestEdge = edge;
            const avg = colors.reduce((acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }), { r: 0, g: 0, b: 0 });
            bestColor = {
                r: avg.r / colors.length,
                g: avg.g / colors.length,
                b: avg.b / colors.length,
            };
        }
    }
    if (bestEdge) {
        return sampleAlongEdge(imageData, sourceBounds, imageWidth, imageHeight, strip, bestEdge, sampleOffset, smoothing);
    }
    const first = points[0];
    const { x, y } = figmaToPixel(first.figmaX, first.figmaY, sourceBounds, imageWidth, imageHeight);
    return sampleAtPixel(imageData, x, y, smoothing);
}
export async function loadImageData(pngBytes) {
    const blob = new Blob([new Uint8Array(pngBytes)], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    try {
        await new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("Failed to load exported image"));
            img.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx)
            throw new Error("Canvas not available");
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return { imageData, width: canvas.width, height: canvas.height };
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
