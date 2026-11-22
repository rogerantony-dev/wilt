/**
 * The closet catalogue: what the cat can wear, and what it costs in coins.
 *
 * Pure data and rules. Item ids are also Android drawable resource names and
 * prefs values, so they stay lowercase letters only, and unique across slots
 * (the owned list holds bare ids). Price 0 items are owned by everyone;
 * anything else needs its id in the owned list.
 *
 * "fur" is the cat's colour rather than a garment: it has no "none" (black is
 * the free default) and it recolours the cat itself (catdecay FURS).
 */

export type Slot = "top" | "body" | "bottom" | "fur";
export type Outfit = Record<Slot, string>;
export type Item = { id: string; name: string; slot: Slot; price: number };

export const SLOTS: Slot[] = ["top", "body", "bottom", "fur"];

const make = (slot: Slot, rows: [string, string, number][]): Item[] =>
  rows.map(([id, name, price]) => ({ id, name, slot, price }));

export const ITEMS: Record<Slot, Item[]> = {
  top: make("top", [
    ["none", "None", 0],
    ["beanie", "Beanie", 0],
    ["cap", "Cap", 100],
    ["flower", "Flower", 150],
    ["bow", "Bow", 150],
    ["phones", "Headphones", 250],
    ["party", "Party hat", 300],
    ["crown", "Crown", 600],
    ["halo", "Halo", 900],
    ["spidermask", "Spider mask", 500],
    ["batcowl", "Bat cowl", 500],
    ["hunterhair", "Hunter hair", 450],
  ]),
  body: make("body", [
    ["none", "None", 0],
    ["tee", "Tee", 0],
    ["hoodie", "Hoodie", 150],
    ["stripes", "Stripes", 200],
    ["scarf", "Scarf", 250],
    ["raincoat", "Raincoat", 350],
    ["suit", "Suit", 600],
    ["spidersuit", "Spider suit", 700],
    ["batsuit", "Bat suit", 750],
    ["hunterarmour", "Hunter armour", 700],
  ]),
  bottom: make("bottom", [
    ["none", "None", 0],
    ["shorts", "Shorts", 0],
    ["jeans", "Jeans", 150],
    ["joggers", "Joggers", 200],
    ["sneakers", "Sneakers", 300],
    ["tutu", "Tutu", 400],
    ["spidertights", "Spider tights", 350],
    ["batboots", "Bat boots", 350],
    ["hunterboots", "Hunter boots", 350],
  ]),
  fur: make("fur", [
    ["black", "Black", 0],
    ["ginger", "Ginger", 250],
    ["grey", "Grey", 250],
    ["brown", "Brown", 250],
    ["cream", "Cream", 350],
    ["white", "White", 400],
  ]),
};

export const NO_OUTFIT: Outfit = { top: "none", body: "none", bottom: "none", fur: "black" };

/** The item for an id in a slot, or undefined for an unknown id. */
export function findItem(slot: Slot, id: string): Item | undefined {
  return ITEMS[slot].find((i) => i.id === id);
}

/** Free items belong to everyone; paid ones need to be listed. */
export function isOwned(owned: string[], slot: Slot, id: string): boolean {
  const item = findItem(slot, id);
  if (!item) return false;
  return item.price === 0 || owned.includes(id);
}

/** True when the item exists, is not owned yet, and the balance covers it. */
export function canBuy(
  balance: number,
  owned: string[],
  slot: Slot,
  id: string,
): boolean {
  const item = findItem(slot, id);
  if (!item) return false;
  return !isOwned(owned, slot, id) && item.price <= balance;
}

/** Unknown or unowned ids fall back to the bare default ("none", black fur), so a stale pref never draws. */
export function normalizeOutfit(
  raw: Partial<Record<Slot, string>>,
  owned: string[],
): Outfit {
  const out: Outfit = { ...NO_OUTFIT };
  for (const slot of SLOTS) {
    const id = raw[slot];
    if (id && isOwned(owned, slot, id)) out[slot] = id;
  }
  return out;
}
