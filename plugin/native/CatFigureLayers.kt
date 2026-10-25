package com.rogerantony.wilt

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView

/**
 * The dressed cat, drawn natively from stacked PNG layers so the pill, the
 * block cover, the nudge sheet and the widget dress it the way the app does
 * (components/CatFigure.tsx and CatHead.tsx). Every layer of a set shares one
 * box, so they stack at the same bounds with FIT_CENTER.
 *
 * Figure (viewBox 0 -40 256 440): base, bottom, body, head, top, bottom to top.
 * Pill head (viewBox -8 -40 272 272): head, top.
 * Stages are CatDecay.stage (1 fresh .. 6 gone). "none" has no drawable, and
 * any id without one (a renamed item, an old build) resolves to 0 and hides
 * that layer, so a stale outfit draws bare rather than broken.
 */
object CatFigureLayers {

    private val FIGURE_SLOTS = listOf("base", "bottom", "body", "head", "top")
    // The widget can render off the main thread, so the cache must be thread-safe.
    private val ids = java.util.concurrent.ConcurrentHashMap<String, Int>()

    /** Drawable id for [name], 0 when there is no such drawable. Cached. */
    fun res(context: Context, name: String): Int =
        ids.getOrPut(name) { context.resources.getIdentifier(name, "drawable", context.packageName) }

    private fun clamp(stage: Int) = stage.coerceIn(1, 6)

    private fun itemName(prefix: String, slot: String, id: String?, stage: Int): String? =
        if (id == null || id == "none") null else "${prefix}_${slot}_${id}_$stage"

    private fun stack(context: Context, count: Int): FrameLayout = FrameLayout(context).apply {
        repeat(count) {
            addView(
                ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER },
                FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            )
        }
    }

    /** Point layer [index] of [view] at drawable [name]; hidden when it has none. */
    private fun setLayer(view: FrameLayout, index: Int, name: String?) {
        val image = view.getChildAt(index) as? ImageView ?: return
        val id = if (name == null) 0 else res(view.context, name)
        if (id == 0) {
            image.visibility = View.GONE
            return
        }
        image.visibility = View.VISIBLE
        // render() runs every second; only decode when the layer actually changes.
        if (image.tag != id) {
            image.setImageResource(id)
            image.tag = id
        }
    }

    /** The whole cat: five stacked layers. Bind with [bind]. */
    fun figure(context: Context): FrameLayout = stack(context, FIGURE_SLOTS.size)

    fun bind(view: FrameLayout, stage: Int, outfit: Map<String, String>) {
        val s = clamp(stage)
        FIGURE_SLOTS.forEachIndexed { i, slot ->
            val name = when (slot) {
                "base", "head" -> "wilt_fig_${slot}_$s"
                else -> itemName("wilt_fig", slot, outfit[slot], s)
            }
            setLayer(view, i, name)
        }
    }

    /** The pill's head: the face and the worn top. Bind with [bindPill]. */
    fun pillHead(context: Context): FrameLayout = stack(context, 2)

    fun bindPill(view: FrameLayout, stage: Int, top: String?) {
        val s = clamp(stage)
        setLayer(view, 0, "wilt_pill_head_$s")
        setLayer(view, 1, itemName("wilt_pill", "top", top, s))
    }

    /**
     * The pill head flattened into one bitmap for the widget (RemoteViews takes
     * a single image). Decoded unscaled at the PNGs' own 192 px.
     */
    fun pillBitmap(context: Context, stage: Int, top: String?): Bitmap {
        val s = clamp(stage)
        val opts = BitmapFactory.Options().apply { inScaled = false }
        val layers = listOfNotNull("wilt_pill_head_$s", itemName("wilt_pill", "top", top, s))
            .map { res(context, it) }
            .filter { it != 0 }
            .mapNotNull { BitmapFactory.decodeResource(context.resources, it, opts) }
        val size = layers.firstOrNull()?.width ?: 192
        val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        for (layer in layers) {
            canvas.drawBitmap(layer, null, android.graphics.Rect(0, 0, size, size), null)
            layer.recycle()
        }
        return out
    }
}
