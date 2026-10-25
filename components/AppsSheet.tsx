import { useState, type ReactNode } from "react";
import { Image, Pressable, View } from "react-native";

import { C, Kicker } from "./console";
import { ChevronRightIcon, InstagramIcon, PlusIcon, YoutubeIcon } from "./icons";
import { feel } from "../lib/haptics";
import { GLASS } from "./kit";
import { SheetHeader, SheetScrollView, TallSheet } from "./TallSheet";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Text } from "./ui/text";
import { Typography } from "./ui/typography";
import { listApps, type WiltApp, type WiltSurface } from "../modules/wiltnative";

const WASTE = "#E0913C";
const DIVIDER = { borderTopWidth: 1, borderTopColor: "rgba(242,241,236,0.06)" } as const;

const GROUPS: { app: string; icon: ReactNode; rows: { key: WiltSurface; label: string }[] }[] = [
  {
    app: "Instagram",
    icon: <InstagramIcon color={C.dim} />,
    rows: [
      { key: "igReels", label: "Reels" },
      { key: "igFeed", label: "Feed" },
      { key: "igStories", label: "Stories" },
      { key: "igDms", label: "DMs" },
    ],
  },
  {
    app: "YouTube",
    icon: <YoutubeIcon color={C.dim} />,
    rows: [
      { key: "ytShorts", label: "Shorts" },
      { key: "ytVideo", label: "Videos" },
    ],
  },
];

/**
 * Which parts of Instagram and YouTube Wilt guards, plus any other app the
 * user added. A switch shows what you asked for; one switched off today stays
 * guarded until midnight and says so.
 *
 * Instagram and YouTube each lead with an "Entire app" switch. It is on
 * exactly when every part below it is (so switching them all on turns it on
 * by itself), and flipping it sets every part at once. Added apps are always
 * guarded whole. With a whole app guarded, Block keeps you out of it entirely
 * and Guilt counts all of your time in it.
 *
 * "Add an app" swaps the sheet's body for the installed-app list rather than
 * stacking a second sheet on top.
 */
