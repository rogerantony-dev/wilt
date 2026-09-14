import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Brand, C } from "./console";

/**
 * Shown in place of the dashboard when the accessibility service switched
 * itself off for a payment app. Those apps (Paytm and friends) refuse to pay
 * while any third-party accessibility service is enabled, so the service
 * disables itself the moment one comes to the front. Android gives an app no
 * way to turn its own service back on, so this screen is the hand-off: one
 * tap to the right settings entry. On a phone where the app was granted
 * WRITE_SECURE_SETTINGS over adb the same tap resumes directly.
 */
export function PaymentPauseScreen({
  app,
  canAutoResume,
  resumesOnLeave,
  onResume,
  onDismiss,
}: {
  app: string;
  canAutoResume: boolean;
  resumesOnLeave: boolean;
  onResume: () => void;
  onDismiss: () => void;
}) {
  return (
    <View className="grow px-6 pb-7 pt-4">
      <Brand on={false} />
      <View className="flex-1 justify-center">
        <View
          className="h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(245,165,36,0.14)" }}
        >
          <Ionicons name="pause" size={26} color={C.amber} />
        </View>
        <Text
          className="mt-6 text-[30px] font-semibold text-bone"
          style={{ letterSpacing: -0.6, lineHeight: 34 }}
        >
          {`Paused for\n${app}.`}
        </Text>
        <Text className="mt-4 text-[15px] leading-relaxed text-ash" style={{ maxWidth: 320 }}>
          {app} does not run while Wilt is on, so Wilt switched itself off
          when {app} opened. Nothing was counted since.
        </Text>
        <Text className="mt-3 text-[15px] leading-relaxed text-ash" style={{ maxWidth: 320 }}>
          {resumesOnLeave
            ? `Tap below to turn it back on. It also comes back on its own as soon as you leave ${app}.`
            : canAutoResume
              ? "Tap below to turn it back on. It also comes back on its own about four minutes after the pause."
              : "To turn it back on, open Accessibility settings, go to Installed apps (Downloaded apps on some phones), pick Wilt Reel Counter, and switch it on."}
        </Text>
      </View>
      <Pressable
        onPress={onResume}
        className="items-center rounded-2xl bg-bone py-4 active:opacity-80"
      >
        <Text className="text-[16px] font-semibold text-ink">
          {canAutoResume ? "Turn Wilt back on" : "Open accessibility settings"}
        </Text>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={12} className="mt-4 items-center active:opacity-60">
        <Text className="text-[13.5px] font-semibold text-dim">Leave it off for now</Text>
      </Pressable>
    </View>
  );
}
