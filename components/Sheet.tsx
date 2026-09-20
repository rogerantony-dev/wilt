import type { ReactNode } from "react";

import { BottomSheet } from "./ui/bottom-sheet";
import { HAIRLINE, SHEET_BG } from "./kit";

/**
 * The one small bottom sheet, on PanelUI's BottomSheet. Slides up over a
 * dimmed backdrop and goes away three ways: the sheet's own buttons, a tap on
 * the backdrop (unless the caller wants that friction kept), and a downward
 * drag or flick on the card. Content mounts only while open, so each opening
 * plays its entrance.
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
    <BottomSheet
      open={visible}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <BottomSheet.Content
        dismissible={dismissOnBackdrop}
        showClose={false}
        className="rounded-t-[28px] px-6 pb-6"
        style={{ backgroundColor: SHEET_BG, borderTopWidth: 1, borderTopColor: HAIRLINE }}
      >
        {children}
      </BottomSheet.Content>
    </BottomSheet>
  );
}
