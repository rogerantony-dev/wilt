/**
 * The dressed cat below and above the head, as shape data.
 *
 * A port of design-previews/cat-figure.js, which renders the service's PNG layers; change the two together.
 *
 * Everything sits in the figure box (0 -40 256 440), with the head from
 * catdecay.ts at 0..256 x 0..256 inside it. Layers stack base, bottom, body,
 * paws, head, top; CatFigure.tsx draws them. Base, paws and head carry the
 * fur colour (catdecay FURS); the clothes never do. Shape props are named as
 * react-native-svg props so the component can spread them straight on.
 */

import { catHead, mix, ramp, type Rgb } from "./catdecay";
import type { Slot } from "./closet";

export type Shape = {
  kind: "path" | "circle" | "ellipse" | "rect";
  props: Record<string, string | number>;
};

export const FIGURE_BOX = { x: 0, y: -40, w: 256, h: 440 };
/**
 * Chibi proportions, as in cat-figure.js: in the figure box the head and its
 * headwear are scaled up by 1.24, and the body layers squashed to 1.1 x 0.7
 * about the neck, then everything moves down 48 so the cat fills the box as it
 * did before. Each part keeps its own coordinates; these place it. The pill box
 * draws the head at its own size.
 * head: scale 1.24 about (128, 176), then down 48; body: scale 1.1 x 0.7 about (128, 206), then down 48.
 */
export const FIGURE_HEAD_TF = "matrix(1.24 0 0 1.24 -30.72 5.76)";
export const FIGURE_BODY_TF = "matrix(1.1 0 0 0.7 -12.8 109.8)";
/** The head plus headwear, for the pill. */
export const PILL_BOX = { x: -8, y: -40, w: 272, h: 272 };

const DEAD_GREY: Rgb = [0x5a, 0x5a, 0x53];
const HOLE = "#0D0D0C";
const RIB = "#8A8574";
const MOLD = ["#8FB23C", "#B5C64A", "#6F9636", "#D0DC5A"];

/** The fur, the same colour the head is. `fur` is a catdecay FURS id; black when unset. */
export function furColor(t: number, fur?: string): string {
  return catHead(t, fur).fur;
}

/** Body items with a torso piece and sleeves; the paws layer goes over these. Mirrored in cat-figure.js and CatFigureLayers.kt. */
export const SLEEVED = ["tee", "hoodie", "stripes", "raincoat", "suit", "spidersuit", "batsuit", "hunterarmour"];
/** Headwear that fits the head (masks, hair): it stays put instead of tilting with the ears. */
export const FITTED = ["spidermask", "batcowl", "hunterhair"];

const rgb = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;

/** Clothes drain toward a dead grey as the cat wilts: up to 60%, then 80% once over. */
export function dullColor(h: string, t: number): string {
  const k = t >= 1 ? 0.8 : ramp(t, 0.35, 1) * 0.6;
  return mix(rgb(h), DEAD_GREY, k);
}

const earDroop = (t: number) => ramp(t, 0.25, 0.85) * 42;

/** Degrees the headwear tilts about (TOP_PIVOT): with the ears, and askew once over. Fitted pieces never tilt. */
export function topTilt(t: number, id?: string): number {
  if (id && FITTED.includes(id)) return 0;
  return earDroop(t) * 0.3 + (t >= 1 ? 12 : 0);
}
export const TOP_PIVOT = { x: 128, y: 96 };

// ---- builders

type P = Record<string, string | number>;
const path = (d: string, props: P): Shape => ({ kind: "path", props: { d, ...props } });
const stroke = (d: string, color: string, width: number, extra: P = {}): Shape =>
  path(d, { fill: "none", stroke: color, strokeWidth: width, ...extra });
const circle = (cx: number, cy: number, r: number, fill: string, extra: P = {}): Shape => ({
  kind: "circle",
  props: { cx, cy, r, fill, ...extra },
});
const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string, extra: P = {}): Shape => ({
  kind: "ellipse",
  props: { cx, cy, rx, ry, fill, ...extra },
});
const rect = (x: number, y: number, width: number, height: number, rx: number, fill: string, extra: P = {}): Shape => ({
  kind: "rect",
  props: { x, y, width, height, rx, fill, ...extra },
});
const line = (x1: number, y1: number, x2: number, y2: number, color: string, width: number) =>
  stroke(`M${x1} ${y1} L${x2} ${y2}`, color, width);

// ---- top (headwear), drawn before the tilt

