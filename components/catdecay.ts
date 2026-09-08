/**
 * The cat that rots, as numbers. A port of design-previews/rot-cat.js (which
 * renders the pill and widget frames) so the home-screen clock can draw the
 * same cat with react-native-svg. Everything here is pure so it can be tested;
 * CatHead.tsx turns the model into SVG.
 *
 * `t` is minutes used over the limit: 0 fresh, 1 at the limit, and anything
 * at or past 1 is the skull. The six bands match CatDecay.kt exactly; the
 * clock shows the same six frames the pill and widget do, not a seventh look.
 */

export type Rgb = [number, number, number];

const FUR_FRESH: Rgb = [0x33, 0x32, 0x2e];
const FUR_SICK: Rgb = [0x44, 0x5e, 0x38];
const FUR_ROT: Rgb = [0x5c, 0x7a, 0x40];
const BONE: Rgb = [0xe6, 0xe1, 0xd2];
const EYE: Rgb = [0xf2, 0xf1, 0xec];
const CLOUDY_EYE: Rgb = [0xb9, 0xc4, 0xb8];
const GREEN: Rgb = [0x38, 0xc7, 0x86];
const RED: Rgb = [0xd2, 0x54, 0x2f];
const WHISKER_SICK: Rgb = [0x8a, 0x92, 0x84];
const MOLD = ["#8FB23C", "#B5C64A", "#6F9636", "#D0DC5A"];

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Smoothstep of x clamped to 0..1. */
export const smooth = (x: number) => {
  const c = clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
};
/** 0 before `from`, 1 after `to`, eased between. */
export const ramp = (t: number, from: number, to: number) => smooth((t - from) / (to - from));

