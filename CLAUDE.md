@AGENTS.md

# Wilt

Android app (Expo + React Native) that counts and blocks Instagram Reels, YouTube Shorts and the other surfaces picked in the Apps sheet. An accessibility service watches Instagram and YouTube. The React Native app is the dashboard and settings.

## Where things live

- `App.tsx`: the home screen (dashboard), and it owns every sheet.
- `components/`: screens and pieces (`Onboarding`, `HistoryScreen`, `CatGallery`, `AppsSheet`, `MilestoneModal`, `PaymentPause`). Pure logic sits next to them with Jest tests (`progress.ts`, `timeleft.ts`, `limitramp.ts`, `nudges.ts`, ...).
- `components/ui/`: vendored PanelUI primitives (Button, Tabs, Switch, Slider, BottomSheet, Text, Typography...). Add more with `npx panelui-cli@latest add <name> --yes`. Never run `init` again, because it rewrites `global.css`.
- `components/kit.tsx`: Wilt's button levels and surfaces. `components/console.tsx`: colour constants `C`, `Brand`, `Kicker`, `Segmented`. `components/icons.tsx`: the only icon set.
- `lib/haptics.ts`: the haptic vocabulary.
- `modules/wiltnative/`: the JS to native bridge (`index.ts`, `WiltnativeModule.kt`) and `Surfaces.kt`, which holds the per-surface guard toggles shared with the service.
- `plugin/native/`: the accessibility service (`ReelAccessibilityService.kt`), payment pause, widget and resources. **`android/` is generated and gitignored.** Edit `plugin/native/`. `plugin/withReelCounter.js` copies these files in at prebuild.
- State: one SharedPreferences file, `wilt_reels`. The service writes it, the bridge reads it, and JS never stores its own copy.

## Design system ("Quiet")

Dark first, minimal, a lot of empty space. There is one meaningful colour per screen and everything else is bone on ink.

**Colour** (tokens in `global.css`, mirrored as `C` in `console.tsx`):
- ink `#0D0D0C` background, bone `#F2F1EC` text, ash `#9A9A92` muted text, dim `#62625B` captions and quiet actions.
- green `#38C786` (`success`, `C.toxic`): healthy budget, Block mode, "on", the choice the app wants.
- waste `#E0913C`: time burned. over `#D2542F`: past the limit.
- The day's accent is `timeLeftState()` (green, then amber, then red) or green in Block. `App.tsx` provides it once as the `DayAccent` context (above `PanelUIProvider`, so it reaches the sheet portal). Home's `AmbientField` uses it, and every sheet, `Sheet` and `TallSheet` alike, draws `SheetGlow` (a tinted image, not SVG) from it. That glow behind `GLASS` surfaces is the glass look, so a new sheet gets it by using one of those two components. Never hard-code green where the accent belongs.

**Surfaces:** `GLASS` (bone at 6% with a 10% hairline) is the secondary surface everywhere: tiles, tray buttons, grouped rows, tab tracks. Sheets use `SHEET_BG #161615` with a `HAIRLINE` top edge over `SCRIM` (black at 62%). Solid panel is only for tracks (slider, the Guilt/Block island).

**Shape:** buttons, cards and grouped lists are 16 (`rounded-2xl`). Tab tracks are 16 with 12 cells. Sheets are 28 on the top corners. Pills are fully round.

**Type:** PanelUI `Typography` and `Text`. Sheet title `h4`, sheet headline `h3` with `letterSpacing -0.5`, body `body-sm muted leading-6`. `Kicker` is the label voice: uppercase, 12, semibold, tracking 1.1, dim or coloured. Numbers use `fontVariant: ["tabular-nums"]`. An inline `fontSize` above about 20 needs an explicit `lineHeight` or the glyphs clip.

**Icons:** Hugeicons only, through `components/icons.tsx` (stroke 1.8, default 18). Add new glyphs there. Don't import icon libraries in screens.

