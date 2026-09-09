import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, Kicker } from "./console";
import { Sheet } from "./Sheet";

function fmtLimit(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Full-screen celebratory beat for a streak milestone or a batch of cat unlocks. */
export function MilestoneModal({
  visible,
  kind,
  streak,
  unlockedCats,
  levelDown,
  onAcceptLevelDown,
  onDismiss,
}: {
  visible: boolean;
  kind: "streak" | "cats" | null;
  streak: number;
  unlockedCats: number;
  levelDown: { from: number; to: number } | null;
  onAcceptLevelDown: () => void;
  onDismiss: () => void;
}) {
  const title =
    kind === "streak"
      ? `${streak} days clean.`
      : unlockedCats === 1
        ? "New cat unlocked."
        : "New cats unlocked.";
  const body =
    kind === "streak"
      ? "A full week under your limit. That is a real habit forming."
      : "Your points earned you something better to look at than reels.";

  return (
    <Sheet visible={visible} onDismiss={onDismiss}>
          <View className="gap-5">
            <View className="gap-2">
              <View
                className="h-[64px] w-[64px] items-center justify-center rounded-full"
                style={{ backgroundColor: "rgba(56,199,134,0.14)" }}
              >
                <Ionicons name={kind === "streak" ? "flame" : "paw"} size={30} color={C.toxic} />
              </View>
              <Kicker color={C.toxic} style={{ marginTop: 8 }}>
                {kind === "streak" ? "Streak milestone" : "Reward"}
              </Kicker>
              <Text className="text-[26px] font-semibold text-bone" style={{ letterSpacing: -0.5 }}>
                {title}
              </Text>
              <Text className="text-[14.5px] leading-6 text-ash">{body}</Text>
            </View>

            {levelDown ? (
              <View className="gap-2.5">
                <Text className="text-[14.5px] leading-6 text-bone">
                  Ready for less? Drop your limit from {fmtLimit(levelDown.from)} to{" "}
                  {fmtLimit(levelDown.to)} and earn more per clean day.
                </Text>
                <Pressable
                  onPress={onAcceptLevelDown}
                  className="items-center rounded-2xl bg-toxic py-4 active:opacity-80"
                >
                  <Text className="text-[15.5px] font-semibold text-ink">
                    Lower to {fmtLimit(levelDown.to)}
                  </Text>
                </Pressable>
                <Pressable onPress={onDismiss} className="items-center rounded-2xl py-3 active:opacity-60">
                  <Text className="text-[15px] font-medium text-dim">
                    Keep {fmtLimit(levelDown.from)} for now
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={onDismiss}
                className="items-center rounded-2xl bg-toxic py-4 active:opacity-80"
              >
                <Text className="text-[15.5px] font-semibold text-ink">Nice</Text>
              </Pressable>
            )}
          </View>
    </Sheet>
  );
}
