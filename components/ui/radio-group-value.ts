export function requestRadioValueChange(
  currentValue: string | undefined,
  nextValue: string,
  onValueChange: (value: string) => void
) {
  if (currentValue !== nextValue) {
    onValueChange(nextValue);
  }
}
