import { catHead, FURS, mix } from "./catdecay";
import { readFileSync } from "fs";
import { join } from "path";

import { EYE_X, EYE_Y } from "./catdecay";
import {
  baseShapes,
  dullColor,
  FIGURE_BODY_TF,
  FIGURE_BOX,
  FIGURE_HEAD_TF,
  FITTED,
  furColor,
  itemShapes,
  pawsShapes,
  SLEEVED,
  topTilt,
} from "./catshapes";
import { ITEMS, SLOTS } from "./closet";

describe("furColor", () => {
  it("starts at the fresh fur", () => {
    expect(furColor(0)).toBe("#33322e");
  });
  it("matches the head at every stage", () => {
    for (const t of [0.05, 0.5, 0.72, 0.87, 0.96, 1, 1.4]) expect(furColor(t)).toBe(catHead(t).fur);
  });
  it("starts at each fur's own colour and ends as the same bone", () => {
    expect(furColor(0, "ginger")).toBe("#d9833a");
    expect(furColor(0, "white")).toBe("#eeebe3");
    for (const id of Object.keys(FURS)) expect(furColor(1, id)).toBe(furColor(1));
  });
  it("treats an unknown fur as black", () => {
    expect(furColor(0, "plaid")).toBe(furColor(0));
  });
  it("gives light furs dark whiskers so they still show", () => {
    expect(catHead(0, "white").whiskerStroke).not.toBe(catHead(0).whiskerStroke);
    expect(catHead(0, "ginger").whiskerStroke).toBe(catHead(0).whiskerStroke);
  });
});

describe("dullColor", () => {
  it("leaves a fresh colour alone", () => {
    expect(dullColor("#4A6FA5", 0)).toBe("#4a6fa5");
  });
  it("is an 80% grey mix once over", () => {
    expect(dullColor("#4A6FA5", 1.2)).toBe(mix([0x4a, 0x6f, 0xa5], [0x5a, 0x5a, 0x53], 0.8));
  });
  it("is at most a 60% mix before the limit", () => {
    expect(dullColor("#4A6FA5", 0.99)).not.toBe(dullColor("#4A6FA5", 1));
  });
});

describe("topTilt", () => {
  it("is level while fresh", () => {
    expect(topTilt(0)).toBe(0);
  });
  it("slips past 12 degrees once over", () => {
    expect(topTilt(1)).toBeGreaterThan(12);
  });
  it("never tilts a fitted mask or hair", () => {
    for (const id of FITTED) expect(topTilt(1, id)).toBe(0);
    expect(topTilt(1, "crown")).toBeGreaterThan(12);
  });
});

describe("itemShapes", () => {
  it.each(SLOTS)("draws nothing for none in %s", (slot) => {
    for (const t of [0, 0.5, 1]) expect(itemShapes(slot, "none", t)).toEqual([]);
  });
  it("draws nothing for an unknown id", () => {
    expect(itemShapes("top", "sombrero", 0)).toEqual([]);
  });
  const all = SLOTS.filter((slot) => slot !== "fur").flatMap((slot) =>
    ITEMS[slot].filter((i) => i.id !== "none").map((i) => [slot, i.id] as const),
  );
  it.each(all)("%s %s draws something", (slot, id) => {
    expect(itemShapes(slot, id, 0).length).toBeGreaterThan(0);
    expect(itemShapes(slot, id, 1).length).toBeGreaterThan(0);
  });
  it("draws no fur in a body item, so outfits never depend on the fur colour", () => {
    for (const { id } of ITEMS.body) {
      const fills = itemShapes("body", id, 0).flatMap((s) => [s.props.fill, s.props.stroke]);
      expect(fills).not.toContain(furColor(0));
    }
  });
  it("draws nothing for a fur id: the fur colours the cat, it is not a garment", () => {
    for (const { id } of ITEMS.fur) expect(itemShapes("fur", id, 0)).toEqual([]);
  });
  it("adds moth holes to a torso piece once over", () => {
    const holes = (t: number) => itemShapes("body", "tee", t).filter((s) => s.props.fill === "#0D0D0C").length;
    expect(holes(0.9)).toBe(0);
    expect(holes(1)).toBe(3);
  });
});

describe("pawsShapes", () => {
  it("puts the paws back over every sleeved body item, in the fur", () => {
    for (const id of SLEEVED) {
      const paws = pawsShapes(id, 0, "ginger");
      expect(paws).toHaveLength(2);
      for (const p of paws) expect(p.props.fill).toBe(furColor(0, "ginger"));
    }
  });
  it("leaves them alone without a torso piece (the tutu stays over the paws)", () => {
    for (const id of ["none", "scarf"]) expect(pawsShapes(id, 0)).toEqual([]);
  });
  it("lists exactly the body items that have a torso piece", () => {
    const sleeved = ITEMS.body.map((i) => i.id).filter((id) => !["none", "scarf"].includes(id));
    expect([...SLEEVED].sort()).toEqual(sleeved.sort());
  });
});

describe("baseShapes", () => {
  it("shows ribs only once over", () => {
    const ribs = (t: number) => baseShapes(t).filter((s) => s.props.stroke === "#8A8574").length;
    expect(ribs(0.96)).toBe(0);
    expect(ribs(1)).toBeGreaterThan(0);
  });
  it("grows mould spots before the limit and drops them after", () => {
    const spots = (t: number) => baseShapes(t).filter((s) => s.kind === "ellipse" && "opacity" in s.props).length;
    expect(spots(0.05)).toBe(0);
    expect(spots(0.87)).toBe(3);
    expect(spots(1)).toBe(0);
  });
  it("sits in the figure box", () => {
    expect(FIGURE_BOX).toEqual({ x: 0, y: -40, w: 256, h: 440 });
  });
});

describe("the chibi proportions", () => {
  // cat-figure.js renders the service's PNG layers; the app must place the parts the same way.
  const figureJs = readFileSync(join(__dirname, "../design-previews/cat-figure.js"), "utf8");
  const rotCatJs = readFileSync(join(__dirname, "../design-previews/rot-cat.js"), "utf8");
  it("matches cat-figure.js", () => {
    expect(figureJs).toContain(`head: '${FIGURE_HEAD_TF}'`);
    expect(figureJs).toContain(`body: '${FIGURE_BODY_TF}'`);
  });
  it("shares the fur palette, sleeved list and fitted list with the canonical drawing", () => {
    const hex2 = (n: number) => `0x${n.toString(16).toUpperCase().padStart(2, "0")}`;
    for (const [id, { fresh }] of Object.entries(FURS)) {
      if (id === "black") continue; // FUR_FRESH, checked by name
      expect(rotCatJs).toContain(`${id}: { fresh: [${fresh.map(hex2).join(", ")}]`);
    }
    expect(figureJs).toContain(`const SLEEVED = [${SLEEVED.map((s) => `'${s}'`).join(", ")}];`);
    expect(figureJs).toContain(`const FITTED = [${FITTED.map((s) => `'${s}'`).join(", ")}];`);
  });
  it("puts the eyes where rot-cat.js does", () => {
    expect(rotCatJs).toContain(`const EYE_Y = ${EYE_Y}`);
    expect(rotCatJs).toContain(`eye(${EYE_X[0]}, EYE_Y`);
    expect(rotCatJs).toContain(`eye(${EYE_X[1]}, EYE_Y`);
  });
});
