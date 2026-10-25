import { useState } from "react";
import { Pressable, View } from "react-native";

import { CatFigure } from "./CatFigure";
import { canBuy, findItem, isOwned, ITEMS, normalizeOutfit, SLOTS, type Item, type Outfit, type Slot } from "./closet";
import { C, Kicker, Segmented } from "./console";
import { GoldCoin } from "./GoldCoin";
import { AccentButton, GLASS, GlassButton, HAIRLINE } from "./kit";
import { SheetHeader, SheetScrollView, TallSheet } from "./TallSheet";
import { Text } from "./ui/text";
import { Typography } from "./ui/typography";
import { buyItem, wearItem } from "../modules/wiltnative";
import { feel } from "../lib/haptics";

/** The closet always shows the cat fresh, so the clothes read clearly. */
const FRESH = 0.02;
const GAP = 8;
const TABULAR = { fontVariant: ["tabular-nums" as const] };

const TABS: { key: Slot; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "body", label: "Body" },
  { key: "bottom", label: "Bottom" },
];

/** Each slot's tile crops the figure to where that slot's item sits. */
const CROP: Record<Slot, string> = {
  top: "0 -36 256 260",
  body: "40 176 176 180",
  bottom: "50 280 156 110",
};

/**
 * The closet: dress the cat in what it owns, try on what it doesn't, and buy
 * that with coins. Wearing and buying go straight to native prefs; [onChanged]
 * asks the parent to read status again so balance, outfit and owned catch up.
 */
export function ClosetSheet({
  visible,
  onClose,
  outfit,
  owned,
  balance,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  outfit: Outfit;
  owned: string[];
  balance: number;
  onChanged: () => void;
}) {
  return (
    <TallSheet visible={visible} onClose={onClose}>
      {/* Mounted per open (TallSheet unmounts its children on close), so the
          tab and any try-on start fresh each time. */}
      <Closet outfit={outfit} owned={owned} balance={balance} onChanged={onChanged} />
    </TallSheet>
  );
}

function Closet({
  outfit: rawOutfit,
  owned,
  balance,
  onChanged,
}: {
  outfit: Outfit;
  owned: string[];
  balance: number;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Slot>("top");
  const [tryOn, setTryOn] = useState<Partial<Record<Slot, string>>>({});
  // Measured: three tiles one pixel too wide wrap the grid to two columns.
  const [gridW, setGridW] = useState(0);
  const tileW = Math.floor((gridW - GAP * 2) / 3);

  const outfit = normalizeOutfit(rawOutfit, owned);
  // A try-on only counts while the item is still locked; once bought it is worn.
  const trying = (slot: Slot): Item | undefined => {
    const id = tryOn[slot];
    return id && !isOwned(owned, slot, id) ? findItem(slot, id) : undefined;
  };
  const shown: Outfit = { ...outfit };
  for (const slot of SLOTS) {
    const item = trying(slot);
    if (item) shown[slot] = item.id;
  }
  const tried = trying(tab);

  const press = (item: Item) => {
    feel("tap");
    if (isOwned(owned, tab, item.id)) {
      wearItem(tab, item.id);
      setTryOn((prev) => ({ ...prev, [tab]: undefined }));
      onChanged();
    } else {
      setTryOn((prev) => ({ ...prev, [tab]: prev[tab] === item.id ? undefined : item.id }));
    }
  };

  const buy = (item: Item) => {
    if (buyItem(tab, item.id, balance)) {
      setTryOn((prev) => ({ ...prev, [tab]: undefined }));
      onChanged();
    }
  };

  return (
    <>
      <SheetHeader style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <View className="items-center justify-end" style={{ height: 150 }}>
          <CatFigure t={FRESH} outfit={shown} clipId="closet-preview" width={86} height={140} viewBox="0 -30 256 420" />
        </View>
        <View
          className="absolute flex-row items-center gap-1.5"
          style={{ top: 6, right: 20 }}
          accessible
          accessibilityLabel={`${balance} coins`}
        >
          <GoldCoin size={17} />
          <Text size="sm" weight="bold" style={TABULAR}>
            {balance.toLocaleString()}
          </Text>
        </View>

        <View className="mt-2 gap-1.5">
          <Kicker>Your cat</Kicker>
          <Typography type="h3" style={{ letterSpacing: -0.5 }}>
            Dress it up.
          </Typography>
          <Typography type="body-sm" muted className="leading-6">
            It wears this everywhere: home, the pill, and the block screen. It still wilts in it.
          </Typography>
        </View>

        <View className="mt-4">
          <Segmented options={TABS} value={tab} onChange={setTab} />
        </View>
      </SheetHeader>

      <SheetScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16 }}>
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}
          onLayout={(e) => setGridW(e.nativeEvent.layout.width)}
        >
          {tileW > 0
            ? ITEMS[tab].map((item) => (
                <Tile
                  key={`${tab}-${item.id}`}
                  item={item}
                  width={tileW}
                  worn={outfit[tab] === item.id}
                  locked={!isOwned(owned, tab, item.id)}
                  trying={tried?.id === item.id}
                  onPress={() => press(item)}
                />
              ))
            : null}
        </View>
      </SheetScrollView>

      {tried ? (
        <View
          className="flex-row items-center gap-3 px-6 pt-3"
          style={{ borderTopWidth: 1, borderTopColor: HAIRLINE }}
        >
          <View className="flex-1 gap-0.5">
            <Text size="base" weight="semibold" numberOfLines={1}>
              {tried.name}
            </Text>
            <View className="flex-row items-center gap-1">
              <GoldCoin size={14} />
              <Text size="xs" muted style={TABULAR}>
                {`${tried.price} coins`}
              </Text>
            </View>
          </View>
          {canBuy(balance, owned, tab, tried.id) ? (
            <AccentButton className="w-auto px-7" onPress={() => buy(tried)}>
              Buy
            </AccentButton>
          ) : (
            <GlassButton className="w-auto px-5" disabled>
              {`${Math.max(0, tried.price - balance)} more to go`}
            </GlassButton>
          )}
        </View>
      ) : null}
    </>
  );
}

