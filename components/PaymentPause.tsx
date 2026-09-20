import { View } from "react-native";
import { PauseIcon } from "./icons";

import { Brand, C } from "./console";
import { GhostButton, PrimaryButton } from "./kit";
import { Typography } from "./ui/typography";

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
        <View className="h-14 w-14 items-center justify-center rounded-full bg-warning-subtle">
          <PauseIcon size={26} color={C.amber} />
        </View>
        <Typography type="h2" className="mt-6" style={{ letterSpacing: -0.6, lineHeight: 34 }}>
          {`Paused for\n${app}.`}
        </Typography>
        <Typography type="body-sm" muted className="mt-4 leading-relaxed" style={{ maxWidth: 320 }}>
          {app} does not run while Wilt is on, so Wilt switched itself off when {app} opened.
          Nothing was counted since.
        </Typography>
        <Typography type="body-sm" muted className="mt-3 leading-relaxed" style={{ maxWidth: 320 }}>
          {resumesOnLeave
            ? `Tap below to turn it back on. It also comes back on its own as soon as you leave ${app}.`
            : canAutoResume
              ? "Tap below to turn it back on. It also comes back on its own about four minutes after the pause."
              : "To turn it back on, open Accessibility settings, go to Installed apps (Downloaded apps on some phones), pick Wilt Reel Counter, and switch it on."}
        </Typography>
      </View>
      <PrimaryButton onPress={onResume}>
        {canAutoResume ? "Turn Wilt back on" : "Open accessibility settings"}
      </PrimaryButton>
      <GhostButton className="mt-2" onPress={onDismiss}>
        Leave it off for now
      </GhostButton>
    </View>
  );
}
