import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sass from "sass";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");

/** Compile .scss imports to a JS module `export default "<css>"` so the content script needs no fetch(). */
const scssInlinePlugin = {
  name: "scss-inline",
  setup(build) {
    build.onResolve({ filter: /\.scss$/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path),
      namespace: "scss-inline",
    }));
    build.onLoad({ filter: /.*/, namespace: "scss-inline" }, (args) => {
      const result = sass.compile(args.path, { style: "compressed" });
      return {
        contents: `export default ${JSON.stringify(result.css)};`,
        loader: "js",
      };
    });
  },
};

const build = async () => {
  fs.mkdirSync(dist, { recursive: true });
  try {
    fs.unlinkSync(path.join(dist, "panel.css"));
  } catch {
    /* stale file from older builds */
  }
  fs.copyFileSync(path.join(root, "manifest.json"), path.join(dist, "manifest.json"));
  await esbuild.build({
    entryPoints: [path.join(root, "src", "content", "main.ts")],
    bundle: true,
    outfile: path.join(dist, "content.js"),
    platform: "browser",
    format: "iife",
    target: "es2022",
    logLevel: "info",
    plugins: [scssInlinePlugin],
  });
};

const watch = async () => {
  fs.mkdirSync(dist, { recursive: true });
  try {
    fs.unlinkSync(path.join(dist, "panel.css"));
  } catch {
    /* stale file from older builds */
  }
  fs.copyFileSync(path.join(root, "manifest.json"), path.join(dist, "manifest.json"));
  const ctx = await esbuild.context({
    entryPoints: [path.join(root, "src", "content", "main.ts")],
    bundle: true,
    outfile: path.join(dist, "content.js"),
    platform: "browser",
    format: "iife",
    target: "es2022",
    logLevel: "info",
    plugins: [scssInlinePlugin],
  });
  await ctx.watch();
  console.log("Watching src/content…");
};

if (process.argv.includes("--watch")) {
  void watch();
} else {
  void build();
}
