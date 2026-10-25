# Cat Closet and Coins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 13 unlockable cat photos with one dressable wilting cat (top, body, bottom), and replace limit-based points with coins earned on minutes alone and spent on clothes.

**Architecture:** Coin maths and the item catalogue are pure TS modules with Jest tests. Closet state (outfit, owned items, coins spent) lives in the `wilt_reels` prefs behind a Kotlin `Closet` object shared by the bridge and the accessibility service, like `Surfaces.kt`. The cat's body and items are drawn from one canonical browser script (`design-previews/cat-figure.js`), which renders PNG layers for the native pill/widget/cover/nudge; the React Native side is a tested port of it (the same relationship `catdecay.ts` has with `rot-cat.js` today).

**Tech Stack:** Expo (package.json `expo ^54`), React Native, react-native-svg, Reanimated 4, PanelUI on Uniwind, `expo-blur` (new), Kotlin accessibility service, Jest, headless Chrome for PNG rendering.

**Spec:** `docs/superpowers/specs/2026-10-25-cat-closet-and-coins-design.md`. Mockup: `design-previews/cat-closet.html`.

## Global Constraints

- Coins per completed day: `clamp(round(50 × (1 − minutes / 45)), 0, 50)`, minutes = `seconds / 60`; the day's limit plays no part. `MAX_COINS_PER_DAY = 50`, `COIN_ZERO_MINUTES = 45`.
- Today is never banked; today's pending = today's live coins, or 50 when today has no record.
- Balance = banked − `coinsSpent`, never below 0.
- Prices: Top: none 0, beanie 0, cap 100, flower 150, bow 150, phones 250, party 300, crown 600, halo 900. Body: none 0, tee 0, hoodie 150, stripes 200, scarf 250, raincoat 350, suit 600. Bottom: none 0, shorts 0, jeans 150, joggers 200, sneakers 300, tutu 400. Price 0 items are owned by everyone.
- Default outfit: `none` / `none` / `none`. Unknown ids read as `none` everywhere.
- Prefs keys (in `wilt_reels`): `outfitTop`, `outfitBody`, `outfitBottom` (string ids), `ownedItems` (comma-separated ids), `coinsSpent` (int).
- Layer order, everywhere the cat is drawn: base (tail, legs, feet, torso, mould spots, ribs, arms, paws) → bottom item → body item (hood, torso piece, sleeves, scarf) → head → top item.
- Sizes (in dp on a 360-wide phone): home cat ~104 × 170 in the disc; closet preview ~86 × 140; block cover ~110 × 180; pill head 30.
- Copy, exact: coin tile label `coins · +N` (N > 0) else `coins`; explainer lines "Scroll less, earn up to 50 a day." and "Spend them on clothes in the Closet."; closet Kicker `Your cat`, h3 "Dress it up.", body "It wears this everywhere: home, the pill, and the block screen. It still wilts in it."; buy bar "N more to go"; tray label `Closet`. No em dashes in anything a user reads.
- UI: `TallSheet`, `Segmented`, `GLASS` tiles radius 16, `AccentButton` / `GlassButton` from `kit.tsx`, `lib/haptics` only, Hugeicons only via `components/icons.tsx`, no new `useEffect` (`useMountEffect` for mount-only work).
- `android/` is generated; native edits go in `plugin/native/` and `modules/wiltnative/`. Compile-check Kotlin per `CLAUDE.md`. Test on `emulator-5554`, never drive the user's phone.
- Before calling anything done: `npx jest` and `npx tsc --noEmit -p .` pass.

## Review Focus

- **Double-tap Buy:** two buys of the same item must charge once. Native `Closet.buy` refuses an already-owned id (Task 3, manual step) and `canBuy` is false for an owned item (Task 2 test).
- **A stale or unknown outfit id** (a renamed item, an old build, hand-edited prefs) must draw as `none`, never crash or show a blank layer: `normalizeOutfit` test (Task 2), `CatFigureLayers` hides a layer whose drawable id is 0 (Task 8).
- **Balance after a big recount:** balance is clamped at 0 even if `coinsSpent` exceeds banked coins: `coinBalance` test (Task 1).
- **Back button with the coin explainer open** closes the explainer, not the app (Task 7, manual step).
- **Wearing an item while Instagram is open:** the pill and cover read prefs on every render, so the next render shows it; no restart needed (Task 8, manual step).

