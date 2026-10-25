package com.rogerantony.wilt

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews
import expo.modules.wiltnative.Closet
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Home-screen widget that mirrors the live "today" tally the accessibility
 * service keeps: time wasted on short-form video plus the per-platform reel and
 * short counts. It reads the very same SharedPreferences the service writes
 * ([PREFS]); there is no separate state, so the widget can never disagree with
 * the in-app dashboard or the floating pill.
 *
 * The Android widget framework only refreshes on its own at most every 30 min,
 * which is far too coarse for a live counter, so the service pushes updates to
 * us via [updateAll] whenever the numbers change. [onUpdate] still handles the
 * cases the system drives directly: the widget being added, the launcher
 * restarting, or a device reboot.
 */
class WiltWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        manager: AppWidgetManager,
        ids: IntArray,
    ) {
        for (id in ids) renderWidget(context, manager, id)
    }

    companion object {
        private const val PREFS = "wilt_reels"
        /** Daily limit, in minutes — mirrors BUDGET on the in-app dashboard. */
        private const val BUDGET_MIN = 30

        /**
         * Push the current counts to every placed widget. Safe to call from the
         * accessibility service on any thread; a no-op if no widget is placed.
         */
        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context) ?: return
            val component = ComponentName(context, WiltWidgetProvider::class.java)
            val ids = manager.getAppWidgetIds(component) ?: return
            for (id in ids) renderWidget(context, manager, id)
        }

        private fun renderWidget(context: Context, manager: AppWidgetManager, id: Int) {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

            // The service only rolls the counters over to a new day when an event
            // fires, so stored values can belong to an earlier date. Show zeros
            // until the service actually records something today.
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
            val fresh = prefs.getString("date", null) == today
            val reels = if (fresh) prefs.getInt("count", 0) else 0
            val shorts = if (fresh) prefs.getInt("shortsCount", 0) else 0
            val seconds = if (fresh) prefs.getInt("seconds", 0) else 0

            val views = RemoteViews(context.packageName, R.layout.wilt_widget)
            views.setTextViewText(R.id.widget_time, formatTime(seconds))

            // Budget line + colour: amber while under the user-set limit, red once over.
            val budget = prefs.getInt("limitMinutes", BUDGET_MIN).coerceIn(5, 240)
            val minutes = seconds / 60
            val over = minutes > budget
            val color = if (over) 0xFFD2542F.toInt() else 0xFFE0913C.toInt()
            val limit =
                if (over) "${minutes - budget} min over your ${budget}-min limit"
                else "${budget - minutes} min left of your ${budget}-min limit"
            views.setTextViewText(R.id.widget_limit, limit)
            views.setTextColor(R.id.widget_time, color)
            views.setTextColor(R.id.widget_limit, color)

            // The cat rots with the minutes: fresh, wilting, mouldy, rotting,
            // nearly gone, and a skull once the limit is hit. Same bands and the
            // same worn top as the pill, flattened to one bitmap for RemoteViews.
            val top = Closet.outfit(prefs)["top"]
            views.setImageViewBitmap(R.id.widget_cat, CatFigureLayers.pillBitmap(context, CatDecay.stage(minutes, budget), top))

            views.setTextViewText(R.id.widget_reels, "$reels${plural(reels, " reel", " reels")}")
            views.setTextViewText(R.id.widget_shorts, "$shorts${plural(shorts, " short", " shorts")}")

            // Tapping the widget opens the app.
            context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                val pending = PendingIntent.getActivity(context, 0, launch, flags)
                views.setOnClickPendingIntent(R.id.wilt_widget_root, pending)
            }

            manager.updateAppWidget(id, views)
        }

        private fun plural(n: Int, one: String, many: String): String =
            if (n == 1) one else many

        /** Seconds -> "23m", or "1h 4m" once it crosses an hour. */
        private fun formatTime(seconds: Int): String {
            val minutes = seconds / 60
            if (minutes < 60) return "${minutes}m"
            return "${minutes / 60}h ${minutes % 60}m"
        }
    }
}