function topShapes(id: string, t: number): Shape[] {
  const c = (h: string) => dullColor(h, t);
  switch (id) {
    case "beanie":
      return [
        path("M50 106 C50 34 206 34 206 106 Z", { fill: c("#C44A3F") }),
        rect(46, 92, 164, 22, 11, c("#A63A31")),
        ...[64, 80, 96, 112, 128, 144, 160, 176, 192].map((x) => line(x, 96, x, 110, c("#8E2F27"), 3)),
        circle(128, 34, 15, c("#F2F1EC")),
      ];
    case "cap":
      return [
        path("M58 104 C58 42 198 42 198 104 Z", { fill: c("#38C786") }),
        path("M150 96 C182 88 220 92 232 106 C206 112 176 110 150 106 Z", { fill: c("#2A9C69") }),
        circle(128, 46, 6, c("#2A9C69")),
        stroke("M128 46 L128 104", c("#2A9C69"), 2.5),
      ];
    case "crown":
      return [
        path("M88 64 L84 26 L106 44 L128 18 L150 44 L172 26 L168 64 Z", { fill: c("#E5B53A") }),
        rect(86, 58, 84, 10, 4, c("#C9962A")),
        circle(128, 44, 5, c("#D2542F")),
        circle(104, 52, 4, c("#38C786")),
        circle(152, 52, 4, c("#6FB3E6")),
      ];
    case "party":
      return [
        path("M128 -14 L98 58 L158 58 Z", { fill: c("#6FB3E6") }),
        stroke("M118 10 L138 6 M108 34 L148 28", c("#F2F1EC"), 6, { strokeLinecap: "round" }),
        circle(128, -16, 9, c("#E5B53A")),
      ];
    case "flower":
      // Petals: the script's translate(164 58) rotate(a) on (0, -13), as one rotate about the centre.
      return [
        ...[0, 72, 144, 216, 288].map((a) => ellipse(164, 45, 9, 13, c("#F2A6B4"), { transform: `rotate(${a} 164 58)` })),
        circle(164, 58, 8, c("#E5B53A")),
        stroke("M150 74 q-8 10 -20 12", c("#38C786"), 4, { strokeLinecap: "round" }),
      ];
    case "phones":
      return [
        stroke("M42 132 C42 22 214 22 214 132", c("#2A2A27"), 12, { strokeLinecap: "round" }),
        rect(28, 108, 28, 50, 12, c("#38C786")),
        rect(200, 108, 28, 50, 12, c("#38C786")),
      ];
    case "bow":
      // The script's translate(92 54) rotate(-18), baked into the coordinates.
      return [
        path("M92 54 L66 40 L66 68 Z M92 54 L118 40 L118 68 Z", { fill: c("#E08A97"), transform: "rotate(-18 92 54)" }),
        circle(92, 54, 7, c("#C86A79")),
      ];
    case "halo":
      return [ellipse(128, 22, 46, 11, "none", { stroke: c("#E5B53A"), strokeWidth: 7 })];
    case "spidermask":
      return [
        path(MASK, { fill: c("#C8322E"), fillRule: "evenodd" }),
        stroke(MASK_WEB, c("#4A1210"), 2, { strokeLinecap: "round" }),
        circle(94, 146, 27, "none", { stroke: c("#1A1A18"), strokeWidth: 5 }),
        circle(162, 146, 27, "none", { stroke: c("#1A1A18"), strokeWidth: 5 }),
      ];
    case "batcowl":
      return [
        path("M60 112 L78 4 L108 70 Z M196 112 L178 4 L148 70 Z", { fill: c("#26262C") }),
        path(MASK, { fill: c("#2E2E36"), fillRule: "evenodd" }),
        stroke("M58 104 C80 70 176 70 198 104", c("#4A4A55"), 3, { strokeLinecap: "round" }),
      ];
    case "hunterhair":
      return [
        stroke("M198 96 C224 110 234 150 224 190", c("#D6D6CE"), 15, { strokeLinecap: "round" }),
        rect(210, 124, 20, 9, 4, c("#5A4632"), { transform: "rotate(70 220 128)" }),
        path(
          "M40 130 C34 62 90 42 128 42 C166 42 222 62 216 130 C206 110 192 100 174 98 L162 112 L152 94 C140 100 116 100 104 94 L94 112 L82 98 C64 100 50 110 40 130 Z",
          { fill: c("#D6D6CE") },
        ),
        stroke(
          "M70 84 C90 66 110 60 124 60 M136 60 C154 62 176 70 190 86 M58 104 C66 90 80 80 96 76",
          c("#A9A9A0"),
          3,
          { strokeLinecap: "round" },
        ),
        stroke("M84 104 L91 120 M99 171 L103 181", c("#C86A79"), 3.5, { strokeLinecap: "round" }),
      ];
    default:
      return [];
  }
}

