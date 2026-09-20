/**
 * Wilt's surface and button kit, one place so every screen and sheet reads
 * the same. Four button levels, one height, one radius:
 *   Primary  bone on ink, one per screen (Continue, Raise to 30m)
 *   Accent   green with dark type, the choice the app wants (Keep blocking)
 *   Glass    bone at 6% with a 10% hairline, the secondary surface everywhere
 *   Ghost    dim text, no surface, the quiet way out (I'll give in)
 * Solid panel survives only where something has to read as a track: the
 * island and the slider.
 */
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { Button } from "./ui/button";

export const GLASS = {
  backgroundColor: "rgba(242,241,236,0.06)",
  borderWidth: 1,
  borderColor: "rgba(242,241,236,0.10)",
} as const;

/** The sheet body: one tone above ink, with the same hairline on its top edge. */
export const SHEET_BG = "#161615";
export const HAIRLINE = "rgba(242,241,236,0.10)";
export const SCRIM = "rgba(0,0,0,0.62)";

type ButtonProps = {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  startContent?: ReactNode;
  endContent?: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
};

const LABEL = "text-[16px] font-semibold";

/** Disabled buttons dim to 40%. Done on a wrapper: Uniwind does not compile the
 *  arbitrary opacity class PanelUI's Button uses, and the pressable's own
 *  press animation owns the button's opacity. */
function Dim({ disabled, children }: { disabled?: boolean; children: ReactNode }) {
  return <View style={disabled ? { opacity: 0.4 } : undefined}>{children}</View>;
}

export function PrimaryButton({ className = "", disabled, ...rest }: ButtonProps) {
  return (
    <Dim disabled={disabled}>
      <Button size="xl" fullWidth className={`rounded-2xl ${className}`} labelClassName={LABEL} disabled={disabled} {...rest} />
    </Dim>
  );
}

export function AccentButton({ className = "", disabled, ...rest }: ButtonProps) {
  return (
    <Dim disabled={disabled}>
      <Button
        size="xl"
        fullWidth
        className={`rounded-2xl border-success bg-success ${className}`}
        labelClassName={`${LABEL} text-ink`}
        disabled={disabled}
        {...rest}
      />
    </Dim>
  );
}

export function GlassButton({ className = "", style, ...rest }: ButtonProps) {
  return (
    <Button
      variant="secondary"
      size="xl"
      fullWidth
      className={`rounded-2xl ${className}`}
      style={[GLASS, style]}
      labelClassName={LABEL}
      {...rest}
    />
  );
}

export function GhostButton({ className = "", ...rest }: ButtonProps) {
  return (
    <Button
      variant="ghost"
      size="md"
      fullWidth
      className={`rounded-2xl ${className}`}
      labelClassName="text-[15px] font-medium text-dim"
      {...rest}
    />
  );
}
