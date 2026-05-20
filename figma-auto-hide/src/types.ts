export type Orientation = "vertical" | "horizontal";

export type SampleEdge = "top" | "bottom" | "left" | "right" | "auto";

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
  color: RGB;
}

export interface PluginOptions {
  orientation: Orientation;
  stripCount: number;
  sampleEdge: SampleEdge;
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
  sampleEdge?: SampleEdge;
  sampleOffset?: number;
  smoothing?: boolean;
  removeMask?: boolean;
}

export type UiToMainMessage = RunMessage | SampleResponsePayload | { type: "cancel" };

export interface MaskPreviewPayload {
  type: "mask-preview";
  status: "ok" | "none" | "error";
  message?: string;
  maskName?: string;
  maskBounds?: Bounds;
  sourceBounds?: Bounds;
  pngBytes?: number[];
}

export type MainToUiMessage = SampleRequestPayload | MaskPreviewPayload | { type: "error"; message: string };
