const CH = "swl-debug-channel";

const buffer: string[] = [];
let sink: ((chunk: string) => void) | null = null;

function initTopDebugRelay(): void {
  if (window !== window.top) return;
  const bc = new BroadcastChannel(CH);
  bc.addEventListener("message", (ev: MessageEvent<{ t?: string; line?: string }>) => {
    if (ev.data?.t !== "log" || typeof ev.data.line !== "string") return;
    if (sink) sink(ev.data.line);
    else {
      buffer.push(ev.data.line);
      while (buffer.length > 80) buffer.shift();
    }
  });
}

initTopDebugRelay();

/** Wire the panel <pre> (or any sink) so logs from iframes show in the top-frame UI. */
export function registerDebugSink(fn: ((chunk: string) => void) | null): void {
  sink = fn;
  if (fn && buffer.length > 0) {
    fn(buffer.join(""));
    buffer.length = 0;
  }
}

/** Logs to DevTools console and to the in-panel “Extension log” (top frame). */
export function swlDebug(...args: unknown[]): void {
  const ts = new Date().toISOString().slice(11, 23);
  const body = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  const line = `[${ts}] ${body}\n`;
  console.log("[SWL]", ...args);
  if (window === window.top) {
    sink?.(line);
    return;
  }
  const bc = new BroadcastChannel(CH);
  bc.postMessage({ t: "log", line });
  bc.close();
}

/** Logs: tab / iframe DevTools show [SWL]; panel log streams from iframes via BroadcastChannel. */
(globalThis as unknown as { swlDebug: typeof swlDebug }).swlDebug = swlDebug;
if (typeof window !== "undefined") {
  (window as Window & { swlDebug?: typeof swlDebug }).swlDebug = swlDebug;
}