---

### Task 1: Coins maths

**Files:**
- Modify: `components/progress.ts`
- Test: `components/progress.test.ts`

**Interfaces:**
- Produces: `MAX_COINS_PER_DAY = 50`, `COIN_ZERO_MINUTES = 45`, `coinsForDay(day: WiltDay): number`, `bankedCoins(history: WiltDay[], today: string): number`, `pendingCoins(history: WiltDay[], today: string): number`, `coinBalance(banked: number, spent: number): number`. `Progress` gains `coins` (banked) and `pendingCoins`; loses `points`, `pendingPoints`, `unlockedCount`, `pendingCatUnlocks`. `ProgressSeen` is `{ lastCelebratedStreakMilestone: number }`. `computeProgress(history, currentLimit, today, seen)` (the `catThresholds` parameter is removed).
- Removes: `pointsForDay`, `lifetimePoints`, `bankedPoints`, `pendingPoints`, `MAX_POINTS_PER_DAY`.

- [ ] **Step 1: Replace the points tests with coin tests** in `progress.test.ts` (delete the `pointsForDay`, `lifetimePoints`, `bankedPoints / pendingPoints` and cat-threshold `computeProgress` cases):

```ts
describe("coinsForDay", () => {
  it("pays 50 for a day with no short-form time", () => expect(coinsForDay(day(0))).toBe(50));
  it("falls in a straight line to 0 at 45 minutes", () => {
    expect(coinsForDay(day(9 * 60))).toBe(40);
    expect(coinsForDay(day(22 * 60))).toBe(26);
    expect(coinsForDay(day(44 * 60))).toBe(1);
    expect(coinsForDay(day(45 * 60))).toBe(0);
    expect(coinsForDay(day(90 * 60))).toBe(0);
  });
  it("ignores the day's limit", () =>
    expect(coinsForDay({ ...day(10 * 60), limitMinutes: 5 })).toBe(coinsForDay({ ...day(10 * 60), limitMinutes: 60 })));
});
describe("bankedCoins / pendingCoins / coinBalance", () => {
  it("banks only days before today", () =>
    expect(bankedCoins([d("2026-10-23", 0), d("2026-10-24", 45 * 60), d("2026-10-25", 0)], "2026-10-25")).toBe(50));
  it("pends 50 when today has no record, else today's live value", () => {
    expect(pendingCoins([], "2026-10-25")).toBe(50);
    expect(pendingCoins([d("2026-10-25", 9 * 60)], "2026-10-25")).toBe(40);
  });
  it("never goes below zero", () => expect(coinBalance(100, 250)).toBe(0));
  it("subtracts what was spent", () => expect(coinBalance(340, 100)).toBe(240));
});
```

(`day(s)` / `d(date, s)` are small local helpers building a `WiltDay` with `count: 0, shorts: 0`.) Keep the streak and level-down `computeProgress` tests, calling the new 4-argument signature.

- [ ] **Step 2: Run** `npx jest components/progress.test.ts`. Expected: FAIL, `coinsForDay` is not exported.
- [ ] **Step 3: Implement** the Produces list in `progress.ts`. `computeProgress` returns `coins: bankedCoins(history, today)` and `pendingCoins`; drop the cat unlock fields. Update the module's doc comments from points to coins.
- [ ] **Step 4: Run** `npx jest components/progress.test.ts`. Expected: PASS. (`tsc` fails in `App.tsx` until Task 7; that is expected.)
- [ ] **Step 5: Commit** `git add components/progress.ts components/progress.test.ts && git commit -m "Coins: earn on minutes used, 50 at zero down to 0 at 45"`

### Task 2: Closet catalogue

**Files:**
- Create: `components/closet.ts`
- Test: `components/closet.test.ts`

