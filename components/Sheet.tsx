import { useRef, type ReactNode } from "react";
import { Animated as RNAnimated, Modal, PanResponder, Pressable, View } from "react-native";
import Animated, { SlideInDown } from "react-native-reanimated";

/**
 * The one bottom sheet. Slides up over a dimmed backdrop and goes away three
 * ways: the sheet's own buttons, a tap on the backdrop (unless the caller
 * wants that friction kept), and a downward swipe anywhere on the card. The
 * swipe follows the finger and either snaps back or slides out, then calls
 * [onDismiss], so a sheet can never be left half-open.
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
  const y = useRef(new RNAnimated.Value(0)).current;
  // The responder is created once; read the latest callback through a ref.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) y.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 || g.vy > 0.9) {
          RNAnimated.timing(y, { toValue: 700, duration: 180, useNativeDriver: true }).start(() => {
            y.setValue(0);
            dismissRef.current();
          });
        } else {
          RNAnimated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
      onPanResponderTerminate: () => {
        RNAnimated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      },
    }),
  ).current;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable
        className="flex-1 justify-end bg-black/60 p-4"
        onPress={dismissOnBackdrop ? onDismiss : undefined}
      >
        <Animated.View entering={SlideInDown.duration(200)}>
          <RNAnimated.View style={{ transform: [{ translateY: y }] }} {...pan.panHandlers}>
            <Pressable onPress={() => {}} className="rounded-[28px] bg-panel px-6 pb-6 pt-3">
              <View className="mb-3 h-1 w-9 self-center rounded-full bg-bone/20" />
              {children}
            </Pressable>
          </RNAnimated.View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