**Buttons** (`kit.tsx`), all 56 high with radius 16:
- `PrimaryButton`: bone on ink. At most one per screen (Continue, a commit).
- `AccentButton`: green with ink text. The choice the app wants (Keep blocking, Nice, Lower to X).
- `GlassButton`: the secondary action.
- `GhostButton`: dim text with no surface. The quiet way out (I'll give in, Leave it off for now).

**Sheets:** `Sheet` (short) and `TallSheet` (full height, scrolling body), both on PanelUI's BottomSheet. Don't hand-roll sheets or modals. Content order is Kicker, then `h3` headline, then body, then actions (`gap-5`, actions `gap-2.5`). The icon or cat goes above the Kicker.

**Rows with a switch:** the whole row is the tap target (`Pressable` with `accessibilityRole="switch"`), not only the switch.

**Apps sheet:** each app leads with an "Entire app" switch. There is no separate setting behind it: it is on exactly when every part below it is (`Surfaces.isAppGuarded`), and flipping it sets all the parts. A wholly guarded app counts all of its time in Guilt, and Block sends you to the home screen with a system toast rather than an overlay. "Other apps" holds any app the user adds (`Surfaces.addCustomApp`, key `app:<package>`): always guarded whole, same midnight rule for switching off, and "Remove" only appears once it is fully off. Added apps are handled from window-switch events alone (plus the pill ticker), never the content-event stream, and payment apps are checked first so they can never be blocked. Listing launcher apps needs the `<queries>` launcher intent the plugin adds to the manifest.

**Choices:** segmented `Tabs` via `Segmented` (console.tsx) or the home `ModeSwitch`. Sliders use `LimitSlider`.

**Native overlays match the app.** The nudge and limit sheets drawn over Instagram/YouTube are built from the `sheet*` helpers in `ReelAccessibilityService.kt`. They copy the tokens above by value, so change the two together. Overlay windows must never stay attached outside Instagram/YouTube, because payment apps refuse to work while one exists. The in-app pill, cover and tray follow the same palette.

**Layout:** the home screen never scrolls. The hero takes the free height and the controls anchor to the bottom. Side padding is `px-6`.

## Haptics

Use `lib/haptics.ts` only. Never call `expo-haptics` or `Vibration` directly. On Android the feels map to the system's `performHapticFeedback` constants. The native overlays mirror them with `feel(view, kind)`.

| Feel | Use |
|---|---|
| `tick` | moving between choices: tabs, slider steps, pages |
| `tap` | any button press (the `Button` default) |
| `toggleOn` / `toggleOff` | a switch or switch row |
| `settle` | something coming to rest (a sheet catching after a drag) |
| `confirm` | a commitment: Block on, limit lowered, Wilt back on, milestones, Accent buttons |
| `reject` | giving in or being refused: I'll give in, Keep scrolling, a blocked bounce |

A control owns its haptic (`Button haptic=...`, `Switch haptics`), so don't add a second one in the handler. Near-simultaneous feels collapse, and only a stronger one gets through.

## Copy

Short, direct, a little cheeky, and the cat is the mascot. **No em dashes in anything a user reads.** Use periods, commas or semicolons. (Code comments and "—" as a no-data placeholder are fine.)

## Practices

- Don't add `useEffect` in new code. Derive state, handle it in the event, or use `useMountEffect` for mount-only work.
- Sheet performance: nothing expensive to draw inside a sheet. A full-size SVG gradient behind the sheets made every open and close stutter (51% janky frames on the emulator), so `SheetGlow` is a pre-rendered white radial PNG (`assets/glow.png`) tinted with the accent (1.8% janky). Measure sheet changes with `dumpsys gfxinfo` over a few open/close cycles before and after.
- Keep business rules in pure `components/*.ts` with Jest tests, and run `npx jest` and `npx tsc --noEmit -p .` before calling anything done.
- New per-surface or state rules go through prefs and the bridge (`WiltnativeModule.kt` plus `modules/wiltnative/index.ts`), with a safe default for old installs.
- Compile-check Kotlin: copy `plugin/native/*.kt` into `android/app/src/main/java/com/rogerantony/wilt/`, then run `./gradlew :app:compileDebugKotlin` from `android/` with `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`.
- Test on the emulator (`emulator-5554`) with the debug dev client. Metro goes on port 8082 if 8081 is taken (`npx expo start --dev-client --port 8082`, `adb reverse tcp:8082 tcp:8082`). Don't drive the user's phone.
- Installing on the user's phone: `./gradlew assembleRelease` signs with the upload key (`~/.wilt/upload.keystore`), which matches the installed app, then `adb install -r` keeps their data. A reinstall can drop the accessibility service from the enabled list, so check it and re-add it (clear the setting, then put it back) if it's gone.