/**
 * The mask over the head down to the nose, with the cat's own eyes showing
 * through two holes (so the face still wilts behind it). Head ellipse: centre
 * (128, 134), 88 x 76. Same path as cat-figure.js.
 */
const MASK =
  "M44.5 158 A88 76 0 1 1 211.5 158 Q128 162 44.5 158 Z M121 146 a27 27 0 1 0 -54 0 a27 27 0 1 0 54 0 Z M189 146 a27 27 0 1 0 -54 0 a27 27 0 1 0 54 0 Z";
/** Web lines on the mask: spokes up from the middle of the head, away from the eyes, and two sagging rings. */
const MASK_WEB = (() => {
  const angles = [-150, -120, -90, -60, -30].map((a) => (a * Math.PI) / 180);
  const at = (a: number, k: number) => [128 + 88 * k * Math.cos(a), 134 + 76 * k * Math.sin(a)];
  const f = (v: number) => v.toFixed(1);
  const spokes = angles.map((a) => {
    const [x0, y0] = at(a, 0.28);
    const [x1, y1] = at(a, 0.98);
    return `M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}`;
  });
  const ring = (k: number) =>
    angles.slice(1).map((a, i) => {
      const [x0, y0] = at(angles[i], k);
      const [x1, y1] = at(a, k);
      const [cx, cy] = at((a + angles[i]) / 2, k * 0.86);
      return `M${f(x0)} ${f(y0)} Q${f(cx)} ${f(cy)} ${f(x1)} ${f(y1)}`;
    });
  return [...spokes, ...ring(0.55), ...ring(0.8)].join(" ");
})();

// ---- body

const TORSO = "M84 214 C76 252 76 300 90 332 L166 332 C180 300 180 252 172 214 C158 200 98 200 84 214 Z";
const TEE = "M84 214 C78 246 78 284 84 312 L172 312 C178 284 178 246 172 214 C158 200 98 200 84 214 Z";
const ARM_L = "M90 224 C70 238 62 266 68 292";
const ARM_R = "M166 224 C186 238 194 266 188 292";

const arms = (fur: string) => [ARM_L, ARM_R].map((d) => stroke(d, fur, 20, { strokeLinecap: "round" }));
const paws = (fur: string) => [circle(68, 292, 12, fur), circle(188, 292, 12, fur)];

/** The stripes' pattern tile (10 x 16 in user space, top half dark), or null for other items. */
export function bodyPattern(id: string, t: number): { light: string; dark: string } | null {
  return id === "stripes" ? { light: dullColor("#F2F1EC", t), dark: dullColor("#D2542F", t) } : null;
}

