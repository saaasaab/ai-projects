import type { Bounds, RGB, Strip, StripColor } from "./types";

/** Parent that can receive cover strip siblings (page or frame/group). */
export type CoverParent = PageNode | SceneNode;

export function boundsFromNode(node: SceneNode): Bounds | null {
  const box = node.absoluteBoundingBox;
  if (!box) return null;
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

/** Mask-local bounds for strip layout (same space as mask.width / mask.x). */
export function maskLocalBounds(mask: SceneNode & LayoutMixin): Bounds {
  return { x: 0, y: 0, width: mask.width, height: mask.height };
}

export function multiplyTransform(a: Transform, b: Transform): Transform {
  return [
    [
      a[0][0] * b[0][0] + a[0][1] * b[1][0],
      a[0][0] * b[0][1] + a[0][1] * b[1][1],
      a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2],
    ],
    [
      a[1][0] * b[0][0] + a[1][1] * b[1][0],
      a[1][0] * b[0][1] + a[1][1] * b[1][1],
      a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2],
    ],
  ];
}

/** Place a mask-local strip as a sibling, preserving mask rotation. */
export function stripRelativeTransform(mask: SceneNode & LayoutMixin, strip: Strip): Transform {
  const localOffset: Transform = [
    [1, 0, strip.x],
    [0, 1, strip.y],
  ];
  return multiplyTransform(mask.relativeTransform, localOffset);
}

function rgba(color: RGB): RGB & { a: number } {
  return { ...color, a: 1 };
}

/** Solid or linear gradient fill from sampled strip colors. */
export function fillsForStripColor(stripColor: StripColor): Paint[] {
  if (stripColor.gradient) {
    const { start, end, axis } = stripColor.gradient;
    const gradientTransform: Transform =
      axis === "vertical"
        ? [
            [0, 1, 0],
            [-1, 0, 1],
          ]
        : [
            [1, 0, 0],
            [0, 1, 0],
          ];

    return [
      {
        type: "GRADIENT_LINEAR",
        gradientTransform,
        gradientStops: [
          { position: 0, color: rgba(start) },
          { position: 1, color: rgba(end) },
        ],
      },
    ];
  }

  return [{ type: "SOLID", color: stripColor.color }];
}
