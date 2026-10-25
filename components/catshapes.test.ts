import { catHead, mix } from "./catdecay";
import { baseShapes, dullColor, FIGURE_BOX, furColor, itemShapes, topTilt } from "./catshapes";
import { ITEMS, SLOTS } from "./closet";

describe("furColor", () => {
  it("starts at the fresh fur", () => {
    expect(furColor(0)).toBe("#33322e");
  });
  it("matches the head at every stage", () => {
    for (const t of [0.05, 0.5, 0.72, 0.87, 0.96, 1, 1.4]) expect(furColor(t)).toBe(catHead(t).fur);
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
});

describe("itemShapes", () => {
  it.each(SLOTS)("draws nothing for none in %s", (slot) => {
    for (const t of [0, 0.5, 1]) expect(itemShapes(slot, "none", t)).toEqual([]);
  });
  it("draws nothing for an unknown id", () => {
    expect(itemShapes("top", "sombrero", 0)).toEqual([]);
  });
  const all = SLOTS.flatMap((slot) => ITEMS[slot].filter((i) => i.id !== "none").map((i) => [slot, i.id] as const));
  it.each(all)("%s %s draws something", (slot, id) => {
    expect(itemShapes(slot, id, 0).length).toBeGreaterThan(0);
    expect(itemShapes(slot, id, 1).length).toBeGreaterThan(0);
  });
  it("redraws the arms over a torso piece but not for a scarf", () => {
    const fur = furColor(0);
    const furArms = (id: string) => itemShapes("body", id, 0).filter((s) => s.props.stroke === fur).length;
    expect(furArms("tee")).toBe(2);
    expect(furArms("scarf")).toBe(0);
  });
  it("adds moth holes to a torso piece once over", () => {
    const holes = (t: number) => itemShapes("body", "tee", t).filter((s) => s.props.fill === "#0D0D0C").length;
    expect(holes(0.9)).toBe(0);
    expect(holes(1)).toBe(3);
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
