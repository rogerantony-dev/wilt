import type { ReactNode } from "react";
import { Animated, Modal, Pressable, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useSwipeToDismiss } from "./useSwipeToDismiss";

/** How much of the window the sheet covers; the rest shows the dimmed home. */
const HEIGHT = 0.85;

/**
 * The tall bottom sheet behind the Cats and History screens. Slides up to
 * cover 85% of the window over a dimmed backdrop, and goes away by a tap on
 * the backdrop, the caller's own close button, or a downward swipe that starts
 * in the top quarter of the sheet (below that, the content scrolls).
 */
export function TallSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <StatusBar style="light" />
      <View className="flex-1 justify-end bg-black/60">
        <Pressable className="flex-1" onPress={onClose} />
        <Body onClose={onClose}>{children}</Body>
      </View>
    </Modal>
  );
}

// Mounted only while the modal is open, so the slide-in runs on every open.
function Body({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const { height } = useWindowDimensions();
  const { translateY, panHandlers } = useSwipeToDismiss(onClose, { heightFraction: HEIGHT });
  return (
    <Animated.View
      {...panHandlers}
      style={{ height: height * HEIGHT, transform: [{ translateY }] }}
      className="overflow-hidden rounded-t-[28px] bg-ink"
    >
      <SafeAreaView className="flex-1" edges={["bottom"]}>
        {children}
      </SafeAreaView>
    </Animated.View>
  );
}
