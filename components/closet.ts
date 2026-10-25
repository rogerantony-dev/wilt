/**
 * The closet catalogue: what the cat can wear, and what it costs in coins.
 *
 * Pure data and rules. Item ids are also Android drawable resource names and
 * prefs values, so they stay lowercase letters only. Price 0 items are owned
 * by everyone; anything else needs its id in the owned list.
 */

export type Slot = "top" | "body" | "bottom";
export type Outfit = Record<Slot, string>;
export type Item = { id: string; name: string; slot: Slot; price: number };

export const SLOTS: Slot[] = ["top", "body", "bottom"];

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
  ]),
  body: make("body", [
    ["none", "None", 0],
    ["tee", "Tee", 0],
    ["hoodie", "Hoodie", 150],
    ["stripes", "Stripes", 200],
    ["scarf", "Scarf", 250],
    ["raincoat", "Raincoat", 350],
    ["suit", "Suit", 600],
  ]),
  bottom: make("bottom", [
    ["none", "None", 0],
    ["shorts", "Shorts", 0],
    ["jeans", "Jeans", 150],
    ["joggers", "Joggers", 200],
    ["sneakers", "Sneakers", 300],
    ["tutu", "Tutu", 400],
  ]),
};

export const NO_OUTFIT: Outfit = { top: "none", body: "none", bottom: "none" };

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

/** Unknown or unowned ids become "none", so a stale pref never draws. */
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