/** One item, drawn on the cat and cropped to its slot. */
function Tile({
  item,
  width,
  worn,
  locked,
  trying,
  onPress,
}: {
  item: Item;
  width: number;
  worn: boolean;
  locked: boolean;
  trying: boolean;
  onPress: () => void;
}) {
  const height = Math.round(width * 1.08);
  const ring = worn ? C.toxic : trying ? C.bone : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={locked ? `${item.name}, ${item.price} coins` : item.name}
      accessibilityState={{ selected: worn }}
      onPress={onPress}
      className="items-center justify-end active:opacity-80"
      style={[
        GLASS,
        { width, height, borderRadius: 16, paddingHorizontal: 4, paddingTop: 4, paddingBottom: 7 },
        ring ? { borderColor: ring, borderWidth: 1.5 } : null,
      ]}
    >
      <View style={locked ? { opacity: 0.45 } : undefined}>
        <CatFigure
          t={FRESH}
          outfit={{ top: "none", body: "none", bottom: "none", [item.slot]: item.id }}
          clipId={`closet-${item.slot}-${item.id}`}
          width={width - 10}
          height={Math.round(height * 0.72)}
          headOnly={item.slot === "top"}
          viewBox={CROP[item.slot]}
        />
      </View>
      <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, color: worn ? C.bone : C.ash }}>
        {item.name}
      </Text>

      {worn ? (
        <View
          style={{ position: "absolute", top: 7, right: 7, width: 7, height: 7, borderRadius: 4, backgroundColor: C.toxic }}
        />
      ) : null}
      {locked ? (
        <View
          className="absolute flex-row items-center rounded-full"
          style={{ top: 6, left: 6, gap: 3, paddingVertical: 2, paddingLeft: 4, paddingRight: 6, backgroundColor: "rgba(13,13,12,0.6)" }}
        >
          <GoldCoin size={12} />
          <Text weight="bold" style={[{ fontSize: 10, lineHeight: 13, color: C.ash }, TABULAR]}>
            {item.price}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
