import { type ReactNode } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { CatHead } from "./CatHead";
import { translateXScaleY } from "./catmatrix";
import { Text } from "./ui/text";
import { useMountEffect } from "./useMountEffect";

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

const DISC = 214;
const HALO = DISC + 64;
const CAT = 150;

/** Disc shades per rung colour: a lit centre, a darker rim. */
const SHADES: Record<string, [string, string, string]> = {
  "#38C786": ["#2B6F52", "#1A4A37", "#143D2E"],
  "#E0913C": ["#6F4A1E", "#4A3114", "#3B2810"],
  "#D2542F": ["#6F2F1E", "#4A2014", "#3B1A10"],
};
const EMPTY = "#151514";

function shades(color: string): [string, string, string] {
  return SHADES[color] ?? SHADES["#E0913C"];
}

/**
 * The home screen's one object, shared by both modes so switching between
 * them moves nothing: a solid disc with two halo rings that breathe, the cat
 * on it, and a headline and subline beneath.
 *
 * In Guilt the disc is a vessel. `level` (1 full, 0 empty) is how much of the
 * day's time is left; the colour sits at that height and sinks as the minutes
 * burn, and the cat stands in it, awake, eyes darting. In Block the disc is
 * full and green and the cat sleeps (`asleep`).
 */
export function DiscHero({
  color,
  level,
  t,
  asleep = false,
  title,
  subtitle,
  height,
}: {
  color: string;
  level: number;
  t: number;
  asleep?: boolean;
  title: string;
  subtitle: string;
  /** The slot the hero is centred in; every state shares it. */
  height: number;
}) {
  const reduceMotion = useReducedMotion();
  const breathe = useSharedValue(0);
  const dart = useSharedValue(0.5);
  const blink = useSharedValue(0);
  const fill = useSharedValue(Math.max(0, Math.min(1, level)));

  useMountEffect(() => {
    if (reduceMotion) return;
    breathe.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    if (asleep) return;
    dart.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
    blink.value = withRepeat(
      withSequence(withDelay(3600, withTiming(1, { duration: 90 })), withTiming(0, { duration: 120 })),
      -1,
      false
    );
  });
  fill.value = withTiming(Math.max(0, Math.min(1, level)), {
    duration: reduceMotion ? 0 : 900,
    easing: Easing.out(Easing.cubic),
  });

  const halo = useAnimatedStyle(() => ({
    opacity: 0.55 + 0.45 * breathe.value,
    transform: [{ scale: 0.96 + 0.06 * breathe.value }],
  }));
  const eyeProps = useAnimatedProps(() => ({
    matrix: asleep
      ? translateXScaleY(0, 0.04, 128)
      : translateXScaleY(-6 + dart.value * 12, 1 - blink.value, 128),
  })) as never;
  // The liquid: a rect whose top edge is at the level, plus a slightly lighter
  // ellipse riding the surface so it reads as a fill and not a flat band.
  const liquidProps = useAnimatedProps(() => ({
    y: 100 - fill.value * 100,
    height: fill.value * 100 + 2,
  }));
  const surfaceProps = useAnimatedProps(() => ({
    cy: 100 - fill.value * 100,
    opacity: fill.value > 0.01 && fill.value < 0.99 ? 1 : 0,
  }));

  const [lit, mid, rim] = shades(color);

  return (
    <View style={{ height }} className="items-center justify-center">
      <View style={{ width: HALO, height: HALO }} className="items-center justify-center">
        <Animated.View style={[{ position: "absolute", width: HALO, height: HALO }, halo]}>
          <Svg width={HALO} height={HALO} viewBox="0 0 100 100">
            <Circle cx={50} cy={50} r={46} fill="none" stroke={color} strokeOpacity={0.1} strokeWidth={6} />
            <Circle cx={50} cy={50} r={40} fill="none" stroke={color} strokeOpacity={0.16} strokeWidth={4} />
          </Svg>
        </Animated.View>
        <Svg width={DISC} height={DISC} viewBox="0 0 100 100" style={{ position: "absolute" }}>
          <Defs>
            <ClipPath id="disc-clip">
              <Circle cx={50} cy={50} r={50} />
            </ClipPath>
            <RadialGradient id="disc-fill" cx="50%" cy="40%" r="60%">
              <Stop offset="0" stopColor={lit} />
              <Stop offset="0.7" stopColor={mid} />
              <Stop offset="1" stopColor={rim} />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={50} r={50} fill={EMPTY} />
          <G clipPath="url(#disc-clip)">
            <AnimatedRect x={-5} width={110} fill="url(#disc-fill)" animatedProps={liquidProps} />
            <AnimatedEllipse cx={50} rx={56} ry={3.2} fill={color} fillOpacity={0.45} animatedProps={surfaceProps} />
          </G>
          <Circle cx={50} cy={50} r={49.5} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={1} />
        </Svg>
        <Svg width={CAT} height={CAT} viewBox="0 0 256 256">
          <CatHead
            t={t}
            clipId="disc-cat"
            eyes={(children: ReactNode) => <AnimatedG animatedProps={eyeProps}>{children}</AnimatedG>}
          />
          {asleep ? (
            <>
              <Ellipse cx={102} cy={128} rx={21} ry={20} fill="#33322E" />
              <Ellipse cx={154} cy={128} rx={21} ry={20} fill="#33322E" />
              <Path d="M86 130 q16 12 32 0 M138 130 q16 12 32 0" fill="none" stroke="#0D0D0C" strokeWidth={7} strokeLinecap="round" />
            </>
          ) : null}
        </Svg>
        {asleep ? (
          <View style={{ position: "absolute", right: 42, top: 34 }}>
            <Text weight="bold" className="text-success" style={{ fontSize: 22, lineHeight: 24, letterSpacing: -1 }}>
              z<Text weight="bold" className="text-success" style={{ fontSize: 13, opacity: 0.7 }}>z</Text>
            </Text>
          </View>
        ) : null}
      </View>
      <Text weight="bold" style={{ fontSize: 26, lineHeight: 30, letterSpacing: -0.6, marginTop: 14, fontVariant: ["tabular-nums"] }}>
        {title}
      </Text>
      <Text size="sm" muted style={{ marginTop: 2 }}>
        {subtitle}
      </Text>
    </View>
  );
}
