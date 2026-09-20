import { type ReactNode } from "react";
import { View, type TextProps } from "react-native";

import { Text } from "./ui/text";
import { Tabs } from "./ui/tabs";
import { Progress } from "./ui/progress";
import { GLASS } from "./kit";

/**
 * Shared building blocks for Wilt's "Quiet" look — minimal and dark-first.
 * Near-black canvas, warm off-white text, generous whitespace, and a single
 * green accent used only where it carries meaning (service on, blocked/safe,
 * enabled, improving). Built on PanelUI primitives; the palette lives in
 * global.css as PanelUI's tokens repointed to these values.
 */

// Hex mirrors of the CSS tokens, for inline styles + icon colors.
export const C = {
  ink: "#0D0D0C",
  ink2: "#141413",
  panel: "#1A1A18",
  panelhi: "#2C2C29",
  bone: "#F2F1EC",
  ash: "#9A9A92",
  dim: "#62625B",
  // Single green accent (token names kept for continuity).
  ember: "#38C786",
  emberdeep: "#2E9466",
  amber: "#F5A524",
  toxic: "#38C786",
  toxicdeep: "#0E3D29",
} as const;

/** Wordmark with a status dot — green when the service is live, dim otherwise. */
export function Brand({ on = true }: { on?: boolean }) {
  return (
    <View className="flex-row items-center gap-2.5">
      <View className={`h-[7px] w-[7px] rounded-full ${on ? "bg-success" : "bg-dim"}`} />
      <Text size="base" weight="semibold" style={{ letterSpacing: -0.2 }}>
        Wilt
      </Text>
    </View>
  );
}

/** Quiet uppercase caption — the label voice. Defaults to the dim label color. */
export function Kicker({
  children,
  color = C.dim,
  style,
  ...rest
}: TextProps & { children: ReactNode; color?: string }) {
  return (
    <Text
      {...rest}
      size="xs"
      weight="semibold"
      className="uppercase"
      style={[{ letterSpacing: 1.1, color }, style]}
    >
      {children}
    </Text>
  );
}

/** A flat segmented control on PanelUI's Tabs: the active cell lifts, the rest stay quiet. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <Tabs value={value} defaultValue={value} onValueChange={(v) => onChange(v as T)} variant="segmented">
      <Tabs.List className="rounded-[16px] p-1" style={GLASS} indicatorClassName="rounded-[12px] bg-bone/10">
        {options.map((o) => (
          <Tabs.Trigger key={o.key} value={o.key} className="rounded-[12px] py-2.5">
            {o.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs>
  );
}

/** Thin baseline track with a faint marker — the only chart on the dashboard. */
export function Track({ value, marker = 0.75 }: { value: number; marker?: number }) {
  const pct = Math.round(Math.min(1, Math.max(0.03, value)) * 100);
  return (
    <View>
      <Progress value={pct} className="h-[3px]" indicatorClassName="bg-foreground" />
      <View
        className="absolute w-[1.5px] bg-dim"
        style={{ left: `${Math.round(marker * 100)}%`, top: -3, bottom: -3 }}
      />
    </View>
  );
}