export function AppsSheet({
  visible,
  surfaces,
  pendingOff,
  customApps,
  onToggle,
  onAddApp,
  onRemoveApp,
  onClose,
}: {
  visible: boolean;
  surfaces: Partial<Record<WiltSurface, boolean>>;
  pendingOff: WiltSurface[];
  customApps: WiltApp[];
  /** Guard (or queue unguarding) one or more keys at once. */
  onToggle: (keys: WiltSurface[], on: boolean) => void;
  onAddApp: (pkg: string) => void;
  onRemoveApp: (pkg: string) => void;
  onClose: () => void;
}) {
  // null: the main list. "loading": the picker, listing apps. An array: picking.
  const [choices, setChoices] = useState<WiltApp[] | "loading" | null>(null);

  const guardedToday = (key: WiltSurface) => surfaces[key] === true;
  const pending = (key: WiltSurface) => pendingOff.includes(key);

  const close = () => {
    setChoices(null);
    onClose();
  };

  if (choices) {
    return (
      <TallSheet visible={visible} onClose={close}>
        <SheetHeader style={{ paddingHorizontal: 24, paddingBottom: 4, paddingTop: 8 }}>
          <View className="flex-row items-center justify-between">
            <Typography type="h3" style={{ letterSpacing: -0.6 }}>
              Add an app
            </Typography>
            <Button
              variant="ghost"
              size="sm"
              className="-mr-2.5 px-2.5"
              labelClassName="text-[14px] font-semibold text-dim"
              onPress={() => setChoices(null)}
            >
              Done
            </Button>
          </View>
          <Typography type="body-sm" muted className="mt-1.5 leading-snug">
            It's guarded as a whole, from the moment you add it.
          </Typography>
        </SheetHeader>
        <SheetScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 36 }}>
          <View className="mx-6 mt-4 rounded-2xl" style={GLASS}>
            {choices === "loading" || choices.length === 0 ? (
              <Text size="sm" muted className="px-4 py-4">
                {choices === "loading" ? "Finding your apps…" : "No other apps to add."}
              </Text>
            ) : (
              choices.map((app, i) => (
                <Pressable
                  key={app.pkg}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${app.label}`}
                  onPress={() => {
                    feel("confirm");
                    onAddApp(app.pkg);
                    setChoices(null);
                  }}
                  className="flex-row items-center gap-3 px-4 py-3 active:bg-bone/5"
                  style={i > 0 ? DIVIDER : undefined}
                >
                  <AppIcon uri={app.icon} />
                  <Text size="base" weight="medium" className="flex-1" numberOfLines={1}>
                    {app.label}
                  </Text>
                  <PlusIcon color={C.dim} />
                </Pressable>
              ))
            )}
          </View>
        </SheetScrollView>
      </TallSheet>
    );
  }

  return (
    <TallSheet visible={visible} onClose={close}>
      <SheetHeader style={{ paddingHorizontal: 24, paddingBottom: 4, paddingTop: 8 }}>
        <Typography type="h3" style={{ letterSpacing: -0.6 }}>
          Apps
        </Typography>
        <Typography type="body-sm" muted className="mt-1.5 leading-snug">
          What's on counts toward your limit, and gets blocked in Block mode.
        </Typography>
      </SheetHeader>

      <SheetScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 36 }}>
        <View className="px-6">
          {GROUPS.map((group) => {
            const keys = group.rows.map((r) => r.key);
            const wholeToday = keys.every(guardedToday);
            const wholeOn = wholeToday && !keys.some(pending);
            return (
              <View key={group.app} className="mt-5 gap-2">
                <GroupLabel icon={group.icon}>{group.app}</GroupLabel>
                <View className="rounded-2xl" style={GLASS}>
                  <SwitchRow
                    label="Entire app"
                    caption={`All of ${group.app}, not just these parts.`}
                    a11y={`All of ${group.app}`}
                    on={wholeOn}
                    pending={wholeToday && !wholeOn}
                    onChange={(next) => onToggle(keys, next)}
                  />
                  {group.rows.map((row) => (
                    <SwitchRow
                      key={row.key}
                      label={row.label}
                      a11y={`${group.app} ${row.label}`}
                      on={guardedToday(row.key) && !pending(row.key)}
                      pending={pending(row.key)}
                      onChange={(next) => onToggle([row.key], next)}
                      divider
                    />
                  ))}
                </View>
              </View>
            );
          })}

          <View className="mt-5 gap-2">
            <GroupLabel>Other apps</GroupLabel>
            <View className="rounded-2xl" style={GLASS}>
              {customApps.map((app, i) => {
                const key: WiltSurface = `app:${app.pkg}`;
                return (
                  <SwitchRow
                    key={app.pkg}
                    icon={<AppIcon uri={app.icon} />}
                    label={app.label}
                    a11y={app.label}
                    on={guardedToday(key) && !pending(key)}
                    pending={pending(key)}
                    onChange={(next) => onToggle([key], next)}
                    // Only once it is fully off, so removing can't skip the wait.
                    onRemove={guardedToday(key) ? undefined : () => onRemoveApp(app.pkg)}
                    divider={i > 0}
                  />
                );
              })}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  feel("tap");
                  setChoices("loading");
                  // Listing draws every icon; let the picker paint first.
                  setTimeout(() => setChoices(listApps()), 0);
                }}
                className="flex-row items-center gap-3 px-4 py-3.5 active:bg-bone/5"
                style={customApps.length > 0 ? DIVIDER : undefined}
              >
                <View className="h-7 w-7 items-center justify-center rounded-[8px] bg-bone/10">
                  <PlusIcon color={C.bone} />
                </View>
                <Text size="base" weight="medium" className="flex-1">
                  Add an app
                </Text>
                <ChevronRightIcon color={C.dim} />
              </Pressable>
            </View>
          </View>

          <Text size="xs" className="mt-4 leading-snug text-dim">
            Turning one on is instant. Turning one off waits for tomorrow's reset.
          </Text>
        </View>
      </SheetScrollView>
    </TallSheet>
  );
}

function GroupLabel({ icon, children }: { icon?: ReactNode; children: string }) {
  return (
    <View className="flex-row items-center gap-1.5 pl-1">
      {icon}
      <Kicker>{children}</Kicker>
    </View>
  );
}

function AppIcon({ uri }: { uri: string | null }) {
  return uri ? (
    <Image source={{ uri }} style={{ width: 28, height: 28, borderRadius: 7 }} />
  ) : (
    <View className="h-7 w-7 rounded-[8px] bg-bone/10" />
  );
}

/** One switch row. The whole row flips the switch, not just the switch itself. */
function SwitchRow({
  icon,
  label,
  caption,
  a11y,
  on,
  pending,
  onChange,
  onRemove,
  divider = false,
}: {
  icon?: ReactNode;
  label: string;
  caption?: string;
  a11y: string;
  on: boolean;
  pending: boolean;
  onChange: (on: boolean) => void;
  onRemove?: () => void;
  divider?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={a11y}
      onPress={() => {
        feel(on ? "toggleOff" : "toggleOn");
        onChange(!on);
      }}
      className="flex-row items-center gap-3 px-4 py-3 active:bg-bone/5"
      style={divider ? DIVIDER : undefined}
    >
      {icon}
      <View className="flex-1">
        <Text size="base" weight="medium" numberOfLines={1}>
          {label}
        </Text>
        {pending ? (
          <Text size="xs" style={{ color: WASTE }}>
            Still on till midnight
          </Text>
        ) : caption ? (
          <Text size="xs" className="text-dim">
            {caption}
          </Text>
        ) : null}
      </View>
      {onRemove ? (
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          labelClassName="text-[13px] font-semibold text-dim"
          onPress={onRemove}
        >
          Remove
        </Button>
      ) : null}
      <Switch value={on} label={a11y} haptics onValueChange={onChange} />
    </Pressable>
  );
}
