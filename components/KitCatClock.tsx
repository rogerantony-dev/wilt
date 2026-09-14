import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, G, Line, Path } from "react-native-svg";
import { CatHead } from "./CatHead";
import { decayStage, stageT } from "./catdecay";
import { rotateAbout, translateX } from "./catmatrix";
import { C } from "./console";
import { timeLeftState } from "./timeleft";
import { useMountEffect } from "./useMountEffect";

const AnimatedG = Animated.createAnimatedComponent(G);

// Cat greys sit off the shared palette (they're chrome, not brand colour).
const FUR = "#2A2A27";
const FACE = "#201F1D";


// The head is drawn in CatHead's 256-box (r=80 at 128,128) and scaled onto the
// clock so that it sits at r=34 around (75,48), the same spot the old head had.
const HEAD_SCALE = 34 / 80;
const HEAD_TX = 75 - 128 * HEAD_SCALE;
const HEAD_TY = 48 - 128 * HEAD_SCALE;

/**
 * Kit-Cat wall-clock read-out of the reels time you have left today: the number
 * reddens as the budget runs down, the eyes dart and the tail keeps time. The
 * head is the same cat as the pill and the widget, and rots through the same
 * six stages as the day's minutes climb. Replaces the minute-wall on the guilt
 * dashboard.
 */
export function KitCatClock({
  usedMinutes,
  limitMinutes,
}: {
  usedMinutes: number;
  limitMinutes: number;
}) {
  const { minutesLeft, color } = timeLeftState(usedMinutes, limitMinutes);
  const stage = decayStage(usedMinutes, limitMinutes);
  const t = stageT(stage);
  const reduceMotion = useReducedMotion();

  const dart = useSharedValue(0.5); // 0..1 -> eyes glance left..right (0.5 = centred)
  const swing = useSharedValue(0.5); // 0..1 -> tail sweeps side to side (0.5 = upright)
  useMountEffect(() => {
    if (reduceMotion) return; // rest at the centred pose set above
    dart.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    swing.value = withRepeat(
      withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  });

  // react-native-svg's native <G> only honours a `matrix` prop; `x`/`rotation`
  // are JS-render shorthands Reanimated can't reach on the New Architecture, so
  // the eyes and tail have to be driven through matrices. See catmatrix.ts.
  // `matrix` is a real native prop on RNSVGGroup but absent from the public
  // GProps types, so the returns are cast past the type gap.
  // The eyes live inside the scaled head group, so the dart is in head units
  // (about 6 there is the 2.5 it used to be on the clock).
  const eyeProps = useAnimatedProps(() => ({
    matrix: translateX((-2.5 + dart.value * 5) / HEAD_SCALE),
  })) as never;
  const tailProps = useAnimatedProps(() => ({
    matrix: rotateAbout(-15 + swing.value * 30, 112, 120),
  })) as never;

  return (
    <View className="items-center">
      <Svg width={150} height={182} viewBox="0 0 150 182">
        {/* head: the shared rotting cat, scaled onto the clock */}
        <G transform={`translate(${HEAD_TX} ${HEAD_TY}) scale(${HEAD_SCALE})`}>
          <CatHead
            t={t}
            eyes={(children: ReactNode) => <AnimatedG animatedProps={eyeProps}>{children}</AnimatedG>}
          />
        </G>
        {/* bow tie picks up the live tone colour; bone once the cat is gone */}
        <Path d="M60 92 L75 82 L90 92 L75 98 Z" fill={stage >= 6 ? "#8A8574" : color} />
        {/* clock face */}
        <Circle cx={75} cy={132} r={40} fill={FACE} stroke={C.ash} strokeWidth={2.5} />
        {/* 12 / 3 / 6 / 9 ticks */}
        <Line x1={75} y1={98} x2={75} y2={104} stroke={C.dim} strokeWidth={2} strokeLinecap="round" />
        <Line x1={109} y1={132} x2={103} y2={132} stroke={C.dim} strokeWidth={2} strokeLinecap="round" />
        <Line x1={75} y1={166} x2={75} y2={160} stroke={C.dim} strokeWidth={2} strokeLinecap="round" />
        <Line x1={41} y1={132} x2={47} y2={132} stroke={C.dim} strokeWidth={2} strokeLinecap="round" />
        {/* hands */}
        <Line x1={75} y1={132} x2={75} y2={110} stroke={C.bone} strokeWidth={3} strokeLinecap="round" />
        <Line x1={75} y1={132} x2={92} y2={139} stroke={C.bone} strokeWidth={3} strokeLinecap="round" />
        <Circle cx={75} cy={132} r={3.5} fill={color} />
        {/* tail — pivots at its base (matrix carries the pivot) and keeps time */}
        <AnimatedG animatedProps={tailProps}>
          <Path d="M112 120 q24 8 20 44" stroke={FUR} strokeWidth={7} strokeLinecap="round" fill="none" />
        </AnimatedG>
      </Svg>
      <Text
        className="mt-3"
        style={{ fontSize: 13, fontWeight: "700", letterSpacing: 1.2 }}
      >
        <Text style={{ color, fontVariant: ["tabular-nums"] }}>{minutesLeft} MIN</Text>
        <Text className="text-dim"> LEFT</Text>
      </Text>
    </View>
  );
}
