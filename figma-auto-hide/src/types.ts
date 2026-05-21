export type Orientation = "vertical" | "horizontal";

export type SampleEdge = "top" | "bottom" | "left" | "right";

export type GradientAxis = "vertical" | "horizontal";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Strip {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface StripColor {
  index: number;
  /** Solid fallback; gradient used when present. */
  color: RGB;
  gradient?: {
    start: RGB;
    end: RGB;
    axis: GradientAxis;
  };
}

export interface PluginOptions {
  orientation: Orientation;
  stripCount: number;
  /** When true, blend opposite edge colors as a gradient; otherwise average to solid. */
  useGradient: boolean;
  sampleOffset: number;
  smoothing: boolean;
  removeMask: boolean;
}

export interface SamplePoint {
  figmaX: number;
  figmaY: number;
  edge: SampleEdge;
}

export interface SampleRequestPayload {
  type: "sample-request";
  pngBytes: number[];
  sourceBounds: Bounds;
  maskBounds: Bounds;
  strips: Strip[];
  options: PluginOptions;
}

export interface SampleResponsePayload {
  type: "sample-response";
  colors: StripColor[];
  error?: string;
}

export interface ApplyCoverPayload {
  type: "apply-cover";
  colors: StripColor[];
  strips: Strip[];
  maskId: string;
  options: PluginOptions;
}

export interface RunMessage {
  type: "run";
  orientation?: Orientation;
  stripCount?: number;
  useGradient?: boolean;
  sampleOffset?: number;
  smoothing?: boolean;
  removeMask?: boolean;
}

export type UiToMainMessage = RunMessage | SampleResponsePayload | { type: "cancel" } | { type: "ui-ready" };

export interface MaskPreviewPayload {
  type: "mask-preview";
  status: "ok" | "none" | "error";
  message?: string;
  maskId?: string;
  maskName?: string;
  maskWidth?: number;
  maskHeight?: number;
  suggestedOrientation?: Orientation;
}

export interface ApplyDonePayload {
  type: "apply-done";
  message?: string;
}

export type MainToUiMessage =
  | SampleRequestPayload
  | MaskPreviewPayload
  | ApplyDonePayload
  | { type: "error"; message: string };
