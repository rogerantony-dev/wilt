import type { ReactNode } from "react";
import { Animated, Modal, Pressable, View } from "react-native";

import { useSwipeToDismiss } from "./useSwipeToDismiss";

/**
 * The one small bottom sheet. Slides up over a dimmed backdrop and goes away
 * three ways: the sheet's own buttons, a tap on the backdrop (unless the
 * caller wants that friction kept), and a downward swipe anywhere on the
 * card. The swipe follows the finger and either snaps back or slides out,
 * then calls [onDismiss], so a sheet can never be left half-open.
 */
export function Sheet({
  visible,
  onDismiss,
  dismissOnBackdrop = true,
  children,
}: {
  visible: boolean;
  onDismiss: () => void;
  dismissOnBackdrop?: boolean;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable
        className="flex-1 justify-end bg-black/60 p-4"
        onPress={dismissOnBackdrop ? onDismiss : undefined}
      >
        <Card onDismiss={onDismiss}>{children}</Card>
      </Pressable>
    </Modal>
  );
}

// Mounted only while the modal is open, so the slide-in runs on every open.
function Card({ onDismiss, children }: { onDismiss: () => void; children: ReactNode }) {
  // grabFraction 1: the whole card is a handle.
  const { translateY, panHandlers } = useSwipeToDismiss(onDismiss, { grabFraction: 1 });
  return (
    <Animated.View {...panHandlers} style={{ transform: [{ translateY }] }}>
      <Pressable onPress={() => {}} className="rounded-[28px] bg-panel px-6 pb-6 pt-3">
        <View className="mb-3 h-1 w-9 self-center rounded-full bg-bone/20" />
        {children}
      </Pressable>
    </Animated.View>
  );
}
