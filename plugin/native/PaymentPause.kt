package com.rogerantony.wilt

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import android.util.Log

/**
 * Payment apps refuse to run while a third-party accessibility service is
 * enabled. Paytm, for one, shows "Suspicious App Detected" naming Wilt and
 * stops on the amount screen. That is a check on the enabled-services list
 * itself (verified on device with zero Wilt overlay windows attached), so no
 * overlay or event-filter change can satisfy it. The only thing that does is
 * the service not being enabled while the payment app is up.
 *
 * So: when one of [packages] comes to the foreground, the service records the
 * pause in prefs, posts a notification, and calls disableSelf(). Turning back
 * on is normally the user's job (Android gives an app no way to re-enable its
 * own service), which the app makes a one-tap trip to the right settings
 * screen. On a phone where WRITE_SECURE_SETTINGS has been granted over adb,
 * Wilt re-enables itself: at once from the app, the moment the user leaves
 * the payment app when Usage access is granted too ([PaymentWatchService]),
 * and from an alarm four minutes after the pause as the backstop.
 */
object PaymentPause {

    /**
     * Apps that refuse to run beside an enabled accessibility service: they
     * put up a "suspicious app detected, remove it to continue" wall naming
     * Wilt. Package to app label. Only apps seen doing that belong here; a
     * pause costs the user their counting until Wilt is back on, so the many
     * banking apps that merely hide their screen from accessibility services
     * are deliberately not listed. Which apps block cannot be detected at
     * runtime (the wall is on a hidden screen), so this list is the source.
     */
    val packages: Map<String, String> = linkedMapOf(
        "net.one97.paytm" to "Paytm",               // verified on device
        "com.phonepe.app" to "PhonePe",             // same wall, reported by users
        "com.snapwork.hdfc" to "HDFC Bank",         // asked for by the user, 2026-09-04
        "com.hdfcbank.android.now" to "HDFC Bank",
    )

    private const val TAG = "Wilt"

    const val PREF_PACKAGE = "paymentPausePackage"
    const val PREF_LABEL = "paymentPauseLabel"
    const val PREF_AT = "paymentPausedAt"

    private const val CHANNEL_ID = "wilt_payment_pause"
    const val NOTIFICATION_ID = 7031
    private const val RESUME_REQUEST = 7032
    private const val AUTO_RESUME_AFTER_MS = 4 * 60 * 1000L

    fun isPaymentApp(pkg: String?): Boolean = pkg != null && packages.containsKey(pkg)

    fun label(pkg: String): String = packages[pkg] ?: pkg

    /**
     * Reverse lookup from a window title. When an app hides its content from
     * accessibility services the window's title (its app label) is all we get,
     * so "Paytm" or "Paytm Something" maps to Paytm. Whole-word prefix only, so
     * a short label such as "Fi" cannot match "Files".
     */
    fun packageForTitle(title: String?): String? {
        val t = title?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return packages.entries.firstOrNull { (_, label) ->
            t.equals(label, ignoreCase = true) || t.startsWith("$label ", ignoreCase = true)
        }?.key
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences("wilt_reels", Context.MODE_PRIVATE)

    fun serviceComponent(context: Context): ComponentName =
        ComponentName(context, ReelAccessibilityService::class.java)

    /**
     * Record the pause before the service disables itself. With the adb grants
     * in place this also arms the way back: the alarm always, and the
     * leave-the-app watch when Usage access allows it.
     */
    fun markPaused(context: Context, pkg: String) {
        val label = label(pkg)
        prefs(context).edit()
            .putString(PREF_PACKAGE, pkg)
            .putString(PREF_LABEL, label)
            .putLong(PREF_AT, System.currentTimeMillis())
            .apply()
        notifyPaused(context, label)
        if (!canWriteSecureSettings(context)) return
        scheduleAutoResume(context)
        if (PaymentWatchService.canWatch(context)) PaymentWatchService.start(context, pkg)
    }

    /** Both grants present: the service comes back as soon as the user leaves the app. */
    fun resumesOnLeave(context: Context): Boolean =
        canWriteSecureSettings(context) && PaymentWatchService.canWatch(context)

    /** The service is back on: forget the pause and its reminders. */
    fun clearPaused(context: Context) {
        prefs(context).edit().remove(PREF_PACKAGE).remove(PREF_LABEL).remove(PREF_AT).apply()
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager)
            ?.cancel(NOTIFICATION_ID)
        cancelAutoResume(context)
        PaymentWatchService.stop(context)
    }

