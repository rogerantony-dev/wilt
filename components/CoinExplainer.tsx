import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { BlurView } from "expo-blur";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { C } from "./console";
import { GoldCoin } from "./GoldCoin";
import { Text } from "./ui/text";
import { feel } from "../lib/haptics";
import { useMountEffect } from "./useMountEffect";

/** Where the tile's coin sits, in page coordinates (`measure`'s pageX and pageY). */
export type CoinOrigin = { x: number; y: number; size: number };

const SIZE = 128;
/** The coin's centre comes to rest this far down the screen. */
const REST_Y = 0.36;
const OPEN = { duration: 520, easing: Easing.bezier(0.2, 0.9, 0.25, 1.12) };
const CLOSE = { duration: 380, easing: Easing.bezier(0.4, 0, 0.2, 1) };
const VEIL_IN = { duration: 280, easing: Easing.out(Easing.quad) };
const TEXT_IN = { duration: 300, easing: Easing.bezier(0.2, 0.9, 0.3, 1) };
const TEXT_OUT = { duration: 200, easing: Easing.out(Easing.quad) };

/**
 * What coins are for, told by the coin itself: the tile's coin flies to the
 * middle of a blurred, dimmed screen, grows and spins once, and two lines
 * explain it. Any tap (or Back) sends it home, and [onClose] fires once it
 * has landed back in the tile.
 */
export function CoinExplainer({
  visible,
  from,
  onClose,
}: {
  visible: boolean;
  from: CoinOrigin | null;
  onClose: () => void;
}) {
  const close = useRef<(() => void) | null>(null);
  return (
    <Modal
      visible={visible && from !== null}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => close.current?.()}
    >
      {visible && from ? <Flight from={from} onClose={onClose} closeRef={close} /> : null}
    </Modal>
  );
}

function Flight({
  from,
  onClose,
  closeRef,
}: {
  from: CoinOrigin;
  onClose: () => void;
  closeRef: { current: (() => void) | null };
}) {
  const [screen, setScreen] = useState<{ w: number; h: number } | null>(null);
  const started = useRef(false);
  const closing = useRef(false);
  // 0 sits on the tile, 1 rests in the middle (the open curve overshoots it).
  const p = useSharedValue(0);
  const veil = useSharedValue(0);
  const text = useSharedValue(0);
  // The coin starts on the tile and rests at [tx, ty]. Worklets read the
  // target directly, so no frame flies to a stale one.
  const fx = from.x + from.size / 2;
  const fy = from.y + from.size / 2;
  const tx = useSharedValue(fx);
  const ty = useSharedValue(fy);
  const k = from.size / SIZE;

  const landed = () => {
    feel("settle");
    onClose();
  };

  const goHome = () => {
    if (closing.current) return;
    closing.current = true;
    text.value = withTiming(0, TEXT_OUT);
    veil.value = withTiming(0, CLOSE);
    // Land even if the flight home was cut short, or the full-screen Modal
    // would stay up with nothing left to close it.
    p.value = withTiming(0, CLOSE, () => {
      runOnJS(landed)();
    });
  };
  closeRef.current = goHome;
  useMountEffect(() => () => {
    closeRef.current = null;
  });

  // The flight starts once this full-screen layer knows its size. Android can
  // lay the window out twice (first inside the system bars, then edge to
  // edge), so the target follows every layout while the flight itself starts
  // only once.
  const onLayout = (e: LayoutChangeEvent) => {
    // A close that began before the first layout must not be undone by the open.
    if (closing.current) return;
    const { width, height } = e.nativeEvent.layout;
    setScreen({ w: width, h: height });
    tx.value = width / 2;
    ty.value = height * REST_Y;
    if (started.current) return;
    started.current = true;
    veil.value = withTiming(1, VEIL_IN);
    p.value = withTiming(1, OPEN);
    text.value = withDelay(260, withTiming(1, TEXT_IN));
  };

  const coinStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: fx + (tx.value - fx) * p.value - SIZE / 2 },
      { translateY: fy + (ty.value - fy) * p.value - SIZE / 2 },
      { scale: k + (1 - k) * p.value },
      { rotate: `${360 * p.value}deg` },
    ],
  }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: text.value,
    transform: [{ translateY: 10 * (1 - text.value) }],
  }));

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onLayout={onLayout}
      onPress={goHome}
      accessibilityRole="button"
      accessibilityLabel="Scroll less, earn up to 50 a day. Spend them on clothes in the Closet."
      accessibilityHint="Tap to close"
    >
      <Animated.View style={[StyleSheet.absoluteFill, veilStyle]} pointerEvents="none">
        <BlurView
          style={StyleSheet.absoluteFill}
          intensity={40}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(13,13,12,0.42)" }]} />
      </Animated.View>

      <Animated.View style={[styles.coin, coinStyle]} pointerEvents="none">
        <GoldCoin size={SIZE} />
      </Animated.View>

      {screen ? (
        <Animated.View
          style={[styles.text, { top: screen.h * REST_Y + SIZE / 2 + 26 }, textStyle]}
          pointerEvents="none"
        >
          <Text weight="semibold" style={styles.line}>
            Scroll less, earn up to 50 a day.
          </Text>
          <Text style={styles.sub}>Spend them on clothes in the Closet.</Text>
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  coin: { position: "absolute", left: 0, top: 0, width: SIZE, height: SIZE },
  text: { position: "absolute", left: 28, right: 28, alignItems: "center" },
  line: { fontSize: 17, lineHeight: 23, letterSpacing: -0.2, color: C.bone, textAlign: "center" },
  sub: { marginTop: 6, fontSize: 14, lineHeight: 20, color: C.ash, textAlign: "center" },
});
