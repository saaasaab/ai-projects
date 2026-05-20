# Figma AutoCover Plugin

## Goal

Build a Figma plugin that automatically covers part of an image/object using generated rectangles whose fill colors are sampled from nearby pixels of the underlying image.

Example use case:

1. User has an image with visible numbers/text.
2. User draws a “mask rectangle” over the area they want to hide.
3. User selects the mask rectangle and the image/object underneath.
4. User clicks **AutoCover**.
5. Plugin divides the mask rectangle into smaller rectangles.
6. Each generated rectangle samples a nearby edge color from the underlying image.
7. The result visually blends into the surrounding background and hides the original content.

## Core Behavior

### Selection

The plugin should expect:

- One selected rectangle to act as the cover/mask area.
- One selected image/object underneath it.

Recommended selection behavior:

- If two nodes are selected:
  - Treat the top rectangle as the mask.
  - Treat the lower image/frame/group as the source.
- If only one rectangle is selected:
  - Search beneath it for the first visible node that intersects its bounds.

## User Controls

Plugin UI should include:

- `Orientation`
  - `vertical`
  - `horizontal`

- `Number of strips`
  - Default: `4`
  - Min: `1`
  - Max: `100`

- `Sample edge`
  - `top`
  - `bottom`
  - `left`
  - `right`
  - `auto`

- `Sample offset`
  - Pixels away from the mask edge to sample
  - Default: `2`

- `Blur/smoothing`
  - Optional
  - Average nearby pixels instead of sampling one pixel

- Button:
  - `AutoCover`

## Rectangle Generation

If orientation is `vertical`, split the mask into vertical strips:

```ts
stripWidth = mask.width / stripCount

Each generated rectangle:

x = mask.x + i * stripWidth
y = mask.y
width = stripWidth
height = mask.height

If orientation is horizontal, split into horizontal strips:

stripHeight = mask.height / stripCount

Each generated rectangle:

x = mask.x
y = mask.y + i * stripHeight
width = mask.width
height = stripHeight
Color Sampling Strategy

For each generated strip, sample color from the underlying image near the strip edge.

Vertical strips

Usually sample from either the top or bottom edge.

For each strip:

sampleX = strip.x + strip.width / 2
sampleY = mask.y - sampleOffset // top

or:

sampleY = mask.y + mask.height + sampleOffset // bottom
Horizontal strips

Usually sample from either the left or right edge.

sampleX = mask.x - sampleOffset // left
sampleY = strip.y + strip.height / 2

or:

sampleX = mask.x + mask.width + sampleOffset // right
sampleY = strip.y + strip.height / 2
Auto Mode

If sample edge = auto:

For vertical strips:
sample both top and bottom
choose the edge with lower contrast/variance
For horizontal strips:
sample both left and right
choose the edge with lower contrast/variance
Important Figma Limitation

Figma plugin code cannot directly read arbitrary screen pixels from a node.

Recommended approach:

Export the underlying image/object as PNG using:
const bytes = await sourceNode.exportAsync({ format: "PNG" });
Send the PNG bytes to the plugin UI.
Use an HTML <canvas> in the UI to read pixel values.
Convert Figma coordinates into exported-image pixel coordinates.
Return sampled RGB colors back to the main plugin code.
Main plugin creates rectangles with those fills.
Coordinate Mapping

You need to map Figma canvas coordinates to exported image pixels.

Given:

sourceBounds = sourceNode.absoluteBoundingBox
maskBounds = maskNode.absoluteBoundingBox
exportedImageWidth
exportedImageHeight

Convert Figma point to image pixel:

relativeX = sampleX - sourceBounds.x
relativeY = sampleY - sourceBounds.y

pixelX = relativeX / sourceBounds.width * exportedImageWidth
pixelY = relativeY / sourceBounds.height * exportedImageHeight

Clamp pixel values:

pixelX = Math.max(0, Math.min(exportedImageWidth - 1, pixelX))
pixelY = Math.max(0, Math.min(exportedImageHeight - 1, pixelY))
Canvas Pixel Sampling

In the UI:

const imageData = ctx.getImageData(pixelX, pixelY, 1, 1).data;

const color = {
  r: imageData[0] / 255,
  g: imageData[1] / 255,
  b: imageData[2] / 255,
};

For smoothing, sample a small radius:

radius = 2

Average all pixels inside the radius.

Creating Cover Rectangles

In the main plugin code:

const rect = figma.createRectangle();

rect.x = stripX;
rect.y = stripY;
rect.resize(stripWidth, stripHeight);

rect.fills = [
  {
    type: "SOLID",
    color: {
      r,
      g,
      b,
    },
  },
];

figma.currentPage.appendChild(rect);

Place generated rectangles above the source image and above the original mask rectangle.

Optionally delete or hide the original mask rectangle after generating the cover.

Suggested File Structure
autocover-plugin/
  manifest.json
  src/
    code.ts
    ui.html
    types.ts
    sampling.ts
    geometry.ts
  package.json
  tsconfig.json
  README.md
Plugin Flow
User selects mask + image
        ↓
Plugin validates selection
        ↓
Main plugin exports source node as PNG
        ↓
Main plugin sends PNG + geometry to UI
        ↓
UI loads PNG into canvas
        ↓
UI samples pixels for each strip
        ↓
UI sends sampled colors back
        ↓
Main plugin creates cover rectangles
        ↓
Plugin groups generated rectangles
Recommended Result

The plugin should create a group named:

AutoCover

Inside the group:

AutoCover Strip 1
AutoCover Strip 2
AutoCover Strip 3
AutoCover Strip 4
MVP Requirements

The first working version should support:

Select one mask rectangle and one source image
Vertical strip generation
Fixed strip count
Sample color from top edge
Create solid rectangles over the mask
Group the generated rectangles
Future Enhancements
Horizontal mode
Auto edge detection
Gradient fills instead of solid fills
Per-strip top/bottom gradient sampling
Noise/grain overlay to better match image texture
Feathered edges
One-click “replace mask”
Support frames/groups/vector objects underneath
Live preview before applying