import { useState } from "react";
import { View } from "react-native";

import { Slider } from "./ui/slider";
import { Text } from "./ui/text";
import { LIMIT_OPTIONS } from "./progress";
import { LIMIT_RAMP, limitColor, limitHint } from "./limitramp";

/** Slider size "lg" thumb width, for lining the rung labels up under the thumb. */
const THUMB = 32;

/**
 * The limit ladder on PanelUI's slider: one step per rung, the fill and thumb
 * in the rung's ramp colour, a haptic tick as the finger crosses each step.
 * The rung labels sit under the thumb's resting positions, and small ticks in
 * the track show where those are. Shared by onboarding and the dashboard sheet.
 */
export function LimitSlider({
  value,
  onPick,
  hint = true,
}: {
  value: number;
  onPick: (m: number) => void;
  /** Show the one-line note under the track. */
  hint?: boolean;
}) {
  const n = LIMIT_OPTIONS.length;
  const idx = Math.max(0, LIMIT_OPTIONS.indexOf(value));
  const [w, setW] = useState(0);
  const travel = Math.max(0, w - THUMB);
  const at = (i: number) => THUMB / 2 + (i * travel) / (n - 1);
  const color = limitColor(value);

  return (
    <View>
      <View className="flex-row items-baseline gap-2">
        <Text
          weight="bold"
          style={{ color, fontSize: 54, lineHeight: 56, letterSpacing: -2, fontVariant: ["tabular-nums"] }}
        >
          {value}
        </Text>
        <Text muted size="sm">
          minutes
        </Text>
      </View>
      <View className="mt-3" onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <View>
          <Slider
            value={idx}
            min={0}
            max={n - 1}
            step={1}
            size="lg"
            haptics
            tint={color}
            onValueChange={(i) => {
              const m = LIMIT_OPTIONS[Math.round(i)];
              if (m !== undefined && m !== value) onPick(m);
            }}
          />
          {w > 0
            ? LIMIT_OPTIONS.map((m, i) => (
                <View
                  key={m}
                  pointerEvents="none"
                  className="absolute h-1 w-1 rounded-full"
                  style={{
                    left: at(i) - 2,
                    top: 10,
                    backgroundColor: i <= idx ? "rgba(13,13,12,0.35)" : "rgba(242,241,236,0.25)",
                  }}
                />
              ))
            : null}
        </View>
        <View className="mt-2 h-[18px]">
          {w > 0
            ? LIMIT_OPTIONS.map((m, i) => {
                const on = i === idx;
                return (
                  <Text
                    key={m}
                    size="xs"
                    weight={on ? "semibold" : "normal"}
                    className={on ? "absolute w-8 text-center" : "absolute w-8 text-center text-dim"}
                    style={{ left: at(i) - 16, fontVariant: ["tabular-nums"] }}
                  >
                    {m < 60 ? String(m) : `${m / 60}h`}
                  </Text>
                );
              })
            : null}
        </View>
      </View>
      {hint ? (
        <Text size="xs" className="mt-1.5 text-dim">
          {limitHint(value)}
        </Text>
      ) : null}
      {/* Keep the ramp table referenced so the rung colours stay one source of truth. */}
      {LIMIT_RAMP[value] === undefined ? null : null}
    </View>
  );
}
