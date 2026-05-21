import { averageRgb, formatRgb, loadImageData, sampleOppositeEdges } from "./sampling";
import type {
  MainToUiMessage,
  MaskPreviewPayload,
  Orientation,
  PluginOptions,
  SampleRequestPayload,
  SampleResponsePayload,
  StripColor,
} from "./types";

const form = document.getElementById("form") as HTMLFormElement;
const orientationSelect = form.elements.namedItem("orientation") as HTMLSelectElement;
const runBtn = document.getElementById("run") as HTMLButtonElement;
const maskStatusEl = document.getElementById("mask-status") as HTMLParagraphElement;
const samplingDescEl = document.getElementById("sampling-desc") as HTMLParagraphElement;
const helpTitleEl = document.getElementById("help-title") as HTMLHeadingElement;
const helpBodyEl = document.getElementById("help-body") as HTMLDivElement;
const helpOpenBtn = document.getElementById("help-open") as HTMLButtonElement;
const helpCloseBtn = document.getElementById("help-close") as HTMLButtonElement;
const helpBackdrop = document.getElementById("help-backdrop") as HTMLDivElement;
const fieldHelpButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".help-btn--sm")
);

let hasValidMask = false;
let isRunning = false;

const MAIN_HELP_HTML = `
  <p class="help-intro">Hide part of an image with color-matched strips from the background.</p>
  <div class="help-step">
    <div class="help-step-title">1. Select mask</div>
    <p class="help-step-text">Draw a rectangle over the area to hide, then select only that layer.</p>
  </div>
  <div class="help-step">
    <div class="help-step-title">2. Settings</div>
    <p class="help-step-text">
      Side by side samples top/bottom edges; stacked samples left/right. Gradient blends both edges;
      uncheck for a solid average.
    </p>
  </div>
  <div class="help-step">
    <div class="help-step-title">3. Apply</div>
    <p class="help-step-text">Click AutoCover.</p>
  </div>
`;

const DIRECTION_HELP_HTML = `
  <p class="help-intro">Each strip is filled with color sampled from the edges beside your mask.</p>
  <div class="help-diagrams">
    <div class="help-diagram">
      <div class="help-diagram-label">Side by side</div>
      <div class="help-mask help-mask--columns" aria-hidden="true">
        <div class="help-strip" style="background:#c8c8c8"></div>
        <div class="help-strip" style="background:#9a9a9a"></div>
        <div class="help-strip" style="background:#b5b5b5"></div>
        <div class="help-strip" style="background:#8a8a8a"></div>
        <div class="help-strip" style="background:#aeaeae"></div>
      </div>
      <p class="help-diagram-caption">Vertical columns</p>
    </div>
    <div class="help-diagram">
      <div class="help-diagram-label">Stacked</div>
      <div class="help-mask help-mask--rows" aria-hidden="true">
        <div class="help-strip" style="background:#c8c8c8"></div>
        <div class="help-strip" style="background:#9a9a9a"></div>
        <div class="help-strip" style="background:#b5b5b5"></div>
        <div class="help-strip" style="background:#8a8a8a"></div>
        <div class="help-strip" style="background:#aeaeae"></div>
      </div>
      <p class="help-diagram-caption">Horizontal rows</p>
    </div>
  </div>
`;

const STRIPS_HELP_HTML = `
  <p class="help-intro">More strips create a smoother blend. Default is 10.</p>
  <div class="help-diagrams">
    <div class="help-diagram">
      <div class="help-diagram-label">Few strips</div>
      <div class="help-mask help-mask--columns" aria-hidden="true">
        <div class="help-strip" style="background:#b5b5b5"></div>
        <div class="help-strip" style="background:#9a9a9a"></div>
        <div class="help-strip" style="background:#aeaeae"></div>
      </div>
      <p class="help-diagram-caption">Wider strips</p>
    </div>
    <div class="help-diagram">
      <div class="help-diagram-label">More strips</div>
      <div class="help-mask help-mask--columns" aria-hidden="true">
        <div class="help-strip" style="background:#c8c8c8"></div>
        <div class="help-strip" style="background:#9a9a9a"></div>
        <div class="help-strip" style="background:#b0b0b0"></div>
        <div class="help-strip" style="background:#8a8a8a"></div>
        <div class="help-strip" style="background:#aeaeae"></div>
        <div class="help-strip" style="background:#a0a0a0"></div>
        <div class="help-strip" style="background:#c2c2c2"></div>
        <div class="help-strip" style="background:#959595"></div>
      </div>
      <p class="help-diagram-caption">Narrower strips</p>
    </div>
  </div>
`;

