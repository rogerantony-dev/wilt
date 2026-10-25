import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";

/**
 * Instagram's and YouTube's app marks in their own colours, drawn small for
 * onboarding art (the logos the cat gets pelted with). Illustrations, not UI
 * icons: UI glyphs still come from icons.tsx.
 */
export function InstagramMark({ size, id }: { size: number; id: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <RadialGradient id={`ig-${id}`} cx="0.3" cy="1.07" r="1.3">
          <Stop offset="0" stopColor="#FFDD55" />
          <Stop offset="0.12" stopColor="#FFDD55" />
          <Stop offset="0.42" stopColor="#FF543E" />
          <Stop offset="0.7" stopColor="#C837AB" />
          <Stop offset="1" stopColor="#3771C8" />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={64} height={64} rx={16} fill={`url(#ig-${id})`} />
      <Rect x={14} y={14} width={36} height={36} rx={11} fill="none" stroke="#fff" strokeWidth={4.2} />
      <Circle cx={32} cy={32} r={8.6} fill="none" stroke="#fff" strokeWidth={4.2} />
      <Circle cx={42.4} cy={21.6} r={2.6} fill="#fff" />
    </Svg>
  );
}

export function YouTubeMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect x={0} y={0} width={64} height={64} rx={16} fill="#fff" />
      <Path
        d="M53.2 22.6a5.4 5.4 0 0 0-3.8-3.8C46 18 32 18 32 18s-14 0-17.4.8a5.4 5.4 0 0 0-3.8 3.8C10 26 10 32 10 32s0 6 .8 9.4a5.4 5.4 0 0 0 3.8 3.8C18 46 32 46 32 46s14 0 17.4-.8a5.4 5.4 0 0 0 3.8-3.8C54 38 54 32 54 32s0-6-.8-9.4z"
        fill="#FF0000"
      />
      <Path d="M27.6 38.4 39 32l-11.4-6.4z" fill="#fff" />
    </Svg>
  );
}
