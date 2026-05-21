# AutoCover (Figma Plugin)

Automatically hide text or numbers on an image by splitting a mask rectangle into color-matched strips. Each strip’s fill is sampled from pixels just outside the mask edge on the underlying image—similar to the before/after examples in `autohide.md`.

## Setup

```bash
cd figma-auto-hide
yarn install
yarn build
```

## Run in Figma

1. **Plugins → Development → Import plugin from manifest…**
2. Choose `figma-auto-hide/manifest.json` (run `yarn build` first so `dist/` exists)
3. Build after code changes: `yarn build` (or `yarn watch`)

## Usage

1. Place an image (or exportable frame/group) on the canvas.
2. Draw a **rectangle** over the area to hide (e.g. over “8920”).
3. Select **only the mask rectangle** (it must overlap an image or exportable layer beneath it).
4. Open **AutoCover**, set options, click **AutoCover**.
5. The plugin creates a group named **AutoCover** with strips **AutoCover Strip 1…N**.

## Options

| Control | Description |
|--------|-------------|
| Orientation | Vertical or horizontal strips |
| Strips | 1–100 (default 4) |
| Sample edge | Top, bottom, left, right, or auto (picks lower-contrast edge) |
| Offset | Pixels outside the mask to sample (default 2) |
| Smoothing | Average a small neighborhood of pixels |
| Hide mask | Hides the original mask rectangle after apply |

## How it works

Figma’s plugin sandbox cannot read arbitrary pixels. The main thread exports the source layer as PNG, sends bytes to the UI iframe, samples colors on a `<canvas>`, then creates solid rectangles with those fills.

## Project structure

```
manifest.json
package.json
src/
  code.ts      # Selection, export, rectangle creation
  ui.ts        # Canvas sampling
  ui.html      # Plugin UI
  types.ts
  geometry.ts
  sampling.ts
dist/          # Built output (gitignored)
```