const OFFSET_HELP_HTML = `
  <p class="help-intro">Offset is how many pixels outside the mask edge to read the background color.</p>
  <div class="help-diagrams">
    <div class="help-diagram">
      <div class="help-diagram-label">Small offset</div>
      <div class="offset-visual" aria-hidden="true">
        <div class="offset-band offset-band--sm"></div>
        <div class="offset-core"></div>
        <div class="offset-band offset-band--sm"></div>
      </div>
      <p class="help-diagram-caption">Sample close to mask</p>
    </div>
    <div class="help-diagram">
      <div class="help-diagram-label">Large offset</div>
      <div class="offset-visual" aria-hidden="true">
        <div class="offset-band offset-band--lg"></div>
        <div class="offset-core"></div>
        <div class="offset-band offset-band--lg"></div>
      </div>
      <p class="help-diagram-caption">Sample farther out</p>
    </div>
  </div>
`;

const SAMPLING_HELP_HTML_TB = `
  <p class="help-intro">Colors are pulled from just outside the mask along the edges shown below.</p>
  <div class="help-diagrams">
    <div class="help-diagram">
      <div class="help-diagram-label">Side by side</div>
      <div class="sample-visual sample-visual--tb" aria-hidden="true">
        <div class="sample-zone sample-zone--top"></div>
        <div class="help-mask help-mask--columns">
          <div class="help-strip" style="background:#c8c8c8"></div>
          <div class="help-strip" style="background:#9a9a9a"></div>
          <div class="help-strip" style="background:#b5b5b5"></div>
          <div class="help-strip" style="background:#8a8a8a"></div>
        </div>
        <div class="sample-zone sample-zone--bottom"></div>
      </div>
      <p class="help-diagram-caption">Top &amp; bottom edges</p>
    </div>
    <div class="help-diagram">
      <div class="help-diagram-label">Stacked</div>
      <div class="sample-visual sample-visual--lr" aria-hidden="true">
        <div class="sample-zone"></div>
        <div class="help-mask help-mask--rows">
          <div class="help-strip" style="background:#c8c8c8"></div>
          <div class="help-strip" style="background:#9a9a9a"></div>
          <div class="help-strip" style="background:#b5b5b5"></div>
          <div class="help-strip" style="background:#8a8a8a"></div>
        </div>
        <div class="sample-zone"></div>
      </div>
      <p class="help-diagram-caption">Left &amp; right edges</p>
    </div>
  </div>
`;

function samplingHelpHtml(): string {
  return SAMPLING_HELP_HTML_TB;
}

const FIELD_HELP: Record<string, { title: string; body?: string; html?: string }> = {
  "direction-info": {
    title: "Direction",
    html: DIRECTION_HELP_HTML,
  },
  "strips-info": {
    title: "Strips",
    html: STRIPS_HELP_HTML,
  },
  "offset-info": {
    title: "Offset",
    html: OFFSET_HELP_HTML,
  },
};

function openHelpModal(mode: "main" | string): void {
  if (mode === "main") {
    helpTitleEl.textContent = "How to use";
    helpBodyEl.innerHTML = MAIN_HELP_HTML;
  } else if (mode === "sampling-info") {
    helpTitleEl.textContent = "Sampling";
    helpBodyEl.innerHTML = samplingHelpHtml();
  } else {
    const field = FIELD_HELP[mode];
    if (!field) return;
    helpTitleEl.textContent = field.title;
    helpBodyEl.innerHTML = field.html ?? `<p class="help-intro">${field.body ?? ""}</p>`;
  }

  helpBackdrop.classList.add("help-backdrop--open");
}

function setMaskStatus(text: string, variant: "default" | "ready" | "error" = "default"): void {
  maskStatusEl.textContent = text;
  maskStatusEl.className = "mask-status";
  if (variant === "ready") maskStatusEl.classList.add("mask-status--ready");
  if (variant === "error") maskStatusEl.classList.add("mask-status--error");
}

function setRunEnabled(enabled: boolean): void {
  hasValidMask = enabled;
  runBtn.disabled = !enabled || isRunning;
}

function closeHelp(): void {
  helpBackdrop.classList.remove("help-backdrop--open");
}