function torsoPiece(id: string, t: number, patternId: string): Shape[] {
  const c = (h: string) => dullColor(h, t);
  const holes = t >= 1 ? [circle(108, 262, 5, HOLE), circle(150, 292, 4, HOLE), circle(140, 236, 3, HOLE)] : [];
  switch (id) {
    case "tee":
      return [
        path(TEE, { fill: c("#E8E3D3") }),
        path("M122 254 c-6 -8 -16 -2 -10 6 l10 10 l10 -10 c6 -8 -4 -14 -10 -6z", { fill: c("#D2542F") }),
        ...holes,
      ];
    case "hoodie":
      return [
        path("M84 214 C76 252 76 296 86 324 L170 324 C180 296 180 252 172 214 C158 200 98 200 84 214 Z", {
          fill: c("#4A6FA5"),
        }),
        path("M102 284 h52 v18 a8 8 0 0 1 -8 8 h-36 a8 8 0 0 1 -8 -8z", { fill: c("#3D5E8E") }),
        stroke("M116 212 v30 M140 212 v30", c("#F2F1EC"), 3, { strokeLinecap: "round" }),
        ...holes,
      ];
    case "stripes":
      return [path(TEE, { fill: `url(#${patternId})` }), ...holes];
    case "raincoat":
      return [
        path("M82 214 C74 256 72 306 84 340 L172 340 C184 306 182 256 174 214 C158 200 98 200 82 214 Z", {
          fill: c("#E5B53A"),
        }),
        stroke("M128 212 V338", c("#C9962A"), 3),
        ...[236, 262, 288, 314].map((y) => circle(138, y, 4, c("#2A2A27"))),
        ...holes,
      ];
    case "suit":
      return [
        path(TEE, { fill: c("#2B2E3A") }),
        path("M108 206 L128 268 L148 206 Z", { fill: c("#F2F1EC") }),
        path("M128 222 l-14 -8 v16 z M128 222 l14 -8 v16 z", { fill: c("#D2542F") }),
        circle(128, 286, 3.5, c("#62625B")),
        ...holes,
      ];
    case "spidersuit":
      return [
        path(TEE, { fill: c("#C8322E") }),
        stroke(SUIT_WEB, c("#4A1210"), 2, { strokeLinecap: "round" }),
        ellipse(128, 250, 6, 9, c("#1A1A18")),
        circle(128, 238, 4.5, c("#1A1A18")),
        stroke(
          "M122 244 l-12 -8 M122 250 l-14 -2 M122 256 l-13 6 M123 261 l-9 10 M134 244 l12 -8 M134 250 l14 -2 M134 256 l13 6 M133 261 l9 10",
          c("#1A1A18"),
          2.5,
          { strokeLinecap: "round" },
        ),
        ...holes,
      ];
    case "batsuit":
      return [
        path(TEE, { fill: c("#4A4A52") }),
        stroke("M96 206 C110 218 146 218 160 206", c("#26262C"), 6, { strokeLinecap: "round" }),
        path("M82 292 C110 300 146 300 174 292 L174 306 C146 314 110 314 82 306 Z", { fill: c("#E5B53A") }),
        ...[100, 116, 140, 156].map((x) => rect(x - 5, 296, 10, 12, 2, c("#C9962A"))),
        rect(121, 295, 14, 14, 3, c("#C9962A"), { stroke: c("#8E6B1E"), strokeWidth: 2 }),
        ...holes,
      ];
    case "hunterarmour":
      return [
        path(TEE, { fill: c("#3A332C") }),
        stroke("M170 214 L88 304", c("#6B5238"), 9, { strokeLinecap: "round" }),
        ...(
          [
            [150, 236],
            [130, 258],
            [110, 280],
          ] as const
        ).map(([x, y]) => circle(x, y, 3, c("#BFC3C4"))),
        stroke("M108 208 L128 246 L148 208", c("#BFC3C4"), 2.5),
        circle(128, 256, 12, c("#BFC3C4"), { stroke: c("#8D9294"), strokeWidth: 2 }),
        path("M119 252 l3 -9 l4 6 h4 l4 -6 l3 9 l-4 9 h-10 z", { fill: c("#6E7476") }),
        circle(124.5, 253, 1.4, c("#D2542F")),
        circle(131.5, 253, 1.4, c("#D2542F")),
        ...holes,
      ];
    default:
      return [];
  }
}

/** Web lines on the spider suit: down the torso and across it, inside TEE. */
const SUIT_WEB =
  [100, 114, 142, 156].map((x) => `M${x} 214 V306`).join(" ") +
  " " +
  [234, 258, 282].map((y) => `M84 ${y} Q128 ${y + 10} 172 ${y}`).join(" ");

/**
 * Behind the torso: the bat cape's two wings, out past the arms but clear of
 * the legs, and the hunter's two swords, hilts up over the right shoulder.
 */
function behind(id: string, t: number): Shape[] {
  const c = (h: string) => dullColor(h, t);
  switch (id) {
    case "batsuit":
      return [
        path(
          "M88 210 C62 240 46 290 38 332 L64 318 L92 326 L96 300 Z M168 210 C194 240 210 290 218 332 L192 318 L164 326 L160 300 Z",
          { fill: c("#1E1E24") },
        ),
      ];
    case "hunterarmour":
      // Two swords, the second shifted (6, 12): cat-figure.js's translate, baked in.
      return (
        [
          [0, "#4A3A2A"],
          [6, "#3E3024"],
        ] as const
      ).flatMap(([d, col]) => {
        const x = (v: number) => v + d;
        const y = (v: number) => v + d * 2;
        return [
          stroke(`M${x(212)} ${y(210)} L${x(76)} ${y(318)}`, c(col), 9, { strokeLinecap: "round" }),
          stroke(`M${x(214)} ${y(208)} L${x(230)} ${y(195)}`, c("#2A2A27"), 6, { strokeLinecap: "round" }),
          stroke(`M${x(205)} ${y(203)} L${x(218)} ${y(219)}`, c("#BFC3C4"), 5, { strokeLinecap: "round" }),
          circle(x(232), y(193), 4.5, c("#BFC3C4")),
        ];
      });
    default:
      return [];
  }
}

