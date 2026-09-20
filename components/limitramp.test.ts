import { LIMIT_RAMP, limitColor, limitHint, withAlpha } from "./limitramp";
import { LIMIT_OPTIONS } from "./progress";

describe("LIMIT_RAMP", () => {
  it("has a colour for every rung of the ladder", () => {
    for (const r of LIMIT_OPTIONS) expect(LIMIT_RAMP[r]).toMatch(/^#[0-9A-F]{6}$/i);
  });
  it("starts green and ends red", () => {
    expect(LIMIT_RAMP[5]).toBe("#38C786");
    expect(LIMIT_RAMP[60]).toBe("#D2542F");
  });
});

describe("limitColor", () => {
  it("returns the rung's own colour on the ladder", () => {
    expect(limitColor(30)).toBe("#E0913C");
    expect(limitColor(5)).toBe("#38C786");
  });
  it("snaps an off-ladder value to the next rung up", () => {
    expect(limitColor(20)).toBe(LIMIT_RAMP[30]);
    expect(limitColor(3)).toBe(LIMIT_RAMP[5]);
  });
  it("is red for legacy limits above the ladder", () => {
    expect(limitColor(90)).toBe(LIMIT_RAMP[60]);
    expect(limitColor(120)).toBe(LIMIT_RAMP[60]);
  });
});

describe("limitHint", () => {
  it("names the ends of the ladder and offers the rung-down in between", () => {
    expect(limitHint(5)).toMatch(/tightest/);
    expect(limitHint(60)).toMatch(/seven a week/);
    expect(limitHint(90)).toMatch(/seven a week/);
    expect(limitHint(30)).toMatch(/rung down/);
  });
});

describe("withAlpha", () => {
  it("converts hex to rgba", () => {
    expect(withAlpha("#E0913C", 0.06)).toBe("rgba(224,145,60,0.06)");
  });
});
