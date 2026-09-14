import { useEffect } from "react";

/** Runs once on mount; the returned cleanup runs on unmount. Views never call useEffect raw. */
export function useMountEffect(effect: () => void | (() => void)) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
}
