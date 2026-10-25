import {
  ITEMS,
  SLOTS,
  NO_OUTFIT,
  findItem,
  isOwned,
  canBuy,
  normalizeOutfit,
} from "./closet";

describe("catalogue", () => {
  it("starts every slot with none at price 0", () => {
    for (const slot of SLOTS) {
      expect(ITEMS[slot][0]).toMatchObject({ id: "none", price: 0 });
    }
  });

  it("has unique, lowercase-letter ids per slot (they become Android resource names)", () => {
    for (const slot of SLOTS) {
      const ids = ITEMS[slot].map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z]+$/);
    }
  });

  it("uses the agreed prices", () => {
    const prices = (s: "top" | "body" | "bottom") =>
      Object.fromEntries(ITEMS[s].map((i) => [i.id, i.price]));
    expect(prices("top")).toEqual({
      none: 0, beanie: 0, cap: 100, flower: 150, bow: 150,
      phones: 250, party: 300, crown: 600, halo: 900,
    });
    expect(prices("body")).toEqual({
      none: 0, tee: 0, hoodie: 150, stripes: 200, scarf: 250, raincoat: 350, suit: 600,
    });
    expect(prices("bottom")).toEqual({
      none: 0, shorts: 0, jeans: 150, joggers: 200, sneakers: 300, tutu: 400,
    });
  });

  it("defaults to no outfit", () => {
    expect(NO_OUTFIT).toEqual({ top: "none", body: "none", bottom: "none" });
  });
});

describe("findItem", () => {
  it("finds by slot and id", () => {
    expect(findItem("top", "crown")?.price).toBe(600);
    expect(findItem("top", "tee")).toBeUndefined();
  });
});

describe("isOwned", () => {
  it("treats free items as owned", () => {
    expect(isOwned([], "top", "beanie")).toBe(true);
  });
  it("needs a listing for paid items", () => {
    expect(isOwned([], "top", "crown")).toBe(false);
    expect(isOwned(["crown"], "top", "crown")).toBe(true);
  });
});

describe("canBuy", () => {
  it("needs enough coins", () => {
    expect(canBuy(600, [], "top", "crown")).toBe(true);
    expect(canBuy(599, [], "top", "crown")).toBe(false);
  });
  it("refuses an owned item (double-tap buys once)", () => {
    expect(canBuy(9999, ["crown"], "top", "crown")).toBe(false);
  });
  it("refuses an unknown item", () => {
    expect(canBuy(9999, [], "top", "nope")).toBe(false);
  });
});

describe("normalizeOutfit", () => {
  it("turns unowned or unknown ids into none", () => {
    expect(normalizeOutfit({ top: "crown", body: "tee", bottom: "ghost" }, [])).toEqual({
      top: "none", body: "tee", bottom: "none",
    });
  });
  it("keeps owned ids and fills missing slots with none", () => {
    expect(normalizeOutfit({ top: "crown" }, ["crown"])).toEqual({
      top: "crown", body: "none", bottom: "none",
    });
  });
});
