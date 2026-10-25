import { View } from "react-native";
import { FlameIcon } from "./icons";

import { C, Kicker } from "./console";
import { Sheet } from "./Sheet";
import { AccentButton, GhostButton, GLASS } from "./kit";
import { Typography } from "./ui/typography";

function fmtLimit(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Celebratory beat for a streak milestone, with the offer to lower the limit. */
export function MilestoneModal({
  visible,
  streak,
  levelDown,
  onAcceptLevelDown,
  onDismiss,
}: {
  visible: boolean;
  kind: "streak" | null;
  streak: number;
  levelDown: { from: number; to: number } | null;
  onAcceptLevelDown: () => void;
  onDismiss: () => void;
}) {
  return (
    <Sheet visible={visible} onDismiss={onDismiss}>
      <View className="gap-5">
        <View className="gap-2">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-success-subtle">
            <FlameIcon size={30} color={C.toxic} />
          </View>
          <Kicker color={C.toxic} style={{ marginTop: 8 }}>
            Streak milestone
          </Kicker>
          <Typography type="h3" style={{ letterSpacing: -0.5 }}>
            {streak} days clean.
          </Typography>
          <Typography type="body-sm" muted className="leading-6">
            A full week under your limit. That is a real habit forming.
          </Typography>
        </View>

        {levelDown ? (
          <View className="gap-2.5">
            <View className="rounded-2xl p-3.5" style={GLASS}>
              <Typography type="body-sm" className="leading-6">
                Ready for less? Drop your limit from {fmtLimit(levelDown.from)} to {fmtLimit(levelDown.to)} and
                earn more per clean day.
              </Typography>
            </View>
            <AccentButton onPress={onAcceptLevelDown}>Lower to {fmtLimit(levelDown.to)}</AccentButton>
            <GhostButton onPress={onDismiss}>Keep {fmtLimit(levelDown.from)} for now</GhostButton>
          </View>
        ) : (
          <AccentButton onPress={onDismiss}>Nice</AccentButton>
        )}
      </View>
    </Sheet>
  );
}
