import { type ComponentProps, type ReactNode } from "react";
import { View, type ViewProps } from "react-native";

import { BottomSheet } from "./ui/bottom-sheet";
import { HAIRLINE, SHEET_BG } from "./kit";
import { AmbientField } from "./AmbientField";
import { C } from "./console";

/**
 * The tall bottom sheet behind the Cats and History screens, on PanelUI's
 * BottomSheet: the body scrolls while it has room, a downward drag at its top
 * (or on the header) pulls the sheet, and letting go past the threshold or a
 * flick closes it. Backdrop tap closes too. Driven by [visible]; [onClose]
 * fires when the sheet is dismissed from any of those routes.
 *
 * Children mount when the sheet opens and unmount once it has closed, so a
 * screen that reads data on mount reads it fresh each time.
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
    <BottomSheet
      open={visible}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <BottomSheet.Content
        size="full"
        showClose={false}
        className="overflow-hidden rounded-t-[28px] px-0"
        style={{ backgroundColor: SHEET_BG, borderTopWidth: 1, borderTopColor: HAIRLINE }}
      >
        {/* The same field as the home screen, so the sheet's glass has
            something to be glass over. */}
        <AmbientField color={C.toxic} level={0.25} />
        {children}
      </BottomSheet.Content>
    </BottomSheet>
  );
}

/** The header of a [TallSheet]; a plain View, dragging it moves the sheet. */
export function SheetHeader(props: ViewProps) {
  return <View {...props} />;
}

/** The scrolling body of a [TallSheet], coordinated with the sheet's gesture. */
export function SheetScrollView({
  children,
  ...rest
}: Omit<ComponentProps<typeof BottomSheet.Body>, "children"> & { children: ReactNode }) {
  return <BottomSheet.Body {...rest}>{children}</BottomSheet.Body>;
}