export function hex(c: Rgb): string {
  return (
    "#" +
    c
      .map((v) =>
        Math.round(clamp(v, 0, 255))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function mixRgb(a: Rgb, b: Rgb, k: number): Rgb {
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}
export function mix(a: Rgb, b: Rgb, k: number): string {
  return hex(mixRgb(a, b, k));
}

/** 1 fresh .. 6 gone. Same bands as CatDecay.stage in Kotlin. */
export function decayStage(usedMinutes: number, limitMinutes: number): number {
  if (limitMinutes <= 0) return 1;
  if (usedMinutes >= limitMinutes) return 6;
  const frac = usedMinutes / limitMinutes;
  if (frac >= 0.92) return 5;
  if (frac >= 0.82) return 4;
  if (frac >= 0.65) return 3;
  if (frac >= 0.35) return 2;
  return 1;
}

/** The `t` each shipped frame was rendered at, so the clock matches the PNGs. */
export const STAGE_T = [0.05, 0.5, 0.72, 0.87, 0.96, 1.0] as const;

export function stageT(stage: number): number {
  return STAGE_T[clamp(Math.round(stage), 1, 6) - 1];
}

export type Spot = { cx: number; cy: number; rx: number; ry: number; fill: string; opacity: number };
export type Eye =
  | { kind: "x"; cx: number; cy: number; stroke: string }
  | {
      kind: "open";
      cx: number;
      cy: number;
      iris: string;
      pupil: string;
      pupilOpacity: number;
      pupilR: number;
      look: number;
      shine: { r: number; opacity: number };
      shine2: { r: number; opacity: number };
      lidHeight: number;
      lidFill: string;
    };

export type CatHeadModel = {
  over: boolean;
  fur: string;
  earDroop: number;
  earInnerOpacity: number;
  earNotch: boolean;
  blushOpacity: number;
  whiskerDroop: number;
  whiskerOpacity: number;
  whiskerStroke: string;
  spots: Spot[];
  /** Skull patch size, 0 when hidden; the full skull is `over`. */
  patchR: number;
  patchOpacity: number;
  eyes: [Eye, Eye];
  nose: { fill: string };
  /** Cute ω mouth opacity (fresh only). */
  cuteMouthOpacity: number;
  /** Single arc: control-point dy (+ smile, - frown), stroke, opacity. */
  arcMouth: { dy: number; stroke: string; opacity: number };
  gape: number;
  tearOpacity: number;
};

export function catHead(tIn: number): CatHeadModel {
  const t = Math.max(0, tIn);
  const over = t >= 1;
  const sick = ramp(t, 0.2, 0.7);
  const rotK = ramp(t, 0.65, 1);
  const droop = ramp(t, 0.25, 0.85) * 42;
  const lid = ramp(t, 0.25, 0.75) * 0.55;
  const cloud = ramp(t, 0.5, 0.65);
  const mouthK = clamp(t / 0.9, 0, 1);
  const skullK = ramp(t, 0.72, 1.0);
  const bead = ramp(t, 0.2, 0.75);
  const fur = over ? hex(BONE) : hex(mixRgb(mixRgb(FUR_FRESH, FUR_SICK, sick), FUR_ROT, rotK));

  const spotSpec: [number, number, number, number, number, number][] = [
    [84, 152, 16, 11, 0.42, 0],
    [176, 94, 13, 9, 0.48, 1],
    [66, 110, 11, 8, 0.55, 2],
    [152, 176, 19, 12, 0.6, 3],
    [110, 196, 13, 8, 0.66, 0],
    [190, 152, 11, 11, 0.72, 1],
    [102, 74, 14, 9, 0.78, 2],
    [140, 120, 9, 7, 0.84, 3],
  ];
  const spots: Spot[] = over
    ? []
    : spotSpec
        .map(([cx, cy, rx, ry, s, c]) => {
          const o = ramp(t, s, s + 0.08);
          return { cx, cy, rx: rx * (0.7 + 0.3 * o), ry: ry * (0.7 + 0.3 * o), fill: MOLD[c], opacity: 0.85 * o };
        })
        .filter((s) => s.opacity > 0);

  const look = lerp(2, 0, cloud);
  const eye = (cx: number, cy: number, x: boolean, cloudy: number): Eye => {
    if (x) return { kind: "x", cx, cy, stroke: over ? "#2A2A27" : hex(EYE) };
    const pr = lerp(12, 5, bead);
    return {
      kind: "open",
      cx,
      cy,
      iris: mix(EYE, CLOUDY_EYE, cloudy),
      pupil: cloudy > 0.5 ? "#7A8B8F" : "#151513",
      pupilOpacity: 1 - cloudy * 0.35,
      pupilR: pr,
      look,
      shine: { r: lerp(4.5, 1.8, bead), opacity: 1 - cloudy },
      shine2: { r: lerp(2.2, 0, bead), opacity: (1 - cloudy) * 0.9 },
      lidHeight: 38 * lid,
      lidFill: fur,
    };
  };

  const gape = ramp(t, 0.8, 0.98);
  const cute = 1 - ramp(t, 0.22, 0.4);

  return {
    over,
    fur,
    earDroop: droop,
    earInnerOpacity: over ? 0 : 0.9 * (1 - ramp(t, 0.15, 0.5)),
    earNotch: !over && t >= 0.7,
    blushOpacity: over ? 0 : 0.55 * (1 - ramp(t, 0.15, 0.45)),
    whiskerDroop: ramp(t, 0.3, 0.9) * 10,
    whiskerOpacity: over ? 0 : lerp(0.85, 0.35, ramp(t, 0.3, 0.9)),
    whiskerStroke: mix(EYE, WHISKER_SICK, sick),
    spots,
    patchR: !over && skullK > 0 ? lerp(30, 150, skullK) : 0,
    patchOpacity: 0.6 + 0.4 * skullK,
    eyes: [eye(102, 128, t >= 0.84, 0), eye(154, 128, over, cloud)],
    nose: { fill: over ? "#2A2A27" : mix(GREEN, RED, ramp(t, 0.3, 0.7)) },
    cuteMouthOpacity: over ? 0 : cute,
    arcMouth: {
      dy: lerp(8, -20, mouthK),
      stroke: mix(GREEN, RED, ramp(t, 0.3, 0.8)),
      opacity: over ? 0 : 1 - cute,
    },
    gape,
    tearOpacity: !over && t >= 0.8 ? ramp(t, 0.8, 0.9) : 0,
  };
}
