import { useId } from "react";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Stop } from "react-native-svg";

/**
 * The coin: a gold face on a darker rim, an inner ring and the cat's face
 * stamped in, and a white shine on the top left. Drawn at any size from one
 * 64-unit box.
 */
export function GoldCoin({ size }: { size: number }) {
  // Gradient ids stay unique per coin; useId's colons are not valid in url().
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const face = `coinface${id}`;
  const rim = `coinrim${id}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id={face} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFE38E" />
          <Stop offset="0.45" stopColor="#F2B83A" />
          <Stop offset="1" stopColor="#C98A1E" />
        </LinearGradient>
        <LinearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#E9A82A" />
          <Stop offset="1" stopColor="#9A6512" />
        </LinearGradient>
      </Defs>
      <Circle cx={32} cy={32} r={30} fill={`url(#${rim})`} />
      <Circle cx={32} cy={32} r={26} fill={`url(#${face})`} />
      <Circle cx={32} cy={32} r={21} fill="none" stroke="#B87A16" strokeWidth={1.6} opacity={0.55} />
      <Path
        d="M21 41 C19 33 20 26 22 19 L28 25 C30 24.4 34 24.4 36 25 L42 19 C44 26 45 33 43 41 C40 45 24 45 21 41 Z"
        fill="#B87A16"
        opacity={0.55}
      />
      <Ellipse cx={22} cy={18} rx={9} ry={4.5} fill="#fff" opacity={0.35} transform="rotate(-35 22 18)" />
    </Svg>
  );
}
