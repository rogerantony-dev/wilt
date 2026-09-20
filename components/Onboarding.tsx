import { useState, type ReactNode } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { ChevronRightIcon, LockIcon, TickCircleIcon, TickIcon } from "./icons";
import { HugeiconsIcon } from "@hugeicons/react-native";
import HgInstagram from "@hugeicons/core-free-icons/InstagramIcon";
import HgYoutube from "@hugeicons/core-free-icons/YoutubeIcon";
import HgPlay from "@hugeicons/core-free-icons/PlayCircleIcon";
import HgFilm from "@hugeicons/core-free-icons/FilmRoll01Icon";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import * as IntentLauncher from "expo-intent-launcher";
import { LimitSlider } from "./LimitSlider";
import { Button } from "./ui/button";
import { GLASS, HAIRLINE, PrimaryButton } from "./kit";
import { AmbientField } from "./AmbientField";
import { Switch } from "./ui/switch";
import { Typography } from "./ui/typography";

import { Brand, C } from "./console";
import { CATS } from "./cats";
import { CatHead } from "./CatHead";
import { DiscHero } from "./DiscHero";
import { translateXScaleY } from "./catmatrix";
import { useMountEffect } from "./useMountEffect";
import { setLimitNow, setMode, type WiltMode } from "../modules/wiltnative";
import { LIMIT_OPTIONS } from "./progress";
import { limitColor, withAlpha } from "./limitramp";

const AnimatedG = Animated.createAnimatedComponent(G);

const ANDROID_PACKAGE = "com.rogerantony.wilt";
const WASTE = "#E0913C";
const OVER = "#D2542F";
const HAIR = "rgba(242,241,236,0.10)";
const PAGES = 5;

function openAccessibilitySettings() {
  IntentLauncher.startActivityAsync("android.settings.ACCESSIBILITY_SETTINGS").catch(() => {});
}

function openOverlaySettings() {
  IntentLauncher.startActivityAsync(
    "android.settings.action.MANAGE_OVERLAY_PERMISSION",
    { data: `package:${ANDROID_PACKAGE}` }
  ).catch(() => {
    IntentLauncher.startActivityAsync(
      "android.settings.action.MANAGE_OVERLAY_PERMISSION"
    ).catch(() => {});
  });
}

/**
 * First-run flow, cinematic cut: six swipeable pages with one picture and one
 * line each (a feed sliding by, the Kit-Cat clock, the cat wilting, the nudge
 * over a reel, mode + limit, the two permission switches), then a send-off
 * once both permissions are live. Art and copy drift in off the scroll offset
 * so every arrival plays its entrance; loops (feed, wilt, blink) run on the UI
 * thread and rest still under reduced motion.
 */
