import type { ReactNode } from "react";
import Svg, {
  Circle,
  type CircleProps,
  Defs,
  Ellipse,
  type EllipseProps,
  G,
  Path,
  type PathProps,
  Pattern,
  Rect,
  type RectProps,
} from "react-native-svg";

import { CatHead } from "./CatHead";
import { baseShapes, bodyPattern, FIGURE_BOX, itemShapes, PILL_BOX, TOP_PIVOT, topTilt, type Shape } from "./catshapes";
import type { Outfit } from "./closet";

/**
 * The dressed cat: base, bottom, body, head, top, stacked in one SVG in the
 * figure box (or, with `headOnly`, the head and top in the pill box). The head
 * keeps its own 0..256 coordinates, so `eyes` and `children` (drawn over the
 * head, under the top item) work in head coordinates as they do with CatHead.
 * `clipId` must be unique per mounted instance; the SVG ids derive from it.
 * `viewBox` overrides the box, to crop the drawing (the closet's slot tiles).
 */
export function CatFigure({
  t,
  outfit,
  eyes,
  clipId,
  width,
  height,
  headOnly = false,
  viewBox,
  children,
}: {
  t: number;
  outfit: Outfit;
  eyes?: (children: ReactNode) => ReactNode;
  clipId: string;
  width: number;
  height: number;
  headOnly?: boolean;
  viewBox?: string;
  children?: ReactNode;
}) {
  const box = headOnly ? PILL_BOX : FIGURE_BOX;
  const patternId = `${clipId}-stripes`;
  const pattern = headOnly ? null : bodyPattern(outfit.body, t);
  const top = itemShapes("top", outfit.top, t);

  return (
    <Svg width={width} height={height} viewBox={viewBox ?? `${box.x} ${box.y} ${box.w} ${box.h}`}>
      {pattern ? (
        <Defs>
          <Pattern id={patternId} width={10} height={16} patternUnits="userSpaceOnUse">
            <Rect width={10} height={16} fill={pattern.light} />
            <Rect width={10} height={8} fill={pattern.dark} />
          </Pattern>
        </Defs>
      ) : null}
      {headOnly ? null : (
        <>
          <Shapes shapes={baseShapes(t)} />
          <Shapes shapes={itemShapes("bottom", outfit.bottom, t)} />
          <Shapes shapes={itemShapes("body", outfit.body, t, patternId)} />
        </>
      )}
      <CatHead t={t} eyes={eyes} clipId={`${clipId}-head`} />
      {children}
      {top.length ? (
        <G transform={`rotate(${topTilt(t)} ${TOP_PIVOT.x} ${TOP_PIVOT.y})`}>
          <Shapes shapes={top} />
        </G>
      ) : null}
    </Svg>
  );
}

function Shapes({ shapes }: { shapes: Shape[] }) {
  return (
    <>
      {shapes.map((s, i) => {
        // Props are named as react-native-svg props (see catshapes.ts).
        const p: unknown = s.props;
        switch (s.kind) {
          case "path":
            return <Path key={i} {...(p as PathProps)} />;
          case "circle":
            return <Circle key={i} {...(p as CircleProps)} />;
          case "ellipse":
            return <Ellipse key={i} {...(p as EllipseProps)} />;
          case "rect":
            return <Rect key={i} {...(p as RectProps)} />;
        }
      })}
    </>
  );
}