function sleeves(id: string, t: number): Shape[] {
  const c = (h: string) => dullColor(h, t);
  const s = (col: string, l: string, r: string) => [l, r].map((d) => stroke(d, col, 26, { strokeLinecap: "round" }));
  const shortL = "M90 224 C80 232 74 244 72 254";
  const shortR = "M166 224 C176 232 182 244 184 254";
  const longL = "M90 224 C70 238 62 262 66 282";
  const longR = "M166 224 C186 238 194 262 190 282";
  switch (id) {
    case "tee":
      return s(c("#E8E3D3"), shortL, shortR);
    case "stripes":
      return s(c("#D2542F"), longL, longR);
    case "hoodie":
      return s(c("#4A6FA5"), longL, longR);
    case "raincoat":
      return s(c("#E5B53A"), longL, longR);
    case "suit":
      return s(c("#2B2E3A"), longL, longR);
    case "spidersuit":
      return [
        ...s(c("#C8322E"), longL, longR),
        stroke("M74 248 l-10 6 M70 266 l-12 2 M182 248 l10 6 M186 266 l12 2", c("#4A1210"), 2, { strokeLinecap: "round" }),
      ];
    case "batsuit":
      return [
        ...s(c("#4A4A52"), longL, longR),
        stroke("M64 270 l-6 -8 l10 2 M192 270 l6 -8 l-10 2", c("#26262C"), 4, {
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
      ];
    case "hunterarmour":
      return [...s(c("#3A332C"), longL, longR), stroke("M62 262 h16 M178 262 h16", c("#6B5238"), 5, { strokeLinecap: "round" })];
    default:
      return [];
  }
}

function scarf(id: string, t: number): Shape[] {
  if (id !== "scarf") return [];
  const c = (h: string) => dullColor(h, t);
  return [
    path("M76 196 C100 214 156 214 180 196 L182 214 C156 232 100 232 74 214 Z", { fill: c("#C44A3F") }),
    path("M150 220 l6 54 l-18 2 l-2 -50z", { fill: c("#A63A31") }),
    ...[140, 146, 152].map((x) => line(x, 276, x, 286, c("#A63A31"), 3)),
  ];
}

/**
 * The body item: anything behind the torso, the hood, the torso piece, its
 * sleeves (which cover the base's arms), the scarf. No fur here: the paws go
 * back on in their own layer (pawsShapes).
 */
function bodyShapes(id: string, t: number, patternId: string): Shape[] {
  const hood = id === "hoodie" ? [ellipse(128, 204, 66, 22, dullColor("#3D5E8E", t))] : [];
  const piece = torsoPiece(id, t, patternId);
  return [...behind(id, t), ...hood, ...piece, ...(piece.length ? sleeves(id, t) : []), ...scarf(id, t)];
}

/** The paws over a sleeved body item (SLEEVED), in the fur colour; [] otherwise. */
export function pawsShapes(body: string, t: number, fur?: string): Shape[] {
  return SLEEVED.includes(body) ? paws(furColor(t, fur)) : [];
}

// ---- bottom

function bottomShapes(id: string, t: number): Shape[] {
  const c = (h: string) => dullColor(h, t);
  const legs = (col: string, to: number) => [rect(94, 296, 32, to - 296, 10, col), rect(130, 296, 32, to - 296, 10, col)];
  const waist = (col: string) => path("M86 300 C100 308 156 308 170 300 L168 322 C150 330 106 330 88 322 Z", { fill: col });
  /** Boots from the shin (y) down over the feet. */
  const boots = (col: string, y: number) => [
    rect(92, y, 36, 372 - y, 8, col),
    ellipse(106, 372, 22, 10, col),
    rect(128, y, 36, 372 - y, 8, col),
    ellipse(150, 372, 22, 10, col),
  ];
  switch (id) {
    case "jeans":
      return [
        ...legs(c("#3B5B8A"), 362),
        waist(c("#3B5B8A")),
        stroke("M128 306 V352", c("#2D4870"), 2.5),
        stroke("M90 306 C110 312 146 312 166 306", c("#E5B53A"), 2, { strokeDasharray: "4 4" }),
      ];
    case "shorts":
      return [...legs(c("#8A7F6A"), 334), waist(c("#8A7F6A"))];
    case "tutu": {
      const frill = Array.from({ length: 12 }, (_, i) => `q5 ${i % 2 ? -10 : 10} 10 0`).join(" ");
      return [path(`M70 318 ${frill} L190 318 C170 296 86 296 70 318 Z`, { fill: c("#F2A6B4") })];
    }
    case "joggers":
      return [
        ...legs(c("#62625B"), 356),
        waist(c("#62625B")),
        rect(94, 350, 32, 10, 5, c("#4A4A44")),
        rect(130, 350, 32, 10, 5, c("#4A4A44")),
      ];
    case "sneakers":
      return [
        path("M84 370 a22 12 0 0 1 44 0 v6 h-44z", { fill: c("#F2F1EC") }),
        path("M128 370 a22 12 0 0 1 44 0 v6 h-44z", { fill: c("#F2F1EC") }),
        stroke("M96 368 l18 -6 M140 368 l18 -6", c("#38C786"), 4, { strokeLinecap: "round" }),
      ];
    case "spidertights":
      return [
        ...legs(c("#C8322E"), 362),
        waist(c("#C8322E")),
        ...boots(c("#C8322E"), 360),
        stroke("M94 318 h32 M130 318 h32 M94 338 h32 M130 338 h32 M110 300 V372 M146 300 V372", c("#4A1210"), 2, {
          strokeLinecap: "round",
        }),
      ];
    case "batboots":
      return [...legs(c("#4A4A52"), 352), waist(c("#4A4A52")), ...boots(c("#1E1E24"), 344)];
    case "hunterboots":
      return [
        ...legs(c("#2F2B27"), 350),
        waist(c("#2F2B27")),
        ...boots(c("#5A4632"), 338),
        stroke("M92 348 h36 M128 348 h36", c("#3E3024"), 4),
      ];
    default:
      return [];
  }
}

/**
 * One item's shapes for its layer; [] for none or an unknown id. `patternId`
 * names the stripes pattern (see bodyPattern), which must be unique per mounted SVG.
 */
export function itemShapes(slot: Slot, id: string, t: number, patternId = "stripes"): Shape[] {
  switch (slot) {
    case "top":
      return topShapes(id, t);
    case "body":
      return bodyShapes(id, t, patternId);
    case "bottom":
      return bottomShapes(id, t);
    case "fur":
      // The fur colours the base, paws and head; it is not a garment.
      return [];
  }
}

/** The bare cat below the head: tail, legs, feet, torso, mould, ribs once over, arms and paws, in `furId`. */
export function baseShapes(t: number, furId?: string): Shape[] {
  const fur = furColor(t, furId);
  const over = t >= 1;
  const spots: Shape[] = over
    ? []
    : (
        [
          [110, 300, 12, 8, 0.5, 0],
          [150, 240, 10, 7, 0.62, 1],
          [118, 352, 9, 6, 0.75, 2],
        ] as const
      ).flatMap(([x, y, rx, ry, s, ci]) => {
        const k = ramp(t, s, s + 0.08);
        return k > 0 ? [ellipse(x, y, rx, ry, MOLD[ci], { opacity: 0.85 * k })] : [];
      });
  const ribs: Shape[] = over
    ? [
        ...[236, 256, 276, 296].map((y) =>
          stroke(`M100 ${y} q14 6 22 0 M134 ${y} q8 6 22 0`, RIB, 4, { strokeLinecap: "round" }),
        ),
        stroke("M128 220 V310", RIB, 4, { strokeLinecap: "round" }),
      ]
    : [];
  const tail = stroke("M166 318 C212 320 232 282 216 248 C208 232 192 234 196 246", fur, 14, {
    strokeLinecap: "round",
    transform: `rotate(${earDroop(t) * 0.6} 166 318)`,
    ...(over ? { strokeDasharray: "10 6" } : {}),
  });
  return [
    tail,
    rect(96, 296, 28, 70, 14, fur),
    rect(132, 296, 28, 70, 14, fur),
    ellipse(106, 370, 20, 10, fur),
    ellipse(150, 370, 20, 10, fur),
    path(TORSO, { fill: fur }),
    ...spots,
    ...ribs,
    ...arms(fur),
    ...paws(fur),
  ];
}
