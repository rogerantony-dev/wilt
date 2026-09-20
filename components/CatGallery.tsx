import { useState } from "react";
import { Image, View } from "react-native";
import { LockIcon } from "./icons";

import { CATS } from "./cats";
import { C } from "./console";
import { SheetHeader, SheetScrollView, TallSheet } from "./TallSheet";
import { Badge } from "./ui/badge";
import { EmptyState } from "./ui/empty-state";
import { GLASS } from "./kit";
import { Typography } from "./ui/typography";

const GAP = 12;
const PAGE_PADDING = 20;

/** A full-screen gallery of cat pictures: a healthier thing to scroll than reels. */
export function CatGallery({
  visible,
  onClose,
  unlockedCount,
}: {
  visible: boolean;
  onClose: () => void;
  unlockedCount: number;
}) {
  // Measured rather than taken from the window: the sheet has its own border
  // and padding, and a tile one pixel too wide wraps the grid to one column.
  const [gridW, setGridW] = useState(0);
  const tile = Math.floor((gridW - GAP) / 2);

  return (
    <TallSheet visible={visible} onClose={onClose}>
      <SheetHeader style={{ paddingHorizontal: 24, paddingBottom: 4, paddingTop: 8 }}>
        <View className="mt-1 gap-1.5">
          <Typography type="h3" style={{ letterSpacing: -0.6 }}>
            Cats, not reels
          </Typography>
          <Typography type="body-sm" muted>
            Rest your eyes on something better.
          </Typography>
        </View>
      </SheetHeader>

      {CATS.length === 0 ? (
        <EmptyState className="flex-1">
          <EmptyState.Media variant="icon">
            <Typography type="h1">🐱</Typography>
          </EmptyState.Media>
          <EmptyState.Header>
            <EmptyState.Title>No cats yet</EmptyState.Title>
            <EmptyState.Description>Add some pictures and they'll show up here.</EmptyState.Description>
          </EmptyState.Header>
        </EmptyState>
      ) : (
        <SheetScrollView contentContainerStyle={{ padding: PAGE_PADDING, gap: GAP }}>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}
            onLayout={(e) => setGridW(e.nativeEvent.layout.width)}
          >
            {gridW > 0 ? CATS.map((cat, i) => {
              const unlocked = i < unlockedCount;
              if (unlocked) {
                return (
                  <Image
                    key={i}
                    source={cat.src}
                    style={{ width: tile, height: tile, borderRadius: 18 }}
                    resizeMode="cover"
                  />
                );
              }
              return (
                <View
                  key={i}
                  className="items-center justify-center gap-2 rounded-[18px]"
                  style={[GLASS, { width: tile, height: tile }]}
                >
                  <LockIcon size={20} color={C.dim} />
                  <Badge variant="secondary" className="self-center">{`Unlock at ${cat.unlockAt} pts`}</Badge>
                </View>
              );
            }) : null}
          </View>
        </SheetScrollView>
      )}
    </TallSheet>
  );
}
