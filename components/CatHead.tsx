import type { ReactNode } from "react";
import { Circle, ClipPath, Defs, Ellipse, G, Line, Path, Rect } from "react-native-svg";
import { catHead, type Eye } from "./catdecay";

/**
 * The cat's head, drawn in its own 256 x 256 box from the [catHead] model, so
 * it looks exactly like the pill and widget frames. Place it with a parent
 * <G transform> (see DiscHero). `eyes` lets the caller wrap the eye group,
 * so the clock can hand it an Animated <G> that darts.
 */
export function CatHead({
  t,
  eyes = (children) => <G>{children}</G>,
  clipId = "cathead-clip",
}: {
  t: number;
  eyes?: (children: ReactNode) => ReactNode;
  clipId?: string;
}) {
  const m = catHead(t);
  const PINK = "#E08A97";

  return (
    <G>
      {m.patchR > 0 ? (
        <Defs>
          <ClipPath id={clipId}>
            <Circle cx={128} cy={128} r={80} />
          </ClipPath>
        </Defs>
      ) : null}

      {/* ears: rounder, pink inside while healthy, drooping about the base */}
      <G transform={`rotate(${-m.earDroop} 78 84)`}>
        <Path d="M78 88 Q66 50 60 24 Q92 40 114 62 Z" fill={m.fur} />
        <Path d="M84 76 Q72 46 68 34 Q92 50 104 66 Z" fill={PINK} opacity={m.earInnerOpacity} />
      </G>
      <G transform={`rotate(${m.earDroop} 178 84)`}>
        <Path d="M178 88 Q190 50 196 24 Q164 40 142 62 Z" fill={m.fur} />
        <Path d="M172 76 Q184 46 188 34 Q164 50 152 66 Z" fill={PINK} opacity={m.earInnerOpacity} />
        {m.earNotch ? <Path d="M178 40 l12 -6 l-4 12 z" fill="#0D0D0C" /> : null}
      </G>

      <Circle cx={128} cy={128} r={80} fill={m.fur} />

      {/* skull patch: a jagged opening that grows until the head is bone */}
      {m.patchR > 0 ? <SkullPatch r={m.patchR} opacity={m.patchOpacity} clipId={clipId} /> : null}
      {m.over ? (
        <G stroke="#8A8574" strokeWidth={3} fill="none" strokeLinecap="round">
          <Path d="M150 62 l10 18 l-8 10 l9 12" />
          <Path d="M92 92 l-8 14 l6 8" />
          <Path d="M128 40 l4 12 l-6 8" />
        </G>
      ) : null}

      {m.spots.map((s, i) => (
        <Ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={s.fill} opacity={s.opacity} />
      ))}

      {eyes(
        <>
          <EyeShape e={m.eyes[0]} />
          <EyeShape e={m.eyes[1]} />
        </>,
      )}

      {/* blush and whiskers: the first things to go */}
      <Ellipse cx={82} cy={150} rx={11} ry={6} fill={PINK} opacity={m.blushOpacity} />
      <Ellipse cx={174} cy={150} rx={11} ry={6} fill={PINK} opacity={m.blushOpacity} />
      <G stroke={m.whiskerStroke} strokeWidth={2.4} strokeLinecap="round" opacity={m.whiskerOpacity}>
        <G transform={`rotate(${m.whiskerDroop} 86 156)`}>
          <Line x1={86} y1={150} x2={48} y2={140} />
          <Line x1={86} y1={158} x2={46} y2={158} />
          <Line x1={86} y1={166} x2={50} y2={176} />
        </G>
        <G transform={`rotate(${-m.whiskerDroop} 170 156)`}>
          <Line x1={170} y1={150} x2={208} y2={140} />
          <Line x1={170} y1={158} x2={210} y2={158} />
          <Line x1={170} y1={166} x2={206} y2={176} />
        </G>
      </G>

      {/* nose */}
      {m.over ? (
        <Path d="M120 148 l8 12 l8 -12 z" fill={m.nose.fill} />
      ) : (
        <Path
          d="M121 150 h14 a2 2 0 0 1 1.6 3.2 l-6.6 7.6 a2.4 2.4 0 0 1 -3.6 0 l-6.6 -7.6 a2 2 0 0 1 1.6 -3.2z"
          fill={m.nose.fill}
        />
      )}

      {/* mouth: ω while cute, then one line that smiles, flattens, frowns, gapes; teeth once gone */}
      {m.over ? (
        <>
          <Path d="M96 170 h64" stroke="#2A2A27" strokeWidth={5} strokeLinecap="round" />
          <G fill="#2A2A27">
            <Rect x={104} y={166} width={7} height={12} rx={1} />
            <Rect x={118} y={166} width={7} height={14} rx={1} />
            <Rect x={132} y={166} width={7} height={14} rx={1} />
            <Rect x={146} y={166} width={7} height={12} rx={1} />
          </G>
        </>
      ) : (
        <>
          <Path
            d="M110 164 q9 12 18 0 q9 12 18 0"
            fill="none"
            stroke="#38C786"
            strokeWidth={5.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={m.cuteMouthOpacity}
          />
          <Path
            d={`M104 ${172 - m.arcMouth.dy * 0.35} q24 ${m.arcMouth.dy} 48 0`}
            fill="none"
            stroke={m.arcMouth.stroke}
            strokeWidth={6}
            strokeLinecap="round"
            opacity={m.arcMouth.opacity}
          />
          {m.gape > 0 ? (
            <>
              <Ellipse cx={128} cy={176 + m.gape * 3} rx={10 * m.gape} ry={8 * m.gape} fill="#5A1F16" />
              <Ellipse cx={128} cy={180 + m.gape * 4} rx={6 * m.gape} ry={5 * m.gape} fill="#C44A3F" />
            </>
          ) : null}
        </>
      )}

      {m.tearOpacity > 0 ? (
        <Path d="M182 92 q0 -14 6 -22 q6 8 6 22 a6 6 0 0 1 -12 0z" fill="#6FB3E6" opacity={m.tearOpacity} />
      ) : null}
    </G>
  );
}

function SkullPatch({ r, opacity, clipId }: { r: number; opacity: number; clipId: string }) {
  const d =
    `M ${168 - r * 0.2} ${74 - r * 0.1} l ${r * 0.35} ${-r * 0.1} l ${r * 0.2} ${r * 0.3} ` +
    `l ${-r * 0.1} ${r * 0.35} l ${-r * 0.4} ${r * 0.1} l ${-r * 0.25} ${-r * 0.35} z`;
  const crack = `M ${172 - r * 0.15} ${86 - r * 0.05} l ${r * 0.12} ${r * 0.18} l ${r * 0.1} ${-r * 0.05}`;
  return (
    <G clipPath={`url(#${clipId})`}>
      <Path d={d} fill="#E6E1D2" opacity={opacity} />
      <Path d={crack} stroke="#8A8574" strokeWidth={2.5} fill="none" strokeLinecap="round" />
    </G>
  );
}

function EyeShape({ e }: { e: Eye }) {
  if (e.kind === "x") {
    return (
      <G stroke={e.stroke} strokeWidth={7} strokeLinecap="round">
        <Line x1={e.cx - 11} y1={e.cy - 11} x2={e.cx + 11} y2={e.cy + 11} />
        <Line x1={e.cx + 11} y1={e.cy - 11} x2={e.cx - 11} y2={e.cy + 11} />
      </G>
    );
  }
  const px = e.cx + e.look;
  return (
    <G>
      <Circle cx={e.cx} cy={e.cy} r={17} fill={e.iris} />
      <Circle cx={px} cy={e.cy + 1} r={e.pupilR} fill={e.pupil} opacity={e.pupilOpacity} />
      <Circle cx={px - e.pupilR * 0.35} cy={e.cy - e.pupilR * 0.4} r={e.shine.r} fill="#fff" opacity={e.shine.opacity} />
      <Circle cx={px + e.pupilR * 0.4} cy={e.cy + e.pupilR * 0.35} r={e.shine2.r} fill="#fff" opacity={e.shine2.opacity} />
      <Rect x={e.cx - 19} y={e.cy - 19} width={38} height={e.lidHeight} fill={e.lidFill} />
    </G>
  );
}