**Interfaces:**
- Produces:
  - `type Slot = "top" | "body" | "bottom"`; `type Outfit = Record<Slot, string>`; `type Item = { id: string; name: string; slot: Slot; price: number }`.
  - `ITEMS: Record<Slot, Item[]>` in the order of the Global Constraints price list, display names: None, Beanie, Cap, Flower, Bow, Headphones (`phones`), Party hat (`party`), Crown, Halo; None, Tee, Hoodie, Stripes, Scarf, Raincoat, Suit; None, Shorts, Jeans, Joggers, Sneakers, Tutu.
  - `SLOTS: Slot[] = ["top", "body", "bottom"]`, `NO_OUTFIT: Outfit` (all `"none"`).
  - `findItem(slot: Slot, id: string): Item | undefined`
  - `isOwned(owned: string[], slot: Slot, id: string): boolean` (true for price 0 or listed)
  - `canBuy(balance: number, owned: string[], slot: Slot, id: string): boolean` (exists, not owned, price ≤ balance)
  - `normalizeOutfit(raw: Partial<Record<Slot, string>>, owned: string[]): Outfit` (unknown or unowned ids become `"none"`)

- [ ] **Step 1: Write the failing tests:** every slot starts with `none` at price 0; ids are unique within a slot and match `/^[a-z]+$/` (they become Android resource names); `isOwned([], "top", "beanie")` true, `isOwned([], "top", "crown")` false, `isOwned(["crown"], "top", "crown")` true; `canBuy(600, [], "top", "crown")` true, `canBuy(599, [], "top", "crown")` false, `canBuy(9999, ["crown"], "top", "crown")` false, `canBuy(9999, [], "top", "nope")` false; `normalizeOutfit({ top: "crown", body: "tee", bottom: "ghost" }, [])` equals `{ top: "none", body: "tee", bottom: "none" }`.
- [ ] **Step 2: Run** `npx jest components/closet.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `components/closet.ts` per the Produces list.
- [ ] **Step 4: Run** `npx jest components/closet.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `git add components/closet.ts components/closet.test.ts && git commit -m "Closet catalogue: items, prices, ownership"`

### Task 3: Closet state in prefs and the bridge; save every day

**Files:**
- Create: `modules/wiltnative/android/src/main/java/expo/modules/wiltnative/Closet.kt`
- Modify: `modules/wiltnative/android/src/main/java/expo/modules/wiltnative/WiltnativeModule.kt` (status map ~L31-55, `defaultStatus`, `markPointsCelebrated` / `setUnlockedCats` ~L185-200)
- Modify: `modules/wiltnative/index.ts`
- Modify: `plugin/native/ReelAccessibilityService.kt` (`ensureToday()` ~L1347-1362)

**Interfaces:**
- Consumes: Task 2's ids and prices (mirrored by value in Kotlin).
- Produces (Kotlin, `object Closet` in package `expo.modules.wiltnative`): `SLOTS = listOf("top", "body", "bottom")`; `PRICES: Map<String, Map<String, Int>>` (slot → id → price, the Global Constraints list); `outfit(prefs): Map<String, String>` (normalised: unknown or unowned → `"none"`); `owned(prefs): Set<String>`; `coinsSpent(prefs): Int`; `wear(prefs, slot, id): Boolean` (false if unknown or unowned); `buy(prefs, slot, id, balance: Int): Boolean` (false if unknown, owned, or price > balance; else appends to `ownedItems`, adds price to `coinsSpent`, sets the outfit slot, in one `commit()`).
- Produces (JS bridge): `WiltStatus` gains `outfit: Record<"top" | "body" | "bottom", string>`, `ownedItems: string[]`, `coinsSpent: number`, and loses `lastPointsCelebrated`. New wrappers `wearItem(slot, id): boolean`, `buyItem(slot, id, balance): boolean` (false when the native module is missing). `markPointsCelebrated` and `setUnlockedCats` are removed from `index.ts` and the module.

- [ ] **Step 1: Write `Closet.kt`** per the Produces list, with a header comment in the style of `Surfaces.kt` (shared by the bridge and the service; JS owns the balance maths, native re-checks it).
- [ ] **Step 2: Wire the bridge:** add `outfit`, `ownedItems`, `coinsSpent` to `getStatus` and `defaultStatus` (defaults: all `none`, empty list, 0); add `Function("wearItem") { slot: String, id: String -> ... }` and `Function("buyItem") { slot: String, id: String, balance: Int -> ... }` delegating to `Closet`; delete `markPointsCelebrated`, `setUnlockedCats` and `lastPointsCelebrated`.
- [ ] **Step 3: Update `index.ts`** types and wrappers to match.
- [ ] **Step 4: Save every day the service ran:** in `ensureToday()`, archive the finishing day whenever `storedDate != null`, removing the `seconds > 0 || count > 0 || shorts > 0` condition; update the comment ("Every day the service ran is stored, empty ones too: a day with no scrolling is the best day and pays 50 coins.").
- [ ] **Step 5: Compile-check Kotlin.** Copy `plugin/native/*.kt` into `android/app/src/main/java/com/rogerantony/wilt/`, then from `android/`: `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:compileDebugKotlin`. Expected: BUILD SUCCESSFUL.
- [ ] **Step 6: Commit** `git add modules/wiltnative plugin/native/ReelAccessibilityService.kt && git commit -m "Closet state in prefs, bridge to wear and buy; save empty days"`

