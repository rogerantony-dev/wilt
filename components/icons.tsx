/**
 * Wilt's icons, from the Hugeicons set PanelUI ships. One stroke weight, one
 * size scale, so the glyphs read as a family instead of a mix of libraries.
 */
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react-native";
import HgStopWatch from "@hugeicons/core-free-icons/StopWatchIcon";
import HgShield from "@hugeicons/core-free-icons/Shield01Icon";
import HgPaw from "@hugeicons/core-free-icons/PawPrintIcon";
import HgChart from "@hugeicons/core-free-icons/ChartColumnIcon";
import HgArrowDown from "@hugeicons/core-free-icons/ArrowDown01Icon";
import HgArrowRight from "@hugeicons/core-free-icons/ArrowRight01Icon";
import HgPlus from "@hugeicons/core-free-icons/PlusSignIcon";
import HgLock from "@hugeicons/core-free-icons/SquareLock02Icon";
import HgHourglass from "@hugeicons/core-free-icons/HourglassIcon";
import HgMoon from "@hugeicons/core-free-icons/Moon02Icon";
import HgFire from "@hugeicons/core-free-icons/Fire02Icon";
import HgPause from "@hugeicons/core-free-icons/PauseIcon";
import HgTick from "@hugeicons/core-free-icons/Tick02Icon";
import HgTickCircle from "@hugeicons/core-free-icons/CheckmarkCircle02Icon";
import HgGithub from "@hugeicons/core-free-icons/Github01Icon";
import HgLinkOut from "@hugeicons/core-free-icons/LinkSquare01Icon";
import HgSparkles from "@hugeicons/core-free-icons/SparklesIcon";

export type IconProps = { size?: number; color?: string; strokeWidth?: number };

function make(glyph: IconSvgElement, defaultSize = 18) {
  return function Icon({ size = defaultSize, color = "#F2F1EC", strokeWidth = 1.8 }: IconProps) {
    return <HugeiconsIcon icon={glyph} size={size} color={color} strokeWidth={strokeWidth} />;
  };
}

export const StopwatchIcon = make(HgStopWatch);
export const ShieldIcon = make(HgShield);
export const PawIcon = make(HgPaw);
export const ChartIcon = make(HgChart);
export const ChevronDownIcon = make(HgArrowDown, 14);
export const ChevronRightIcon = make(HgArrowRight, 14);
export const PlusIcon = make(HgPlus, 16);
export const LockIcon = make(HgLock);
export const HourglassIcon = make(HgHourglass);
export const MoonIcon = make(HgMoon);
export const FlameIcon = make(HgFire);
export const PauseIcon = make(HgPause);
export const TickIcon = make(HgTick, 12);
export const TickCircleIcon = make(HgTickCircle, 14);
export const GithubIcon = make(HgGithub, 13);
export const LinkOutIcon = make(HgLinkOut, 11);
export const SparklesIcon = make(HgSparkles);