export function OnboardingFlow({
  overlayDone,
  accessibilityDone,
  onFinish,
}: {
  overlayDone: boolean;
  accessibilityDone: boolean;
  onFinish: () => void;
}) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [height, setHeight] = useState(0);
  const ref = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const isLast = page === PAGES - 1;

  // The wilt slide plays only while it is the one in place. Read off the
  // pager's offset rather than `page`, which the Next button sets before the
  // scroll has finished, so the loop starts the moment the slide lands and
  // resets when it leaves.
  const [wiltOn, setWiltOn] = useState(false);
  useAnimatedReaction(
    () => width > 0 && Math.abs(scrollX.value - 2 * width) < 2,
    (on, prev) => {
      if (on !== prev) runOnJS(setWiltOn)(on);
    },
    [width]
  );

  const goTo = (i: number) => {
    const c = Math.max(0, Math.min(PAGES - 1, i));
    ref.current?.scrollTo({ x: c * width, animated: true });
    setPage(c);
  };

  // Mode + limit are chosen on page 4 and persisted as you tap.
  const [selMode, setSelMode] = useState<WiltMode>("guilt");
  const [lim, setLim] = useState(30);
  const chooseMode = (m: WiltMode) => {
    setSelMode(m);
    setMode(m);
  };
  const pickLimit = (n: number) => {
    setLim(n);
    setLimitNow(n);
  };

  if (overlayDone && accessibilityDone) {
    return <ReadyScreen onFinish={onFinish} />;
  }

  const pageStyle = { width, height };
  const skip = () => goTo(PAGES - 1);

  return (
    <View className="flex-1">
      {/* The same field as the home screen, so the first run and the
          dashboard are one place. It takes the chosen rung colour on the
          mode page and stays a calm green elsewhere. */}
      <AmbientField color={page === 3 && selMode === "guilt" ? limitColor(lim) : C.toxic} level={0.25} />
      <View className="flex-1" onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
        <Animated.ScrollView
          ref={ref}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={scrollHandler}
          onMomentumScrollEnd={(e) =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / width))
          }
        >
          {/* 0 — Cold open: a feed slides by, a number climbs. */}
          <View style={pageStyle} className="overflow-hidden px-6 pb-3 pt-3">
            <FeedArt width={width} height={height} />
            <Header onSkip={skip} />
            <Drift index={0} scrollX={scrollX} width={width} style={styles.stage}>
              <Counter target={47} />
            </Drift>
            <Drift index={0} scrollX={scrollX} width={width} shift={26}>
              <Copy title="It adds up." sub="Reels and Shorts, a few minutes at a time." />
            </Drift>
          </View>

          {/* 1 — The clock. */}
          <View style={pageStyle} className="px-6 pb-3 pt-3">
            <Header onSkip={skip} />
            <Drift index={1} scrollX={scrollX} width={width} style={styles.stage}>
              {/* The same disc as the home screen, part-way through a day, so
                  the first run teaches the object you then live with. */}
              <DiscHero color={WASTE} level={0.6} t={0.4} title="18 min left" subtitle="of 30 today" height={380} />
            </Drift>
            <Drift index={1} scrollX={scrollX} width={width} shift={26}>
              <Copy title={"Your scroll,\nin one dial."} sub="It drains while you watch." />
            </Drift>
          </View>

          {/* 2 — The wilt. */}
          <View style={pageStyle} className="px-6 pb-3 pt-3">
            <Header onSkip={skip} />
            <Drift index={2} scrollX={scrollX} width={width} style={styles.stage}>
              {/* Keyed on arrival so the wilt remounts at its first frame and
                  only starts its loop once this page is the one on screen. */}
              <WiltArt key={wiltOn ? "playing" : "waiting"} playing={wiltOn} />
            </Drift>
            <Drift index={2} scrollX={scrollX} width={width} shift={26}>
              <Copy title={"Scroll on,\nand it wilts."} sub="Stop early and it stays a cat." />
            </Drift>
          </View>

          {/* 3 — Mode and limit. */}
          <View style={pageStyle} className="px-6 pb-3 pt-3">
            <Header />
            <View className="flex-1 justify-center">
              <Drift index={3} scrollX={scrollX} width={width} shift={14}>
                <Copy align="left" title={"How should\nWilt step in?"} sub="Pick one. Change it anytime." />
              </Drift>
              <Drift index={3} scrollX={scrollX} width={width} shift={30}>
                <View className="h-7" />
                <ModeRow
                  selected={selMode === "guilt"}
                  accent={limitColor(lim)}
                  preview={<FeedPreview accent={limitColor(lim)} limit={lim} />}
                  title="Guilt"
                  body="A timer floats over the feed. At your limit, a cat takes over."
                  onPress={() => chooseMode("guilt")}
                >
                  <Text className="text-[11px] font-semibold uppercase text-dim" style={{ letterSpacing: 0.9 }}>
                    Daily limit
                  </Text>
                  <View className="mt-1.5">
                    <LimitSlider value={lim} onPick={pickLimit} />
                  </View>
                </ModeRow>
                <View className="h-3" />
                <ModeRow
                  selected={selMode === "block"}
                  accent={C.toxic}
                  preview={<WalledPreview />}
                  title="Block"
                  body="Reels and Shorts stay walled, all day."
                  onPress={() => chooseMode("block")}
                >
                  <View className="gap-2.5">
                    <Fact text="Instagram and YouTube still open. Only the reels are covered." />
                    <Fact text="No timer, no limit to set. Nothing to negotiate with." />
                    <Fact text="Switch back to Guilt from the home screen whenever you like." />
                  </View>
                </ModeRow>
              </Drift>
            </View>
          </View>

          {/* 4 — The two switches. */}
          <View style={pageStyle} className="px-6 pb-3 pt-3">
            <Header on={false} />
            <View className="flex-1 justify-center">
              <Drift index={4} scrollX={scrollX} width={width} shift={14}>
                <Copy align="left" title="Almost there." />
              </Drift>
              <Drift index={4} scrollX={scrollX} width={width} shift={30}>
                <View className="mt-8 gap-2.5">
                  <SwitchRow
                    on={overlayDone}
                    title="Draw over apps"
                    body="So the timer can float on the feed."
                    action="Open overlay permission"
                    onPress={openOverlaySettings}
                    first
                  />
                  <SwitchRow
                    on={accessibilityDone}
                    title="Accessibility service"
                    body="Find “Wilt Reel Counter” and turn it on."
                    action="Open settings"
                    onPress={openAccessibilitySettings}
                  />
                </View>
                <View className="mt-5 flex-row items-start gap-2">
                  <View style={{ marginTop: 3 }}><LockIcon size={12} color={C.dim} /></View>
                  <Text className="flex-1 text-[12px] leading-[17px] text-dim">
                    Reads Instagram and YouTube only. Nothing leaves your phone.
                  </Text>
                </View>
              </Drift>
            </View>
          </View>
        </Animated.ScrollView>
      </View>

      <View className="px-6 pb-3 pt-2">
        <MorphDots scrollX={scrollX} width={width} />
        {/* The permissions page has nothing to advance to, but the button stays
            mounted and merely hidden: unmounting it shrinks this footer, which
            re-measures `height` and re-lays out every page mid-swipe. */}
        <View className="mt-5">
          {/* On the permissions page the button stays, dimmed, until both
              switches are on; the footer never changes height. */}
          <Primary
            label={page === 0 ? "Get started" : page === 3 || isLast ? "Continue" : "Next"}
            onPress={() => goTo(page + 1)}
            disabled={isLast}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: "center", justifyContent: "center" },
  fill: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
});

