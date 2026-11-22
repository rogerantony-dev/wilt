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
  it("starts every garment slot with none at price 0, and fur with free black", () => {
    for (const slot of SLOTS) {
      expect(ITEMS[slot][0]).toMatchObject({ id: slot === "fur" ? "black" : "none", price: 0 });
    }
  });

  it("keeps ids unique across slots (the owned list holds bare ids)", () => {
    const paid = SLOTS.flatMap((slot) => ITEMS[slot].filter((i) => i.price > 0).map((i) => i.id));
    expect(new Set(paid).size).toBe(paid.length);
  });

  it("has unique, lowercase-letter ids per slot (they become Android resource names)", () => {
    for (const slot of SLOTS) {
      const ids = ITEMS[slot].map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z]+$/);
    }
  });

  it("uses the agreed prices", () => {
    const prices = (s: "top" | "body" | "bottom" | "fur") =>
      Object.fromEntries(ITEMS[s].map((i) => [i.id, i.price]));
    expect(prices("top")).toEqual({
      none: 0, beanie: 0, cap: 100, flower: 150, bow: 150,
      phones: 250, party: 300, crown: 600, halo: 900,
      spidermask: 500, batcowl: 500, hunterhair: 450,
    });
    expect(prices("body")).toEqual({
      none: 0, tee: 0, hoodie: 150, stripes: 200, scarf: 250, raincoat: 350, suit: 600,
      spidersuit: 700, batsuit: 750, hunterarmour: 700,
    });
    expect(prices("bottom")).toEqual({
      none: 0, shorts: 0, jeans: 150, joggers: 200, sneakers: 300, tutu: 400,
      spidertights: 350, batboots: 350, hunterboots: 350,
    });
    expect(prices("fur")).toEqual({
      black: 0, ginger: 250, grey: 250, brown: 250, cream: 350, white: 400,
    });
  });

  it("defaults to no outfit on a black cat", () => {
    expect(NO_OUTFIT).toEqual({ top: "none", body: "none", bottom: "none", fur: "black" });
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
      top: "none", body: "tee", bottom: "none", fur: "black",
    });
  });
  it("keeps owned ids and fills missing slots with none", () => {
    expect(normalizeOutfit({ top: "crown" }, ["crown"])).toEqual({
      top: "crown", body: "none", bottom: "none", fur: "black",
    });
  });
  it("keeps an owned fur and drops an unowned or unknown one to black", () => {
    expect(normalizeOutfit({ fur: "ginger" }, ["ginger"]).fur).toBe("ginger");
    expect(normalizeOutfit({ fur: "white" }, []).fur).toBe("black");
    expect(normalizeOutfit({ fur: "none" }, []).fur).toBe("black");
  });
});
