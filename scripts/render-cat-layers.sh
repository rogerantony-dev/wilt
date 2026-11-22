#!/usr/bin/env bash
# Renders the dressed cat's PNG layers for the accessibility service from
# design-previews/cat-layer.html (drawing in design-previews/cat-figure.js).
# Run from anywhere: bash scripts/render-cat-layers.sh
# Writes plugin/native/res/drawable-nodpi/wilt_fig_*.png (360x619) and wilt_pill_*.png (192x192).
# Base, paws and head come in every fur (wilt_fig_base_<fur>_<stage>); clothes in one version.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="file://$ROOT/design-previews/cat-layer.html"
OUT="$ROOT/plugin/native/res/drawable-nodpi"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
JOBS="${JOBS:-6}"

TOPS="beanie cap flower bow phones party crown halo spidermask batcowl hunterhair"
BODIES="tee hoodie stripes scarf raincoat suit spidersuit batsuit hunterarmour"
BOTTOMS="jeans shorts joggers sneakers tutu spidertights batboots hunterboots"
# Mirrors components/closet.ts ITEMS.fur and FURS in rot-cat.js.
FURS="black ginger grey brown cream white"

[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME" >&2; exit 1; }
mkdir -p "$OUT"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# One job per line: <out name> <box> <layer> <item> <fur>; stages are added below.
# The paws layer is drawn for a sleeved body item, so it renders with item=tee.
{
  for f in $FURS; do
    echo "wilt_fig_base_$f figure base none $f"
    echo "wilt_fig_paws_$f figure paws tee $f"
    echo "wilt_fig_head_$f figure head none $f"
    echo "wilt_pill_head_$f pill head none $f"
  done
  for i in $TOPS; do echo "wilt_fig_top_$i figure top $i black"; done
  for i in $BODIES; do echo "wilt_fig_body_$i figure body $i black"; done
  for i in $BOTTOMS; do echo "wilt_fig_bottom_$i figure bottom $i black"; done
  for i in $TOPS; do echo "wilt_pill_top_$i pill top $i black"; done
} | while read -r name box layer item fur; do
  for s in 1 2 3 4 5 6; do echo "${name}_$s $box $layer $item $s $fur"; done
done > "$WORK/jobs"

render() { # name box layer item stage fur
  local name=$1 box=$2 layer=$3 item=$4 stage=$5 fur=$6 size=360,619
  [ "$box" = pill ] && size=192,192
  local prof="$WORK/prof-$name"
  "$CHROME" --headless=new --hide-scrollbars --disable-gpu --allow-file-access-from-files \
    --user-data-dir="$prof" --default-background-color=00000000 --window-size="$size" \
    --screenshot="$OUT/$name.png" "$PAGE?layer=$layer&item=$item&stage=$stage&box=$box&fur=$fur" >/dev/null 2>&1
  rm -rf "$prof"
  [ -s "$OUT/$name.png" ] || { echo "failed: $name" >&2; return 1; }
}
export -f render
export CHROME PAGE OUT WORK

# Clear old renders first so a renamed or dropped item leaves no stale file.
rm -f "$OUT"/wilt_fig_*.png "$OUT"/wilt_pill_*.png
xargs -P "$JOBS" -L 1 bash -c 'render "$@"' _ < "$WORK/jobs"

COUNT=$(find "$OUT" -maxdepth 1 \( -name 'wilt_fig_*.png' -o -name 'wilt_pill_*.png' \) | wc -l | tr -d ' ')
echo "Wrote $COUNT files to ${OUT#"$ROOT"/} (expected $(wc -l < "$WORK/jobs" | tr -d ' '))."
[ "$COUNT" -eq "$(wc -l < "$WORK/jobs" | tr -d ' ')" ]
