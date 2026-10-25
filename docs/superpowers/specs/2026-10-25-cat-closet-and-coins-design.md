# Dress the cat, earn coins

Design, 2026-10-25. Mockup: `design-previews/cat-closet.html` (open it in a browser; tap the gold coin and the closet items).

## Why

The reward today is a gallery of 13 cat photos unlocked by lifetime points. The user wants the reward to be *the* cat: the wilting mascot they already look at all day, dressed the way they choose. Points also pay unfairly: they are a share of your limit, so someone on a 5-minute limit earns almost nothing for the same restraint that pays a 60-minute user well. Points become coins, earned on minutes alone and spent on clothes.

## Goals

- One cat everywhere. The wilting cat gets a small body and wears a top (headwear), a body piece and a bottom. It wears them on home, in the closet, on the block screen and the nudge; the pill shows its head with the top.
- Coins: earned from minutes used only, spent on clothes, balance goes down when you buy.
- A golden coin on the home tile that opens a blurred, two-line explainer with a shared-element animation.
- Everything built in Wilt's existing UI ("Quiet" in `CLAUDE.md`): `TallSheet`, `Segmented`, `GLASS` tiles at radius 16, Kicker / `h3` / body order, `kit.tsx` buttons, `lib/haptics`, Hugeicons via `components/icons.tsx`, no em dashes in copy.

## Non-goals

- No colour variants per item, no fur colour picker, no selling items back, no gifting.
- No new reward types beyond clothes. The streak milestone (lower your limit) stays exactly as it is.
- No change to the rules for streaks, "days clean", the limit ladder or the wilt timing. (Saving empty days changes what streaks see; that is intended, below.)

## Anti-goals (a failure even if it works)

- Sheets that stutter. `CLAUDE.md` records a 51% janky-frame regression from an expensive sheet background; the closet must stay near today's ~2%.
- An overlay window that outlives Instagram/YouTube (payment apps refuse to run; see `CLAUDE.md`).
- The pill or block screen disagreeing with the app about what the cat looks like or wears.
- A user losing coins they had, or being able to spend coins they do not have.

## What the user decided