/* ------------------------------------------------------------------ */
/* Choreography                                                        */
/* ------------------------------------------------------------------ */

/** Fades and lifts its children off the pager offset, so each page's art and
 *  copy drift into place on arrival and out again on the way past. */
function Drift({
  index,
  scrollX,
  width,
  shift = 18,
  style,
  children,
}: {
  index: number;
  scrollX: SharedValue<number>;
  width: number;
  shift?: number;
  style?: ViewStyle;
  children: React.ReactNode;
}) {
  const s = useAnimatedStyle(() => {
    const range = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(scrollX.value, range, [shift, 0, shift], Extrapolation.CLAMP) },
      ],
    };
  });
  return <Animated.View style={[style, s]}>{children}</Animated.View>;
}


/* ------------------------------------------------------------------ */
/* Page 0: cold open                                                   */
/* ------------------------------------------------------------------ */

const REEL_H = 420;
const REEL_GAP = 14;
const REEL_W = 300;
const REEL_TONES = ["#2A2325", "#20262A", "#292A1F"];

/** An abstract feed sliding up behind the counter, dissolved top and bottom. */
function FeedArt({ width, height }: { width: number; height: number }) {
  const reduceMotion = useReducedMotion();
  const y = useSharedValue(0);
  const cycle = 3 * (REEL_H + REEL_GAP);
  useMountEffect(() => {
    if (reduceMotion) return;
    y.value = withRepeat(withTiming(-cycle, { duration: 9000, easing: Easing.linear }), -1, false);
  });
  const col = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  if (height === 0) return null;
  return (
    <View style={styles.fill} pointerEvents="none">
      <Animated.View
        style={[{ position: "absolute", top: 0, left: (width - REEL_W) / 2, width: REEL_W }, col]}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <View
            key={i}
            style={{
              height: REEL_H,
              marginVertical: REEL_GAP / 2,
              borderRadius: 22,
              backgroundColor: REEL_TONES[i % 3],
              opacity: 0.9,
            }}
          >
            <View style={{ position: "absolute", left: 16, bottom: 58, width: 28, height: 28, borderRadius: 14, backgroundColor: C.panelhi }} />
            <View style={{ position: "absolute", left: 52, bottom: 70, width: 120, height: 8, borderRadius: 4, backgroundColor: C.panelhi }} />
            <View style={{ position: "absolute", left: 52, bottom: 54, width: 180, height: 8, borderRadius: 4, backgroundColor: C.panelhi, opacity: 0.6 }} />
            <View style={{ position: "absolute", right: 14, bottom: 60, gap: 18 }}>
              {[0, 1, 2].map((k) => (
                <View key={k} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.panelhi, opacity: 0.8 }} />
              ))}
            </View>
          </View>
        ))}
      </Animated.View>
      <Svg width={width} height={height} style={styles.fill}>
        <Defs>
          <LinearGradient id="feedfade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.ink} stopOpacity={1} />
            <Stop offset="0.26" stopColor={C.ink} stopOpacity={0} />
            <Stop offset="0.5" stopColor={C.ink} stopOpacity={0} />
            <Stop offset="0.76" stopColor={C.ink} stopOpacity={1} />
            <Stop offset="1" stopColor={C.ink} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#feedfade)" />
      </Svg>
    </View>
  );
}