### Task 4: One drawing source for the dressed cat, and its PNG layers

**Files:**
- Create: `design-previews/cat-figure.js`, `design-previews/cat-layer.html`, `scripts/render-cat-layers.sh`
- Modify: `design-previews/cat-closet.html` (load `cat-figure.js` instead of its inline drawing code)
- Create (generated): `plugin/native/res/drawable/wilt_fig_*.png`, `plugin/native/res/drawable/wilt_pill_*.png`

**Interfaces:**
- Consumes: `cat(t, opts)` from `design-previews/rot-cat.js`; `STAGE_T` values from `components/catdecay.ts` (`stageT(1..6)`).
- Produces (browser globals in `cat-figure.js`): `figureLayer(layer, t, opts)` returning an SVG string in the shared box, where `layer` is `"base" | "head" | "top" | "body" | "bottom"` and `opts = { item?: string, box: "figure" | "pill", id: string }`; `fullFigure(t, outfit, box)` composing the five layers in the Global Constraints order. Boxes: figure `viewBox="0 -40 256 440"`, pill `viewBox="-8 -40 272 272"` (head + top only).
- Produces (drawables; `s` = stage 1..6, `{id}` = item id, `none` has no file):
  - `wilt_fig_base_{s}`, `wilt_fig_head_{s}`, `wilt_fig_top_{id}_{s}`, `wilt_fig_body_{id}_{s}`, `wilt_fig_bottom_{id}_{s}`: 360 × 619 px, transparent, figure box.
  - `wilt_pill_head_{s}`, `wilt_pill_top_{id}_{s}`: 192 × 192 px, transparent, pill box.

- [ ] **Step 1: Extract** the body and item drawing from `cat-closet.html` into `cat-figure.js` (`furOf`, `dull`, `topSvg`, body pieces, `bottomSvg`, and the base), reordered into the five layers above. The scarf moves into the body layer (under the head). Item wilting is unchanged from the mockup (`dull`, top tilt `0.3 × droop`, `+12°` once over, holes once over).
- [ ] **Step 2: Point the mockup at it** and check the page still renders everything it did (open it, toggle items, drag the slider).
- [ ] **Step 3: Write `cat-layer.html`:** reads `?layer=&item=&stage=&box=` and renders that one layer at the stage's t on a transparent page, like `rot-frame.html`.
- [ ] **Step 4: Write `scripts/render-cat-layers.sh`:** loops over every layer, item and stage and calls headless Chrome (`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --default-background-color=00000000 --window-size=W,H --screenshot=<out> "file://.../cat-layer.html?..."`) to write the drawables above. It is idempotent and prints how many files it wrote.
- [ ] **Step 5: Run it.** Expected: 6 base + 6 head + 48 top + 36 body + 30 bottom + 6 pill head + 48 pill top = 180 files. Spot-check three by opening them (one crown at stage 1, the hoodie at stage 6, the pill head at stage 4): transparent background, nothing clipped.
- [ ] **Step 6: Commit** `git add design-previews/cat-figure.js design-previews/cat-layer.html design-previews/cat-closet.html scripts/render-cat-layers.sh plugin/native/res/drawable/wilt_fig_* plugin/native/res/drawable/wilt_pill_* && git commit -m "One drawing of the dressed cat, rendered to layers for the service"`

### Task 5: The dressed cat in React Native

**Files:**
- Create: `components/catfigure.ts`, `components/catfigure.test.ts`, `components/CatFigure.tsx`
- Modify: `components/DiscHero.tsx` (draw `CatFigure` instead of the head-only `CatHead`; `CAT` box becomes the figure box at the home size)