function truncateStatus(text: string, max = 42): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function updateSamplingDesc(): void {
  const orientation = orientationSelect.value as Orientation;
  if (orientation === "horizontal") {
    samplingDescEl.textContent = "Colors from top & bottom edges of each strip.";
  } else {
    samplingDescEl.textContent = "Colors from left & right edges of each strip.";
  }

}

function readOptions(): PluginOptions {
  const fd = new FormData(form);
  return {
    orientation: (fd.get("orientation") as PluginOptions["orientation"]) || "horizontal",
    stripCount: Math.max(1, Math.min(100, Number(fd.get("stripCount")) || 10)),
    useGradient: fd.get("useGradient") === "on",
    sampleOffset: Math.max(0, Number(fd.get("sampleOffset")) || 2),
    smoothing: fd.get("smoothing") === "on",
    removeMask: fd.get("removeMask") === "on",
  };
}

function handleMaskPreview(payload: MaskPreviewPayload): void {
  if (payload.status === "ok" && payload.maskId) {
    if (payload.suggestedOrientation) {
      orientationSelect.value = payload.suggestedOrientation;
      updateSamplingDesc();
    }

    const sizeLabel =
      payload.maskWidth != null && payload.maskHeight != null
        ? ` · ${Math.round(payload.maskWidth)}×${Math.round(payload.maskHeight)}`
        : "";
    setMaskStatus(truncateStatus(`${payload.maskName ?? "Mask"}${sizeLabel}`), "ready");
    setRunEnabled(true);
    return;
  }

  setMaskStatus(payload.message ?? "Select one rectangle over the area to hide.");
  setRunEnabled(false);
}

async function handleSampleRequest(payload: SampleRequestPayload): Promise<void> {
  isRunning = true;
  setMaskStatus("Applying…");
  setRunEnabled(false);

  try {
    const { imageData, width, height } = await loadImageData(payload.pngBytes);
    const colors: StripColor[] = [];

    for (const strip of payload.strips) {
      const { start, end, axis } = sampleOppositeEdges(
        imageData,
        payload.sourceBounds,
        width,
        height,
        strip,
        payload.options.orientation,
        payload.options.sampleOffset,
        payload.options.smoothing
      );

      if (payload.options.useGradient) {
        colors.push({
          index: strip.index,
          color: start,
          gradient: { start, end, axis },
        });
      } else {
        colors.push({
          index: strip.index,
          color: averageRgb(start, end),
        });
      }

      console.log(`[AutoCover] Strip ${strip.index + 1}`, {
        start: formatRgb(start),
        end: formatRgb(end),
        fill: payload.options.useGradient ? "gradient" : formatRgb(averageRgb(start, end)),
      });
    }

    parent.postMessage({ pluginMessage: { type: "sample-response", colors } }, "*");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sampling failed";
    parent.postMessage({ pluginMessage: { type: "sample-response", colors: [], error: message } }, "*");
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!hasValidMask || isRunning) return;

  isRunning = true;
  setMaskStatus("Applying…");
  setRunEnabled(false);
  parent.postMessage({ pluginMessage: { type: "run", ...readOptions() } }, "*");
});

orientationSelect.addEventListener("change", updateSamplingDesc);

helpOpenBtn.addEventListener("click", () => openHelpModal("main"));
fieldHelpButtons.forEach((btn) => {
  btn.addEventListener("click", () => openHelpModal(btn.id));
});
helpCloseBtn.addEventListener("click", closeHelp);
helpBackdrop.addEventListener("click", (e) => {
  if (e.target === helpBackdrop) closeHelp();
});

window.onmessage = async (event: MessageEvent) => {
  const msg = event.data.pluginMessage as MainToUiMessage | undefined;
  if (!msg) return;

  if (msg.type === "error") {
    isRunning = false;
    setMaskStatus(msg.message, "error");
    setRunEnabled(hasValidMask);
    return;
  }

  if (msg.type === "mask-preview") {
    handleMaskPreview(msg);
    return;
  }

  if (msg.type === "sample-request") {
    await handleSampleRequest(msg);
    return;
  }

  if (msg.type === "apply-done") {
    isRunning = false;
    setMaskStatus(msg.message ?? "Cover applied.", "ready");
    setRunEnabled(hasValidMask);
  }
};

updateSamplingDesc();
setMaskStatus("Select one rectangle over the area to hide.");
setRunEnabled(false);

parent.postMessage({ pluginMessage: { type: "ui-ready" } }, "*");
