import * as esbuild from "esbuild";
import { readFileSync } from "fs";

const html = readFileSync("src/ui.html", "utf8");

await esbuild.build({
  entryPoints: ["src/code.ts"],
  bundle: true,
  outfile: "dist/code.js",
  target: "es2017",
  define: {
    __html__: JSON.stringify(html),
  },
});

await esbuild.build({
  entryPoints: ["src/ui.ts"],
  bundle: true,
  outfile: "dist/ui.js",
  target: "es2017",
});

console.log("Build complete.");
