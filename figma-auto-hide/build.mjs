import * as esbuild from "esbuild";
import { readFileSync, writeFileSync } from "fs";

await esbuild.build({
  entryPoints: ["src/ui.ts"],
  bundle: true,
  outfile: "dist/ui.js",
  target: "es2017",
});

const uiJs = readFileSync("dist/ui.js", "utf8");
const uiHtml = readFileSync("src/ui.html", "utf8").replace(
  '<script src="../dist/ui.js"></script>',
  `<script>${uiJs}</script>`
);

writeFileSync("dist/ui.html", uiHtml);

await esbuild.build({
  entryPoints: ["src/code.ts"],
  bundle: true,
  outfile: "dist/code.js",
  target: "es2017",
  define: {
    __html__: JSON.stringify(uiHtml),
  },
});

console.log("Build complete.");