- Remove the cat photo unlocks and all 13 images entirely.
- The wilting cat is the one that gets customised, in three slots: top, body, bottom. In the pill only the top changes.
- When the feed is blocked, show the dressed cat instead of a photo.
- Size: smaller than the first mock; the cat sits with plenty of empty space (the mockup's current sizes).
- Accessories are unlocked by spending points, which are renamed **coins**.
- Coins are earned from usage only: **0 minutes pays 50, falling linearly to 0 at 45 minutes; 45 minutes or more pays 0.** (`coins = clamp(round(50 × (1 − minutes / 45)), 0, 50)`.) Reason given: lower limits earned nothing under the old rule.
- The home coin tile shows a **golden coin**. Tapping it plays a shared-element animation: the coin flies from the tile to the centre and grows, the whole screen blurs, and two lines appear under the coin explaining how it works. "That's it": no table, no buttons.

## The design

### Coins

- `coinsForDay(day) = clamp(round(50 × (1 − day.seconds / 60 / 45)), 0, 50)`. The day's limit no longer matters. Replaces `pointsForDay` in `components/progress.ts`.
- **Earned** = sum of `coinsForDay` over completed days (today excluded, as now: `bankedPoints` logic). **Today's pending** = today's live value, or 50 when nothing is recorded yet (as now).
- **Spent** = sum of prices of items bought. **Balance = earned − spent**, never negative (a purchase is refused if the price exceeds the balance at that moment).
- **Every day the service ran is saved, including empty ones** (user's decision). Today `ensureToday()` in `ReelAccessibilityService.kt` archives the finishing day only when seconds, count or shorts are above 0, so a zero-minute day, the best one, was never saved and earned nothing. The rollover now archives the finishing day whenever it has a stored date, zeros included, and those days pay by the normal rule (0 min = 50). Days the service never ran (switched off, phone dead) leave no row and pay nothing, so switching Wilt off cannot farm coins; no back-filling of gaps. Side effect, intended: an empty day no longer breaks a streak, and History shows it as a 0-minute day.
- **Block mode earns by the same rule** (user's decision). Block bounces reels and stops the timer, so a Block day records about 0 minutes and pays the full 50. No special case in `coinsForDay`.
- Past days are recounted under the new rule, so an existing user's balance changes once when this ships. *(Builder's call recorded: accepted.)*
- `MAX_POINTS_PER_DAY` becomes `MAX_COINS_PER_DAY = 50`, plus `COIN_ZERO_MINUTES = 45`.
- All user-facing "points"/"pts" copy becomes coins. The home tile reads the balance with `coins · +N` (N = pending, green) when N > 0, else `coins`.

### Items and prices *(my call; tune freely)*

| Slot | Free | Priced |
|---|---|---|
| Top | None, Beanie | Cap 100, Flower 150, Bow 150, Headphones 250, Party hat 300, Crown 600, Halo 900 |
| Body | None, Tee | Hoodie 150, Stripes 200, Scarf 250, Raincoat 350, Suit 600 |
| Bottom | None, Shorts | Jeans 150, Joggers 200, Sneakers 300, Tutu 400 |

A good day (~10 minutes) earns ~39, so a cheap item takes 3 to 4 days and the halo about a month. The catalogue lives in one pure module (`components/closet.ts`) with ids, names, slot and price, mirrored by id in Kotlin for drawing.

Default outfit for everyone, new and existing: None / None / None, so the cat looks as it does today (plus its new body) until the user dresses it. Free items are owned from the start. *(My call.)*

### State (through prefs and the bridge, per `CLAUDE.md`)

All in the `wilt_reels` SharedPreferences, read and written through `WiltnativeModule.kt` + `modules/wiltnative/index.ts`. JS keeps no copy.

- `outfitTop`, `outfitBody`, `outfitBottom`: item ids, default `"none"`. The service reads these to draw the cat.
- `ownedItems`: comma-separated ids of bought items (free items are implicitly owned).
- `coinsSpent`: int, sum of purchase prices.
- Bridge functions: `getCloset()` → `{ outfit, owned, coinsSpent }` (or fold into `getStatus`), `wearItem(slot, id)` (refuses an unowned id), `buyItem(slot, id, price, balance)` → boolean. The purchase check uses the balance JS computed from history (earned is derived in JS from `getHistory()`), passed in; native re-checks `price <= balance` and that the id is not already owned, then appends to `ownedItems`, adds to `coinsSpent` and wears it, in one `commit()`.
- Safe defaults for old installs: missing keys mean nothing owned, nothing spent, outfit none.
- Drop: `unlockedCats`, `lastPointsCelebrated` (stop reading; leaving the stale keys in prefs is harmless) and `setUnlockedCats` / `markPointsCelebrated`.

### The dressed cat (drawing)

One model, three renderers, which must agree:

- **Model:** keep `catdecay.ts` (`catHead(t)`) for the head and add the body, items and how items wilt in a pure, tested module (e.g. `components/catbody.ts`). The mockup's geometry is the starting point: head as today in its 256 box; body in a taller 256 × ~400 box below it (torso, arms, legs, tail), fur colour from the same decay ramp, mould spots on the body at later stages, ribs and a dashed bone tail once gone.
- **Items wilt with the cat:** fill colours drain toward grey as the fur sickens (`dull()` in the mockup: 0 until t 0.35, up to 60% by t 1, 80% once over), the top rotates with the ear droop (≈0.3 × droop, +12° once over), and body items get moth holes once over. *(My call; user did not object.)*
- **React Native:** `CatHead.tsx` stays for the head; a new `CatFigure` (react-native-svg) draws body + items + head. Used on home (inside the disc, replacing the head-only cat) and in the closet preview and item tiles.
- **Native (Kotlin):** the pill, nudge, block cover and widget currently use six pre-rendered head PNGs (`wilt_catface_1..6`, from `design-previews/rot-frame.html`). Items make a pre-rendered set combinatorial, so the service draws the cat itself:
  - **Pill and widget:** head only, plus the top. Either draw the top as a second ImageView layered over the existing face PNG (one PNG per top item × 6 stages = 54 small images, rendered from the mockup the same way `rot-frame.html` renders faces), or draw the top in a `Canvas`. Builder's choice; the PNG layering keeps the pill code nearly unchanged.
  - **Block cover and nudge:** the full dressed cat at the current stage. Draw it as layers (body PNG per stage, bottom item PNG per stage, body item PNG per stage, head PNG, top PNG) or with `Canvas`/`Path` from the shared geometry. Whichever is chosen, the pixels must match `CatFigure` closely enough that a user cannot tell them apart.
  - Pre-rendered PNGs, if used, come from one HTML renderer that imports the same drawing code as the mockup, so there is a single source of geometry.
- **Sizes** (mockup, 320-wide phone): home disc cat ~104 × 170 inside the 220 disc; closet preview ~86 × 140; block cover ~110 × 180; pill head 30dp as now.

### Screens

**Home.** The disc shows the whole dressed cat, keeping whatever animation the head has today (the eye dart). The stats tile that read `PTS` becomes the coin tile: gold coin + balance, label `coins · +N`. The tray's "Cats" button becomes **Closet** with a new Hugeicons shirt/clothes glyph added to `icons.tsx`.

**Coin explainer.** Tap the coin tile:
- The coin on the tile is measured; an absolutely positioned copy flies to the screen centre (≈36% down), scaling to ~128 px and spinning once, ~520 ms, slight overshoot (Reanimated, already installed). The tile's coin hides during the flight.
- The whole screen blurs and dims behind it (`expo-blur` `BlurView`, a new native dependency, so the dev client and release builds need a rebuild). Measure with `dumpsys gfxinfo` over several opens; if Android blur janks, fall back to the dark scrim (`SCRIM`, black at 62%) without blur.
- Two lines fade in under the coin: **"Scroll less, earn up to 50 a day."** (bone, semibold) and **"Spend them on clothes in the Closet."** (ash).
- Tap anywhere: everything reverses and the coin lands back in the tile. Back button does the same.
- Haptics: `tap` on open (the tile is a button), `settle` when the coin lands back.
- Not a sheet, so `Sheet`/`TallSheet` do not apply; it is a full-screen overlay inside the app (a `Modal` with transparent background, or an absolutely positioned layer above `PanelUIProvider`).

**Closet** (`TallSheet`, opened from the tray):
- Balance top right: gold coin + number.
- Preview: the dressed cat, fresh, with any item being tried on.
- Kicker `Your cat`, `h3` "Dress it up.", body "It wears this everywhere: home, the pill, and the block screen. It still wilts in it."
- `Segmented` Top / Body / Bottom (`tick` haptic).
- 3-column grid of `GLASS` tiles (radius 16), each showing a crop of the cat wearing just that item, name below. Worn item: green hairline + green dot. Locked item: dimmed drawing + price chip (gold coin + price).
- Tap an owned item: wear it now (`tap`). Tap a locked item: try it on in the preview and show a bar at the bottom: name, price, and `AccentButton` **Buy** if affordable, else a disabled `GlassButton` "N more to go". Buy spends, owns, wears (`confirm`). Tap the tried-on item again to stop trying it on.
- Leaving the sheet drops any try-on; only bought, worn items persist.

**Block cover and nudge.** Replace the random cat photo with the dressed cat at its current stage. Cover copy keeps the existing lines (`coverLines`), except "Here's a cat." lines now read naturally with the user's own cat; *(my call)* replace "Feed's closed.\nHere's a cat." with "Feed's closed.\nYour cat took the hit." and "No scrolling today.\nCat instead." with "No scrolling today.\nSay hi to your cat.".

**History.** Wherever points are shown or explained, say coins.

**Milestones.** `MilestoneModal` loses its `"cats"` kind; only `"streak"` remains. No "you can afford X" celebration in this version.

### Removal

- `components/cats.ts`, `components/CatGallery.tsx`, `assets/cats/*` (13 files + README), `plugin/native/res/drawable/wilt_cat_1..13.png`, the `CATS` import in `Onboarding.tsx`, `CAT_THRESHOLDS`, `pendingCatUnlocks`, `unlockedCount`, `randomUnlockedCatRes` / `catDrawableRes` / `unlockedCatCount` in the service, the `unlockedCats` / `lastPointsCelebrated` bridge plumbing, and their tests.
- Check `plugin/withReelCounter.js` and any store/docs copy that mentions unlocking cats (e.g. `docs/play-listing.md`, `docs/privacy-policy.md`) and reword.

## Constraints

- Expo SDK as installed (package.json says `expo ^54`; `AGENTS.md` points at the v56 docs, so read those before adding `expo-blur`).
- No new `useEffect`; `useMountEffect` for mount-only work.
- Business rules (coin math, balance, price checks, the item catalogue, the body model) in pure `components/*.ts` with Jest tests. `npx jest` and `npx tsc --noEmit -p .` pass before done.
- Kotlin compile-checked per `CLAUDE.md`; tested on `emulator-5554`, not the user's phone, unless asked.
- `android/` is generated: native edits go in `plugin/native/` and `modules/wiltnative/`.

## Left to the builder

- Canvas drawing vs layered PNGs for the native cat (must match RN visually).
- Exact item art, beyond the mockup's.
- Whether closet state rides on `getStatus()` or its own bridge call.
- Animation curves and durations within the feel described.
