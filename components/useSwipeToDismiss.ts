import { useRef } from "react";
import { Animated, Easing, PanResponder, useWindowDimensions } from "react-native";

import { useMountEffect } from "./useMountEffect";

/**
 * Slide-in and swipe-down-to-close for a bottom sheet. Spread [panHandlers]
 * on the sheet view and drive its translateY with [translateY].
 *
 * Call it from the component that mounts when the sheet opens (the Modal's
 * content): the sheet starts below the screen and slides up on mount, and the
 * same value carries the drag, so the two can never fight over the view.
 *
 * A drag is accepted when it starts in the top [grabFraction] of the sheet
 * (a sheet that fills the bottom [heightFraction] of the window) and heads
 * mostly downward. A touch on plain content in that zone is the sheet's from
 * the start; one on a button is the button's first, then taken over in the
 * capture phase once it turns into a drag, and never handed back. Touches
 * that start lower stay with the content, so a list still scrolls.
 */
export function useSwipeToDismiss(
  onClose: () => void,
  { heightFraction = 1, grabFraction = 0.25 }: { heightFraction?: number; grabFraction?: number } = {},
) {
  const { height: screenH } = useWindowDimensions();
  const screenHRef = useRef(screenH);
  screenHRef.current = screenH;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const startY = useRef(0);
  const translateY = useRef(new Animated.Value(0)).current;

  useMountEffect(() => {
    translateY.setValue(screenHRef.current);
    Animated.timing(translateY, {
      toValue: 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  });

  const inGrabZone = (y: number) => {
    const h = screenHRef.current;
    const sheetTop = h * (1 - heightFraction);
    return y < sheetTop + h * heightFraction * grabFraction;
  };
  const shouldGrab = (_: unknown, g: { dy: number; dx: number }) => {
    return inGrabZone(startY.current) && g.dy > 6 && g.dy > Math.abs(g.dx);
  };
  const settle = () => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
  };
  const pan = useRef(
    PanResponder.create({
      // Runs for every touch start (capture phase reaches the sheet first);
      // remembers where the finger landed without claiming anything yet.
      onStartShouldSetPanResponderCapture: (e) => {
        startY.current = e.nativeEvent.pageY;
        return false;
      },
      // Bubble phase, so a button under the finger still claims first. A touch
      // on plain content in the grab zone is ours from the start; one on a
      // button is taken over below once it turns into a drag.
      onStartShouldSetPanResponder: (e) => inGrabZone(e.nativeEvent.pageY),
      onMoveShouldSetPanResponderCapture: shouldGrab,
      onMoveShouldSetPanResponder: shouldGrab,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 0.8) {
          Animated.timing(translateY, {
            toValue: screenHRef.current,
            duration: 200,
            useNativeDriver: true,
          }).start(() => closeRef.current());
        } else {
          settle();
        }
      },
      onPanResponderTerminate: settle,
    }),
  ).current;

  return { translateY, panHandlers: pan.panHandlers };
}