**Interfaces:**
- Consumes: `catHead`/`CatHead` (head stays as is), `Outfit` and `ITEMS` from Task 2.
- Produces: `catfigure.ts`: `FIGURE_BOX = { x: 0, y: -40, w: 256, h: 440 }`, `furColor(t: number): string`, `dullColor(hex: string, t: number): string`, `topTilt(t: number): number`, and `itemShapes(slot: Slot, id: string, t: number): Shape[]` / `baseShapes(t: number): Shape[]` where `type Shape = { kind: "path" | "circle" | "ellipse" | "rect"; props: Record<string, string | number> }` (props named as react-native-svg props). `CatFigure.tsx`: `<CatFigure t outfit eyes? clipId width height headOnly? />` drawing the layers in order, with `headOnly` drawing head + top in the pill box.

- [ ] **Step 1: Write the failing tests:** `furColor(0)` equals catdecay's fresh fur `#33322e`; `dullColor("#4A6FA5", 0)` is unchanged; `dullColor(x, 1.2)` is the 80% grey mix; `topTilt(0) === 0` and `topTilt(1) > 12`; `itemShapes(slot, "none", t)` is `[]` for every slot; every non-none id in `ITEMS` returns at least one shape (so the port can't silently miss an item).
- [ ] **Step 2: Run** `npx jest components/catfigure.test.ts`. Expected: FAIL.
- [ ] **Step 3: Port** the geometry from `design-previews/cat-figure.js` into `catfigure.ts` as shape data (header comment: "A port of design-previews/cat-figure.js, which renders the service's PNG layers; change the two together."), and write `CatFigure.tsx` mapping shapes to `react-native-svg` elements around `CatHead`.
- [ ] **Step 4: Run** `npx jest components/catfigure.test.ts`. Expected: PASS.
- [ ] **Step 5: Use it on home:** `DiscHero` takes an `outfit: Outfit` prop and renders `CatFigure` at ~104 × 170 inside the disc, keeping the animated eyes (`eyes` wrapper) and the asleep overlay (its shapes are in head coordinates, which `CatFigure` keeps at 0..256).
- [ ] **Step 6: Commit** `git add components/catfigure.ts components/catfigure.test.ts components/CatFigure.tsx components/DiscHero.tsx && git commit -m "Draw the dressed cat in the app"`

### Task 6: The Closet sheet

**Files:**
- Create: `components/ClosetSheet.tsx`, `components/GoldCoin.tsx`
- Modify: `components/icons.tsx` (add a Hugeicons clothing glyph, e.g. `TShirtIcon`, exported as `ShirtIcon`)

**Interfaces:**
- Consumes: Task 2 (`ITEMS`, `isOwned`, `canBuy`, `findItem`), Task 3 (`wearItem`, `buyItem`), Task 5 (`CatFigure`).
- Produces: `<GoldCoin size={number} />` (react-native-svg: gold gradient face `#FFE38E → #F2B83A → #C98A1E`, rim `#E9A82A → #9A6512`, inner ring and a cat face stamped at 55% opacity, a white shine; geometry from `goldCoin` in the mockup). `<ClosetSheet visible onClose outfit owned balance onChanged />` where `onChanged()` asks the parent to refresh status.