/** Counts up to `target` over a couple of seconds, easing out. */
function Counter({ target }: { target: number }) {
  const reduceMotion = useReducedMotion();
  const [n, setN] = useState(reduceMotion ? target : 0);
  useMountEffect(() => {
    if (reduceMotion) return;
    const t0 = Date.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (Date.now() - t0) / 2600);
      setN(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
  return (
    <View className="items-center">
      <Text
        style={{
          fontSize: 132,
          lineHeight: 136,
          fontWeight: "600",
          letterSpacing: -6,
          color: WASTE,
          fontVariant: ["tabular-nums"],
        }}
      >
        {n}
      </Text>
      <Text className="text-[13px] font-bold text-ash" style={{ letterSpacing: 1.6 }}>
        MIN TONIGHT
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Page 2: the wilt                                                    */
/* ------------------------------------------------------------------ */

const WILT_STAGES = [
  { t: 0.02, name: "Fresh", left: 30, color: C.toxic, hold: 1800 },
  { t: 0.4, name: "Wilting", left: 18, color: C.toxic, hold: 1300 },
  { t: 0.7, name: "Mouldy", left: 9, color: WASTE, hold: 1300 },
  { t: 0.92, name: "Rotting", left: 2, color: OVER, hold: 1300 },
  { t: 1, name: "Gone", left: 0, color: OVER, hold: 2200 },
];

/** How long each thrown icon takes to reach the head, and the pause between. */
const THROW_MS = 620;
const THROW_GAP = 260;
/** One thrown reel or short: where it leaves from and which glyph it is. */
const THROWS: { from: number; glyph: number }[] = [
  { from: -120, glyph: 0 },
  { from: 118, glyph: 1 },
  { from: -70, glyph: 2 },
  { from: 128, glyph: 3 },
  { from: -125, glyph: 1 },
  { from: 70, glyph: 0 },
  { from: 120, glyph: 2 },
  { from: -100, glyph: 3 },
];
const GLYPHS = [HgInstagram, HgYoutube, HgPlay, HgFilm];

/**
 * Reels and shorts fly into the cat's head one after another, and each one
 * that lands pushes it a stage further down the wilt: two throws per stage,
 * the cat shudders on impact, and once it is gone everything rests a beat and
 * starts over. Two throws are in flight at once so the stream reads as a
 * feed, not a metronome.
 */
function WiltArt({ playing }: { playing: boolean }) {
  const [stage, setStage] = useState(0);
  const [round, setRound] = useState(0);
  const idx = useSharedValue(0);
  const shake = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useMountEffect(() => {
    // Off screen the cat just sits at its first stage; the parent remounts
    // this with `playing` once the pager lands here, and the loop begins then.
    if (!playing) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const run = () => {
      let tms = 700;
      THROWS.forEach((_, i) => {
        const land = tms + THROW_MS;
        at(land, () => {
          if (!reduceMotion) {
            shake.value = withSequence(
              withTiming(1, { duration: 40 }),
              withTiming(-1, { duration: 70 }),
              withTiming(0.5, { duration: 60 }),
              withTiming(0, { duration: 80 })
            );
          }
          // Every second landing advances the wilt.
          if (i % 2 === 1) {
            const next = Math.min(WILT_STAGES.length - 1, (i + 1) / 2);
            setStage(next);
            idx.value = next;
          }
        });
        tms += THROW_GAP;
      });
      // Rest at Gone, then reset and go again: the round key remounts the
      // throws, and `run` re-arms the landings for them.
      at(tms + THROW_MS + 1900, () => {
        // Head first, label once the skull has faded, so the two never disagree.
        idx.value = 0;
        at(450, () => setStage(0));
        setRound((r) => r + 1);
        at(60, run);
      });
    };
    run();
    return () => timers.forEach(clearTimeout);
  });

  // `round` restarts the throw sequence; the head is keyed on nothing, so it
  // fades between stages in place.
  const headStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value * 5 }, { rotate: `${shake.value * 2}deg` }],
  }));

  const s = WILT_STAGES[stage];
  return (
    <View className="items-center">
      <View style={{ width: 300, height: 300, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={[{ width: 250, height: 250 }, headStyle]}>
          {WILT_STAGES.map((w, i) => (
            <WiltLayer key={i} i={i} idx={idx} t={w.t} />
          ))}
        </Animated.View>
        {playing && !reduceMotion
          ? THROWS.map((t, i) => <Thrown key={`${round}-${i}`} from={t.from} glyph={GLYPHS[t.glyph]} delay={700 + i * THROW_GAP} />)
          : null}
      </View>
      <Text className="mt-2 text-[20px] font-semibold" style={{ color: s.color, letterSpacing: -0.3 }}>
        {s.name}
      </Text>
      <Text className="mt-1" style={{ fontSize: 13, fontWeight: "700", letterSpacing: 1.2 }}>
        <Text style={{ color: s.color, fontVariant: ["tabular-nums"] }}>{s.left} MIN</Text>
        <Text className="text-dim"> LEFT</Text>
      </Text>
    </View>
  );
}

/**
 * One icon thrown at the head: rises from below and to the side on an arc,
 * spins a little, and shrinks into the head as it lands. Mounted once per
 * throw and keyed by round, so each loop replays it from the start.
 */
function Thrown({ from, glyph, delay }: { from: number; glyph: typeof HgInstagram; delay: number }) {
  const p = useSharedValue(0);
  useMountEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: THROW_MS, easing: Easing.in(Easing.quad) }));
  });
  const style = useAnimatedStyle(() => {
    const k = p.value;
    // Start low and off to one side; arc up and in to the head's centre.
    const x = from * (1 - k);
    const y = 150 * (1 - k) - 90 * Math.sin(k * Math.PI);
    const scale = k < 0.85 ? 1 : 1 - (k - 0.85) / 0.15;
    return {
      opacity: k === 0 ? 0 : k > 0.92 ? (1 - k) / 0.08 : 1,
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${(1 - k) * from * 0.6}deg` }, { scale }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(242,241,236,0.10)", borderWidth: 1, borderColor: "rgba(242,241,236,0.14)" },
        style,
      ]}
    >
      <HugeiconsIcon icon={glyph} size={22} color={C.bone} strokeWidth={1.8} />
    </Animated.View>
  );
}

function WiltLayer({ i, idx, t }: { i: number; idx: SharedValue<number>; t: number }) {
  const s = useAnimatedStyle(() => ({
    opacity: withTiming(idx.value === i ? 1 : 0, { duration: 500 }),
  }));
  return (
    <Animated.View style={[styles.fill, s]}>
      <Svg width={250} height={250} viewBox="0 0 256 256">
        <CatHead t={t} clipId={`wilt-${i}`} />
      </Svg>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Page 4: mode tiles                                                  */
/* ------------------------------------------------------------------ */

/**
 * One mode, as a full-width row: a small still of what the mode does, the
 * name, a radio, and (when chosen) its details unfolded beneath a hairline.
 * `accent` is the rung colour for Guilt and plain green for Block.
 */
function ModeRow({
  selected,
  accent,
  preview,
  title,
  body,
  onPress,
  children,
}: {
  selected: boolean;
  accent: string;
  preview: ReactNode;
  title: string;
  body: string;
  onPress: () => void;
  children: ReactNode;
}) {
  // The details stay mounted and are measured once off-screen; the row then
  // animates its height between 0 and that measurement, so choosing a mode
  // grows one row and folds the other instead of the page jumping.
  const [detailH, setDetailH] = useState(0);
  const open = useSharedValue(selected ? 1 : 0);
  open.value = withTiming(selected ? 1 : 0, { duration: 320, easing: Easing.out(Easing.cubic) });
  const reveal = useAnimatedStyle(() => ({
    height: open.value * detailH,
    opacity: interpolate(open.value, [0, 0.6, 1], [0, 0, 1]),
  }));
  // Colours resolved here, on the JS side: a worklet cannot call withAlpha.
  const tint = withAlpha(accent, 0.06);
  const glassBg = GLASS.backgroundColor;
  const frame = useAnimatedStyle(() => ({
    borderColor: interpolateColor(open.value, [0, 1], [HAIRLINE, accent]),
    backgroundColor: interpolateColor(open.value, [0, 1], [glassBg, tint]),
  }));

  return (
    <Pressable onPress={onPress} className="active:opacity-95">
      <Animated.View className="rounded-[22px] p-4" style={[{ borderWidth: 1.5 }, frame]}>
        <View className="flex-row items-center gap-3.5">
          {preview}
          <View className="flex-1">
            <Text className="text-[19px] font-semibold text-bone" style={{ letterSpacing: -0.3 }}>
              {title}
            </Text>
            <Text className="mt-0.5 text-[13px] leading-[17px] text-ash">{body}</Text>
          </View>
          <View
            className="h-[22px] w-[22px] items-center justify-center rounded-full"
            style={{ borderWidth: 1.5, borderColor: selected ? accent : C.dim }}
          >
            {selected ? <View className="h-[11px] w-[11px] rounded-full" style={{ backgroundColor: accent }} /> : null}
          </View>
        </View>
        <Animated.View style={[{ overflow: "hidden" }, reveal]} pointerEvents={selected ? "auto" : "none"}>
          {/* Absolutely placed so Yoga measures it at its natural height
              instead of capping it at the clip's current (animated) height. */}
          <View
            className="mt-4 pt-4"
            style={{ position: "absolute", left: 0, right: 0, top: 0, borderTopWidth: 1, borderTopColor: HAIR }}
            onLayout={(e) => {
              const h = Math.ceil(e.nativeEvent.layout.height + 16);
              if (h !== detailH) setDetailH(h);
            }}
          >
            {children}
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/** A thumbnail of a reel with the timer pill floating over it. */
function FeedPreview({ accent, limit }: { accent: string; limit: number }) {
  const left = Math.max(1, Math.round(limit * 0.4));
  return (
    <View
      className="h-[92px] w-[68px] overflow-hidden rounded-xl"
      style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: HAIR }}
    >
      <View className="absolute rounded-md" style={{ left: 8, right: 8, top: 8, bottom: 30, backgroundColor: "#232321" }} />
      <View className="absolute h-1 rounded-sm" style={{ left: 8, top: 70, width: 34, backgroundColor: C.panelhi }} />
      <View className="absolute h-1 rounded-sm" style={{ left: 8, top: 78, width: 22, backgroundColor: C.panelhi }} />
      <View
        className="absolute rounded-full px-1.5 py-0.5"
        style={{ right: 6, top: 6, backgroundColor: "rgba(13,13,12,0.9)", borderWidth: 1, borderColor: withAlpha(accent, 0.4) }}
      >
        <Text style={{ color: accent, fontSize: 7, fontWeight: "600", fontFamily: "monospace" }}>{left}m left</Text>
      </View>
    </View>
  );
}

/** A thumbnail of the block-mode cover: the cat, and WALLED in green. */
function WalledPreview() {
  return (
    <View
      className="h-[92px] w-[68px] items-center justify-center gap-1 overflow-hidden rounded-xl"
      style={{ backgroundColor: C.ink, borderWidth: 1, borderColor: HAIR }}
    >
      <Svg width={40} height={40} viewBox="0 0 256 256">
        <CatHead t={0.02} clipId="walled-preview" />
      </Svg>
      <Text style={{ color: C.toxic, fontSize: 7, fontWeight: "600", letterSpacing: 0.6 }}>WALLED</Text>
    </View>
  );
}

/** A plain fact with a green check, for the Block details. */
function Fact({ text }: { text: string }) {
  return (
    <View className="flex-row items-start gap-2.5">
      <View
        className="mt-px h-[18px] w-[18px] items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(56,199,134,0.14)" }}
      >
        <TickIcon color={C.toxic} />
      </View>
      <Text className="flex-1 text-[14px] leading-[19px] text-ash">{text}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Page 5: the two switches                                            */
/* ------------------------------------------------------------------ */

/** A toggle that reflects a permission and slides when it flips. */
function Toggle({ on }: { on: boolean }) {
  // Read-only: the row's press opens the system setting that flips it.
  return <Switch value={on} onValueChange={() => {}} />;
}

function SwitchRow({
  on,
  title,
  body,
  action,
  onPress,
}: {
  on: boolean;
  title: string;
  body: string;
  action: string;
  onPress: () => void;
  first?: boolean;
}) {
  return (
    <Pressable
      onPress={on ? undefined : onPress}
      className="flex-row items-center gap-4 rounded-[18px] p-4 active:opacity-80"
      style={GLASS}
    >
      <Toggle on={on} />
      <View className="flex-1">
        <Text className="text-[16px] font-semibold text-bone" style={{ letterSpacing: -0.2 }}>
          {title}
        </Text>
        <Text className="mt-0.5 text-[13px] leading-[18px] text-ash">{body}</Text>
        {on ? (
          <View className="mt-1.5 flex-row items-center gap-1.5">
            <TickCircleIcon color={C.toxic} />
            <Text className="text-[12.5px] font-semibold text-toxic">On</Text>
          </View>
        ) : (
          <View className="mt-1.5 flex-row items-center gap-1">
            <Text className="text-[13px] font-semibold text-bone">{action}</Text>
            <ChevronRightIcon color={C.bone} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Send-off                                                            */
/* ------------------------------------------------------------------ */

/** Both switches are on: a fresh cat blinks in a green halo, one tap to the dashboard. */
function ReadyScreen({ onFinish }: { onFinish: () => void }) {
  const reduceMotion = useReducedMotion();
  const enter = useSharedValue(0);
  const breathe = useSharedValue(0);
  const dart = useSharedValue(0.5);
  const blink = useSharedValue(0);
  useMountEffect(() => {
    enter.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    if (reduceMotion) return;
    breathe.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }), -1, true);
    dart.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1, true);
    blink.value = withRepeat(
      withSequence(withDelay(3800, withTiming(1, { duration: 90 })), withTiming(0, { duration: 120 })),
      -1,
      false,
    );
  });
  const halo = useAnimatedStyle(() => ({
    opacity: 0.7 + 0.3 * breathe.value,
    transform: [{ scale: 0.92 + 0.13 * breathe.value }],
  }));
  const art = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 18 }],
  }));
  const copy = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 26 }],
  }));
  const eyeProps = useAnimatedProps(() => ({
    matrix: translateXScaleY(-6 + dart.value * 12, 1 - blink.value, 128),
  })) as never;

  return (
    <View className="flex-1 px-6 pb-3 pt-3">
      <Header />
      <Animated.View style={[styles.stage, art]}>
        <Animated.View style={[{ position: "absolute", width: 320, height: 320 }, halo]}>
          <Svg width={320} height={320} viewBox="0 0 320 320">
            <Defs>
              <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={C.toxic} stopOpacity={0.18} />
                <Stop offset="0.65" stopColor={C.toxic} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={160} cy={160} r={160} fill="url(#halo)" />
          </Svg>
        </Animated.View>
        <Svg width={220} height={220} viewBox="0 0 256 256">
          <CatHead
            t={0.02}
            clipId="ready-clip"
            eyes={(children) => <AnimatedG animatedProps={eyeProps}>{children}</AnimatedG>}
          />
        </Svg>
      </Animated.View>
      <Animated.View style={copy}>
        <Copy title="You’re set." sub="Go have an evening." />
      </Animated.View>
      <View className="pb-0 pt-2">
        <View className="mt-5">
          <Primary label="Open Wilt" onPress={onFinish} />
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function Header({ onSkip, on = true }: { onSkip?: () => void; on?: boolean }) {
  return (
    <View className="h-6 flex-row items-center justify-between">
      <Brand on={on} />
      {onSkip ? (
        <Button variant="ghost" size="sm" className="-mr-2.5 px-2.5" labelClassName="text-[13px] font-semibold text-dim" onPress={onSkip}>
          Skip
        </Button>
      ) : (
        <View style={{ width: 30 }} />
      )}
    </View>
  );
}

function Copy({
  title,
  sub,
  align = "center",
}: {
  title: string;
  sub?: string;
  align?: "center" | "left";
}) {
  const center = align === "center";
  return (
    <View className={center ? "items-center px-1" : "items-start"}>
      {/* Stretched rather than shrink-wrapped: Android measures a tracked
          heading a hair narrow and drops its last word onto a hidden line. */}
      <Typography
        type="h2"
        align={center ? "center" : "left"}
        style={{ fontSize: 34, letterSpacing: -0.8, lineHeight: 37, alignSelf: "stretch" }}
      >
        {title}
      </Typography>
      {sub ? (
        <Typography
          type="body-sm"
          muted
          align={center ? "center" : "left"}
          className="mt-3"
          style={{ fontSize: 15, lineHeight: 22, maxWidth: 320 }}
        >
          {sub}
        </Typography>
      ) : null}
    </View>
  );
}

/** Progress dots that morph off the scroll offset (on the UI thread, so the swipe
 *  stays smooth): the active dot elongates and brightens as you drag. */
function MorphDots({ scrollX, width }: { scrollX: SharedValue<number>; width: number }) {
  return (
    <View className="flex-row justify-center gap-1.5">
      {Array.from({ length: PAGES }).map((_, i) => (
        <MorphDot key={i} index={i} scrollX={scrollX} width={width} />
      ))}
    </View>
  );
}

function MorphDot({
  index,
  scrollX,
  width,
}: {
  index: number;
  scrollX: SharedValue<number>;
  width: number;
}) {
  const style = useAnimatedStyle(() => {
    const range = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      width: interpolate(scrollX.value, range, [7, 22, 7], Extrapolation.CLAMP),
      opacity: interpolate(scrollX.value, range, [0.28, 1, 0.28], Extrapolation.CLAMP),
    };
  });
  return (
    <Animated.View style={[{ height: 7, borderRadius: 4, backgroundColor: C.bone }, style]} />
  );
}

function Primary({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <PrimaryButton onPress={onPress} disabled={disabled}>
      {label}
    </PrimaryButton>
  );
}