    /** Turn the service back on now and verify it took, like the alarm does. */
    fun resumeNow(context: Context, reason: String) {
        Log.i(TAG, "resuming after payment pause: $reason")
        if (enableService(context)) scheduleVerify(context, attempt = 1)
    }

    fun pausedPackage(context: Context): String? = prefs(context).getString(PREF_PACKAGE, null)

    // --- Re-enabling -------------------------------------------------------------

    /**
     * Granted only over adb: `adb shell pm grant <pkg> android.permission.WRITE_SECURE_SETTINGS`.
     * Never available to a normal install, so every caller must handle false.
     */
    fun canWriteSecureSettings(context: Context): Boolean =
        context.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) ==
            PackageManager.PERMISSION_GRANTED

    /**
     * Re-enable the service by appending it to the enabled-services setting.
     * Returns true when the write went through. Silently false without the
     * permission or on any system refusal.
     */
    fun enableService(context: Context): Boolean {
        if (!canWriteSecureSettings(context)) return false
        val id = serviceComponent(context).flattenToString()
        val resolver = context.contentResolver
        return runCatching {
            val current = Settings.Secure.getString(
                resolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ).orEmpty()
            val others = current.split(':').filter { it.isNotBlank() && !it.equals(id, ignoreCase = true) }
            // Off, then on. Writing the enabled list with the service already in
            // it, or straight after a reinstall, has left the system believing the
            // service was bound while it never connected (no heartbeat, no
            // events); only a real off-and-on rebinds it. The short pause lets
            // the accessibility manager see the removal as its own change.
            Settings.Secure.putString(
                resolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, others.joinToString(":")
            )
            SystemClock.sleep(500)
            Settings.Secure.putString(
                resolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, (others + id).joinToString(":")
            )
            Settings.Secure.putInt(resolver, Settings.Secure.ACCESSIBILITY_ENABLED, 1)
            Log.i(TAG, "re-enabled accessibility service after payment pause")
            true
        }.onFailure { Log.w(TAG, "re-enable failed", it) }.getOrDefault(false)
    }

    /** Heartbeat the service writes in onServiceConnected; newer than the pause means it is back. */
    fun reconnectedSincePause(context: Context): Boolean {
        val p = prefs(context)
        return p.getLong("lastConnectedAt", 0L) > p.getLong(PREF_AT, Long.MAX_VALUE)
    }

    /**
     * Open Settings > Accessibility with Wilt's service highlighted, so turning
     * it back on is one tap rather than a hunt through the list. The fragment
     * extras are honoured by AOSP and One UI; other skins fall back to the plain
     * accessibility list.
     */
    fun openServiceSettings(context: Context) {
        val id = serviceComponent(context).flattenToString()
        val args = Bundle().apply { putString(":settings:fragment_args_key", id) }
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra(":settings:fragment_args_key", id)
            putExtra(":settings:show_fragment_args", args)
        }
        runCatching { context.startActivity(intent) }
    }

    /**
     * Exact when the app is allowed exact alarms (Settings > Apps > Special
     * access > Alarms and reminders, or `appops set <pkg> SCHEDULE_EXACT_ALARM
     * allow` over adb), since only exact alarms are exempt from Battery Saver
     * and standby deferrals: on device an inexact 4-minute alarm fired after 11.
     * Otherwise allow-while-idle, which is at least delivered eventually; a plain
     * set() from a background app is held indefinitely under Battery Saver.
     */
    private const val VERIFY_AFTER_MS = 60 * 1000L
    private const val MAX_RETRIES = 3
    const val EXTRA_ATTEMPT = "attempt"

    private fun scheduleAutoResume(context: Context) = scheduleResume(context, AUTO_RESUME_AFTER_MS, attempt = 0)

    /**
     * After a resume attempt, look again a minute later: if the service has
     * not written its heartbeat since the pause, the rebind did not take and
     * the attempt is repeated, up to [MAX_RETRIES] times.
     */
    fun scheduleVerify(context: Context, attempt: Int) {
        if (attempt >= MAX_RETRIES) { Log.w(TAG, "auto-resume gave up after $attempt attempts"); return }
        scheduleResume(context, VERIFY_AFTER_MS, attempt)
    }

    private fun scheduleResume(context: Context, delayMs: Long, attempt: Int) {
        val alarm = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val at = System.currentTimeMillis() + delayMs
        val pending = resumePendingIntent(context, attempt)
        val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarm.canScheduleExactAlarms()
        runCatching {
            if (exact) alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
            else alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
        }.onFailure {
            Log.w(TAG, "exact alarm refused, falling back", it)
            alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
        }
        Log.d(TAG, "auto-resume scheduled in ${delayMs / 1000}s, attempt=$attempt, exact=$exact")
    }

    private fun cancelAutoResume(context: Context) {
        val alarm = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        alarm.cancel(resumePendingIntent(context, 0))
    }

    /** One pending intent for the whole chain, so a newer schedule replaces an older one. */
    private fun resumePendingIntent(context: Context, attempt: Int): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            RESUME_REQUEST,
            Intent(context, PaymentResumeReceiver::class.java).putExtra(EXTRA_ATTEMPT, attempt),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    // --- Notification ------------------------------------------------------------

    /**
     * The one signal the user gets that Wilt is off. Needs POST_NOTIFICATIONS
     * on Android 13+; the app asks for it once the dashboard is up. Tapping opens
     * Wilt, whose resume screen does the rest.
     */
    private fun notifyPaused(context: Context, appLabel: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            ?: return
        val notification = pausedNotification(context, appLabel) ?: return
        runCatching { manager.notify(NOTIFICATION_ID, notification) }
    }

    /** The pause notification; also what [PaymentWatchService] runs in the foreground under. */
    fun pausedNotification(context: Context, appLabel: String): Notification? {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            ?: return null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "Paused for payments",
                    NotificationManager.IMPORTANCE_DEFAULT,
                ).apply {
                    description = "Reminds you to turn Wilt back on after using a payment app."
                }
            )
        }
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?.apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP) }
            ?: return null
        val tap = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val auto = canWriteSecureSettings(context)
        val body = if (auto && PaymentWatchService.canWatch(context)) {
            "$appLabel blocks payments while Wilt is on. It comes back on its own as soon as you leave $appLabel, or tap to turn it on now."
        } else if (auto) {
            "$appLabel blocks payments while Wilt is on. It comes back on its own in 4 minutes, or tap to turn it on now."
        } else {
            "$appLabel blocks payments while Wilt is on. Tap to turn it back on when you are done."
        }
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
        }
        return builder
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setContentTitle("Wilt paused for $appLabel")
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setContentIntent(tap)
            .setAutoCancel(true)
            .setOngoing(!auto)
            .build()
    }
}

/**
 * Fires a few minutes after a payment pause, only on phones where the app can
 * write secure settings. Re-enables the service so a pause the user forgot
 * about does not silently switch counting off for the rest of the day. If the
 * payment app is still up at that moment its next check will block again, and
 * the service simply pauses once more.
 */
class PaymentResumeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val paused = PaymentPause.pausedPackage(context)
        val attempt = intent?.getIntExtra(PaymentPause.EXTRA_ATTEMPT, 0) ?: 0
        val back = PaymentPause.reconnectedSincePause(context)
        Log.d("Wilt", "auto-resume alarm: paused=$paused attempt=$attempt reconnected=$back")
        if (paused == null || back) return
        val pending = goAsync()
        Thread {
            try {
                if (PaymentPause.enableService(context)) PaymentPause.scheduleVerify(context, attempt + 1)
            } finally {
                pending.finish()
            }
        }.start()
    }
}
