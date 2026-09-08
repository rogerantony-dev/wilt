import { STAGE_T, catHead, decayStage, hex, mix, stageT } from "./catdecay";

describe("decayStage", () => {
  // Mirrors CatDecay.stage in plugin/native/CatDecay.kt; the two must agree.
  const cases: [number, number, number][] = [
    [0, 30, 1],
    [10, 30, 1], // 0.33 -> fresh
    [11, 30, 2], // 0.37 -> wilting
    [19, 30, 2], // 0.63
    [20, 30, 3], // 0.67 -> mouldy
    [24, 30, 3], // 0.80
    [25, 30, 4], // 0.83 -> rotting
    [27, 30, 4], // 0.90
    [28, 30, 5], // 0.93 -> nearly gone
    [30, 30, 6], // at the limit -> gone
    [45, 30, 6],
  ];
  it.each(cases)("%d of %d min is stage %d", (used, limit, stage) => {
    expect(decayStage(used, limit)).toBe(stage);
  });
  it("is fresh for a zero limit", () => {
    expect(decayStage(10, 0)).toBe(1);
  });
  it("maps stages onto the frame t values", () => {
    expect(stageT(1)).toBe(STAGE_T[0]);
    expect(stageT(6)).toBe(1);
    expect(stageT(0)).toBe(STAGE_T[0]);
    expect(stageT(9)).toBe(1);
  });
});

describe("catHead", () => {
  const ts = [0, 0.05, 0.2, 0.5, 0.72, 0.87, 0.96, 1, 1.5];

  it("never produces NaN in a colour (the nested-mix bug)", () => {
    for (const t of ts) {
      const m = catHead(t);
      const colours = [m.fur, m.whiskerStroke, m.nose.fill, m.arcMouth.stroke, ...m.spots.map((s) => s.fill)];
      for (const e of m.eyes) colours.push(e.kind === "x" ? e.stroke : e.iris);
      for (const c of colours) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("is a charcoal kitten when fresh", () => {
    const m = catHead(0.05);
    expect(m.fur).toBe("#33322e");
    expect(m.over).toBe(false);
    expect(m.blushOpacity).toBeGreaterThan(0.5);
    expect(m.cuteMouthOpacity).toBe(1);
    expect(m.spots).toHaveLength(0);
    expect(m.patchR).toBe(0);
    expect(m.eyes[0].kind).toBe("open");
  });

  it("loses the cute bits first, then rots", () => {
    const wilting = catHead(0.5);
    expect(wilting.blushOpacity).toBe(0);
    expect(wilting.cuteMouthOpacity).toBe(0);
    expect(wilting.patchR).toBe(0);
    expect(wilting.eyes[0].kind).toBe("open");
    const mouldy = catHead(0.72);
    expect(mouldy.spots.length).toBeGreaterThan(wilting.spots.length);
    expect(mouldy.patchR).toBe(0);
    const rotting = catHead(0.87);
    expect(rotting.patchR).toBeGreaterThan(0);
    expect(rotting.eyes[0].kind).toBe("x");
    expect(rotting.eyes[1].kind).toBe("open");
    const nearlyGone = catHead(0.96);
    expect(nearlyGone.patchR).toBeGreaterThan(rotting.patchR);
    expect(nearlyGone.eyes[1].kind).toBe("open");
  });

  it("is a bare skull at and past the limit", () => {
    for (const t of [1, 1.5]) {
      const m = catHead(t);
      expect(m.over).toBe(true);
      expect(m.fur).toBe("#e6e1d2");
      expect(m.eyes[0].kind).toBe("x");
      expect(m.eyes[1].kind).toBe("x");
      expect(m.spots).toHaveLength(0);
      expect(m.whiskerOpacity).toBe(0);
    }
  });

  it("darkens the fur monotonically toward green-grey before the skull", () => {
    let prevG = -1;
    for (const t of [0.05, 0.3, 0.5, 0.72, 0.87, 0.96]) {
      const g = parseInt(catHead(t).fur.slice(3, 5), 16);
      expect(g).toBeGreaterThanOrEqual(prevG);
      prevG = g;
    }
  });
});

describe("colour helpers", () => {
  it("formats and mixes", () => {
    expect(hex([0x33, 0x32, 0x2e])).toBe("#33322e");
    expect(mix([0, 0, 0], [255, 255, 255], 0.5)).toBe("#808080");
  });
});
