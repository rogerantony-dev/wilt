import type { ReactNode } from "react";
import { Circle, ClipPath, Defs, Ellipse, G, Line, Path, Rect } from "react-native-svg";
import { catHead, EYE_R, type Eye } from "./catdecay";

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
            <Ellipse cx={128} cy={134} rx={88} ry={76} />
          </ClipPath>
        </Defs>
      ) : null}

      {/* ears: short and round-tipped, pink inside while healthy, drooping about the base */}
      <G transform={`rotate(${-m.earDroop} 78 88)`}>
        <Path d="M70 96 C58 70 56 46 62 34 C66 28 72 28 78 32 C94 42 108 54 118 68 Z" fill={m.fur} />
        <Path d="M76 84 C68 66 67 50 70 42 C82 50 94 60 102 70 Z" fill={PINK} opacity={m.earInnerOpacity} />
      </G>
      <G transform={`rotate(${m.earDroop} 178 88)`}>
        <Path d="M186 96 C198 70 200 46 194 34 C190 28 184 28 178 32 C162 42 148 54 138 68 Z" fill={m.fur} />
        <Path d="M180 84 C188 66 189 50 186 42 C174 50 162 60 154 70 Z" fill={PINK} opacity={m.earInnerOpacity} />
        {m.earNotch ? <Path d="M199 50 l-11 7 l9 7 z" fill="#0D0D0C" /> : null}
      </G>

      <Ellipse cx={128} cy={134} rx={88} ry={76} fill={m.fur} />

      {/* skull patch: a jagged opening that grows until the head is bone */}
      {m.patchR > 0 ? <SkullPatch r={m.patchR} opacity={m.patchOpacity} clipId={clipId} /> : null}
      {m.over ? (
        <G stroke="#8A8574" strokeWidth={3} fill="none" strokeLinecap="round">
          <Path d="M150 62 l10 18 l-8 10 l9 12" />
          <Path d="M92 92 l-8 14 l6 8" />
          <Path d="M128 48 l4 12 l-6 8" />
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
      <Ellipse cx={70} cy={168} rx={15} ry={9} fill={PINK} opacity={m.blushOpacity} />
      <Ellipse cx={186} cy={168} rx={15} ry={9} fill={PINK} opacity={m.blushOpacity} />
      <G stroke={m.whiskerStroke} strokeWidth={2.4} strokeLinecap="round" opacity={m.whiskerOpacity}>
        <G transform={`rotate(${m.whiskerDroop} 74 162)`}>
          <Line x1={74} y1={162} x2={44} y2={158.5} />
          <Line x1={74} y1={170} x2={44} y2={173.5} />
        </G>
        <G transform={`rotate(${-m.whiskerDroop} 182 162)`}>
          <Line x1={182} y1={162} x2={212} y2={158.5} />
          <Line x1={182} y1={170} x2={212} y2={173.5} />
        </G>
      </G>

      {/* nose */}
      {m.over ? (
        <Path d="M121 162 l7 10 l7 -10 z" fill={m.nose.fill} />
      ) : (
        <Path
          d="M122 164 h12 a2 2 0 0 1 1.5 3 l-5.8 6.6 a2.2 2.2 0 0 1 -3.4 0 l-5.8 -6.6 a2 2 0 0 1 1.5 -3z"
          fill={m.nose.fill}
        />
      )}

      {/* mouth: ω while cute, then one line that smiles, flattens, frowns, gapes; teeth once gone */}
      {m.over ? (
        <>
          <Path d="M98 175 h60" stroke="#2A2A27" strokeWidth={5} strokeLinecap="round" />
          <G fill="#2A2A27">
            <Rect x={103} y={171} width={7} height={12} rx={1} />
            <Rect x={117} y={171} width={7} height={14} rx={1} />
            <Rect x={131} y={171} width={7} height={14} rx={1} />
            <Rect x={145} y={171} width={7} height={12} rx={1} />
          </G>
        </>
      ) : (
        <>
          <Path
            d="M115.04 169 q6.48 8.64 12.96 0 q6.48 8.64 12.96 0"
            fill="none"
            stroke="#38C786"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={m.cuteMouthOpacity}
          />
          <Path
            d={`M110.72 ${177 - m.arcMouth.dy * 0.35} q17.28 ${m.arcMouth.dy} 34.56 0`}
            fill="none"
            stroke={m.arcMouth.stroke}
            strokeWidth={5.5}
            strokeLinecap="round"
            opacity={m.arcMouth.opacity}
          />
          {m.gape > 0 ? (
            <>
              <Ellipse cx={128} cy={181 + m.gape * 3} rx={9 * m.gape} ry={7 * m.gape} fill="#5A1F16" />
              <Ellipse cx={128} cy={184 + m.gape * 4} rx={5 * m.gape} ry={4 * m.gape} fill="#C44A3F" />
            </>
          ) : null}
        </>
      )}

      {m.tearOpacity > 0 ? (
        <Path d="M184 116 q0 -14 6 -22 q6 8 6 22 a6 6 0 0 1 -12 0z" fill="#6FB3E6" opacity={m.tearOpacity} />
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
        <Line x1={e.cx - 15} y1={e.cy - 15} x2={e.cx + 15} y2={e.cy + 15} />
        <Line x1={e.cx + 15} y1={e.cy - 15} x2={e.cx - 15} y2={e.cy + 15} />
      </G>
    );
  }
  const px = e.cx + e.look;
  return (
    <G>
      <Circle cx={e.cx} cy={e.cy} r={EYE_R} fill={e.iris} />
      <Circle cx={px} cy={e.cy + 1} r={e.pupilR} fill={e.pupil} opacity={e.pupilOpacity} />
      <Circle cx={px - e.pupilR * 0.35} cy={e.cy - e.pupilR * 0.4} r={e.shine.r} fill="#fff" opacity={e.shine.opacity} />
      <Circle cx={px + e.pupilR * 0.385} cy={e.cy + e.pupilR * 0.36} r={e.shine2.r} fill="#fff" opacity={e.shine2.opacity} />
      <Rect x={e.cx - EYE_R - 2} y={e.cy - EYE_R - 2} width={EYE_R * 2 + 4} height={e.lidHeight} fill={e.lidFill} />
    </G>
  );
}
