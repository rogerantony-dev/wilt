import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

/**
 * A soft colour field that rises from the bottom of the screen in the rung
 * colour. `level` (0..1) is how far the day has burned: the field is a faint
 * glow at the foot of the screen when nothing has been scrolled and climbs to
 * fill most of it as the limit approaches, so the mood is readable before
 * any number is. It sits behind everything and ignores touches. Colour and
 * height ease to each new reading.
 */
export function AmbientField({ color, level }: { color: string; level: number }) {
  const { width, height } = useWindowDimensions();
  const k = Math.max(0, Math.min(1, level));
  // Visible from the first minute: opacity 0.42 -> 0.72 and reach 0.50 -> 0.88
  // of the screen as the day burns.
  const alpha = useSharedValue(0.42 + 0.3 * k);
  const reach = useSharedValue(0.5 + 0.38 * k);
  const ease = { duration: 900, easing: Easing.out(Easing.cubic) };
  alpha.value = withTiming(0.42 + 0.3 * k, ease);
  reach.value = withTiming(0.5 + 0.38 * k, ease);

  // Gradient stops have no native view of their own, so the whole blob's
  // opacity and reach are what animate; the stops stay static.
  const blobProps = useAnimatedProps(() => ({ ry: height * reach.value, opacity: alpha.value }));

  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <Defs>
        <RadialGradient id="ambient" cx="50%" cy="100%" rx="62%" ry="100%" gradientUnits="objectBoundingBox">
          <Stop offset="0" stopColor={color} stopOpacity={1} />
          <Stop offset="0.45" stopColor={color} stopOpacity={0.42} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <AnimatedEllipse cx={width / 2} cy={height * 1.04} rx={width * 1.1} animatedProps={blobProps} fill="url(#ambient)" />
    </Svg>
  );
}