- [ ] **Step 1: Build `GoldCoin`.**
- [ ] **Step 2: Build `ClosetSheet`** on `TallSheet`: balance (GoldCoin 17 + number, tabular) top right; preview `CatFigure` (fresh, `t = 0.02`) at ~86 × 140 showing the outfit with any try-on applied; `Kicker` `Your cat`, `h3` "Dress it up." (`letterSpacing -0.5`), body copy from Global Constraints; `Segmented` Top / Body / Bottom; a 3-column grid of `GLASS` tiles (radius 16) each drawing `CatFigure` cropped to its slot (top: head only; body: the torso; bottom: the legs), name below; worn tile has a green hairline and dot; a locked tile is dimmed with a price chip (`GoldCoin` 12 + price). Tap owned → `wearItem` then `onChanged()` (`tap`). Tap locked → try it on (local state; tap again clears). With a try-on, a bar under the grid shows name and price with `AccentButton` "Buy" when `canBuy`, else a disabled `GlassButton` "N more to go". Buy → `buyItem(slot, id, balance)`; on true `onChanged()` (the AccentButton's `confirm`); clear the try-on. Closing the sheet drops the try-on.
- [ ] **Step 3: Type-check** `npx tsc --noEmit -p .` for the new files (App still fails until Task 7).
- [ ] **Step 4: Commit** `git add components/ClosetSheet.tsx components/GoldCoin.tsx components/icons.tsx && git commit -m "Closet sheet: dress the cat, try on, buy with coins"`

### Task 7: Home: coin tile, coin explainer, Closet; remove the cat gallery

**Files:**
- Create: `components/CoinExplainer.tsx`
- Modify: `App.tsx` (progress memo ~L198-213 incl. the `setUnlockedCats` effect, milestone mount effect ~L215-232, `Dashboard` props and tiles ~L437-560, sheets ~L374-397), `components/MilestoneModal.tsx`, `package.json` (via `npx expo install expo-blur`)
- Delete: `components/CatGallery.tsx`, `components/cats.ts`, `assets/cats/` (13 images + README), the `CATS` import in `components/Onboarding.tsx`

**Interfaces:**
- Consumes: Task 1 (`computeProgress` 4-arg, `coins`, `pendingCoins`, `coinBalance`), Task 3 (`status.outfit`, `status.ownedItems`, `status.coinsSpent`), Task 5 (`DiscHero outfit`), Task 6 (`ClosetSheet`, `GoldCoin`).
- Produces: `<CoinExplainer visible from={{ x, y, size }} onClose />`, where `from` is the tile coin's window position measured with `measureInWindow`.

- [ ] **Step 1: Install blur:** read the `expo-blur` page in the Expo docs for the installed SDK, then `npx expo install expo-blur`.
- [ ] **Step 2: Build `CoinExplainer`:** a transparent `Modal` (`statusBarTranslucent`) holding a full-screen `BlurView` (intensity ~40, dark tint, Android blur method per the docs) with a 42% ink dim over it, fading in over ~280 ms; a `GoldCoin` at 128 that animates with Reanimated from `from` to the horizontal centre at 36% of the screen height, scale `from.size/128 → 1`, rotating 0 → 360°, ~520 ms, slight overshoot; the two lines (Global Constraints copy, bone semibold 17 then ash 14) fade and rise in after ~260 ms. Any tap or `onRequestClose` (Back) reverses it (~380 ms) and calls `onClose` when the coin has landed (`settle`).
- [ ] **Step 3: Rewire `App.tsx`:** compute `balance = coinBalance(progress.coins, status?.coinsSpent ?? 0)`; the second `StatTile` becomes a coin tile showing `GoldCoin` 22 + balance and label `coins · +N` / `coins`, which measures its coin and opens `CoinExplainer` (the tile's coin hides while the explainer is open); the tray "Cats" becomes `Closet` with `ShirtIcon`, opening `ClosetSheet` with `outfit`, `ownedItems`, `balance`, `onChanged={refresh}`; pass `normalizeOutfit(status.outfit, status.ownedItems)` to every `DiscHero`; delete the `setUnlockedCats` `useEffect`, `CatGallery`, `catsOpen`, and the `"cats"` milestone branch.
- [ ] **Step 4: `MilestoneModal`:** `kind` becomes `"streak" | null`; remove `unlockedCats` and the cat copy.
- [ ] **Step 5: Delete** the files listed above and fix any imports.
- [ ] **Step 6: Run** `npx tsc --noEmit -p .` and `npx jest`. Expected: both clean.
- [ ] **Step 7: Manual check (dev client on `emulator-5554`):** coin flies out and back; Back closes the explainer and leaves the app on home; the closet buys an affordable item once (double-tap Buy charges once) and refuses an unaffordable one.
- [ ] **Step 8: Measure the blur:** `adb -s emulator-5554 shell dumpsys gfxinfo com.rogerantony.wilt reset`, open and close the explainer 5 times, `dumpsys gfxinfo com.rogerantony.wilt` → janky frames. If above ~5%, drop the `BlurView` and keep the dim (the spec's fallback) and note the numbers in the commit message.
- [ ] **Step 9: Commit** `git add -A App.tsx components package.json package-lock.json assets/cats && git commit -m "Coins on home with the flying coin, Closet replaces the cat gallery"`

### Task 8: The dressed cat over Instagram and on the widget

**Files:**
- Create: `plugin/native/CatFigureLayers.kt`
- Modify: `plugin/native/ReelAccessibilityService.kt` (`buildPill` ~L1607, `render` ~L1564, `renderBlocked` ~L1576, `catFaceRes` ~L1605, `buildCatCover` ~L1707-1755, `showBlockCover` ~L1676-1690, nudge sheet ~L1830-1840, `coverLines` ~L157, `catDrawableRes` / `unlockedCatCount` / `randomUnlockedCatRes` ~L2282-2297), `plugin/native/WiltWidgetProvider.kt` (~L81-82), `plugin/native/CatDecay.kt`
- Delete: `plugin/native/res/drawable/wilt_cat_1..13.png`, `plugin/native/res/drawable/wilt_catface_1..6.png`

**Interfaces:**
- Consumes: Task 3 (`Closet.outfit(prefs)`), Task 4 drawables, `CatDecay.stage(used, limit)`.
- Produces: `CatFigureLayers.figure(context): FrameLayout` (five stacked `ImageView`s, `FIT_CENTER`, `MATCH_PARENT`) and `CatFigureLayers.bind(view, stage: Int, outfit: Map<String, String>)`; `CatFigureLayers.pillHead(context)` (two stacked ImageViews) and `bindPill(view, stage, top)`; `CatFigureLayers.res(context, name): Int` (0 when missing, and a 0 layer is hidden). For the widget, `CatFigureLayers.pillBitmap(context, stage, top): Bitmap` composited from the two pill drawables (RemoteViews takes one image).

- [ ] **Step 1: Write `CatFigureLayers.kt`.**
- [ ] **Step 2: Pill:** replace the single cat `ImageView` with `pillHead`; `render` binds it to the current stage and `Closet.outfit(prefs)["top"]`; `renderBlocked` binds stage 6.
- [ ] **Step 3: Block cover and nudge:** replace the photo `ImageView` with `figure` at 110 × 180 dp on the cover and ~86 × 140 dp on the nudge, bound to the current stage and outfit on each show. Cover lines: "Feed's closed.\nYour cat took the hit.", "No scrolling today.\nSay hi to your cat.", "Nope.\nGo do something else.", "This is better for you,\npromise.". Delete `catDrawableRes`, `unlockedCatCount`, `randomUnlockedCatRes`.
- [ ] **Step 4: Widget:** `setImageViewBitmap(R.id.widget_cat, CatFigureLayers.pillBitmap(...))` with the stage and top.
- [ ] **Step 5: `CatDecay.kt`:** remove `drawable` / `drawableForStage` (faces now come from the pill layers); keep `stage` and `textColor`.
- [ ] **Step 6: Delete** the old drawables listed above.
- [ ] **Step 7: Compile-check** as in Task 3 Step 5. Expected: BUILD SUCCESSFUL.
- [ ] **Step 8: Manual check on `emulator-5554`** (prebuild, debug build, Instagram installed or the QA stand-in): pill shows the head with the worn top; change the top in the Closet while Instagram is open and see the pill change on the next render; force the limit (set it to 5 and let it run, or Block mode) and see the dressed cat on the cover; widget shows head + top. No overlay window stays attached after leaving Instagram (`adb shell dumpsys window windows | grep -c TYPE_APPLICATION_OVERLAY` from the launcher is 0).
- [ ] **Step 9: Commit** `git add -A plugin/native && git commit -m "The service draws the dressed cat: pill, cover, nudge, widget"`

### Task 9: Copy and docs

**Files:**
- Modify: `docs/privacy-policy.md` (L19: "Your streak, points, and which cat images you have unlocked." → "Your streak, coins, and the clothes you have bought for the cat."), `docs/play-listing.md` (the `2-cats.png` screenshot line and any listing copy about unlocking cats → the Closet), `CLAUDE.md` (Where things live: `CatGallery` → `ClosetSheet`; add `closet.ts`, `catfigure.ts`, `cat-figure.js` and the layer script; note `catfigure.ts` and `cat-figure.js` change together).

- [ ] **Step 1: Edit** the three files. Search the repo for leftover user-facing "points" / "pts" / "unlock" copy (`grep -rn -iE "\\bpoints?\\b|\\bpts\\b|unlock" App.tsx components docs/*.md`) and reword what a user reads.
- [ ] **Step 2: Run** `npx jest` and `npx tsc --noEmit -p .`. Expected: clean.
- [ ] **Step 3: Commit** `git add CLAUDE.md docs/privacy-policy.md docs/play-listing.md && git commit -m "Docs: coins and the closet"`
