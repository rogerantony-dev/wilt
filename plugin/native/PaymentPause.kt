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
import android.net.Uri
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
 * So: when one of the [paymentApps] found on the phone comes to the
 * foreground, the service records the pause in prefs, posts a notification,
 * and calls disableSelf(). Nothing else turns it off. Turning back on is
 * normally the user's job (Android gives an app no way to re-enable its own
 * service), which the app makes a one-tap trip to the right settings screen.
 * On a phone where WRITE_SECURE_SETTINGS has been granted over adb, Wilt
 * re-enables itself: when the app is opened, the moment the user leaves the
 * payment app when Usage access is granted too ([PaymentWatchService]), and
 * from an alarm that keeps checking until the service is back.
 */
object PaymentPause {

    /**
     * UPI and banking apps known to block, or likely to. Package to app label.
     * Detection ([paymentApps]) finds most of these on its own; the list
     * catches the ones it cannot tell from the outside (no upi:// handler, no
     * telling name), and a package that is not installed costs nothing.
     */
    private val known: Map<String, String> = linkedMapOf(
        // UPI and wallets
        "net.one97.paytm" to "Paytm",
        "com.phonepe.app" to "PhonePe",
        "com.google.android.apps.nbu.paisa.user" to "Google Pay",
        "in.org.npci.upiapp" to "BHIM",
        "com.sbi.upi" to "BHIM SBI Pay",
        "com.dreamplug.androidapp" to "CRED",
        "com.mobikwik_new" to "MobiKwik",
        "com.freecharge.android" to "Freecharge",
        "com.enstage.wibmo.hdfc" to "PayZapp",
        "indwin.c3.shareapp" to "slice",
        "com.naviapp" to "Navi",
        "money.jupiter" to "Jupiter",
        "com.jupiter.money" to "Jupiter",
        "com.epifi.paisa" to "Fi",
        // Banks
        "com.sbi.lotusintouch" to "YONO SBI",
        "com.sbi.SBIFreedomPlus" to "YONO Lite SBI",
        "com.snapwork.hdfc" to "HDFC Bank",
        "com.hdfcbank.android.now" to "HDFC Bank",
        "com.csam.icici.bank.imobile" to "iMobile Pay",
        "com.icicibank.pockets" to "Pockets",
        "com.axis.mobile" to "Axis Mobile",
        "com.msf.kbank.mobile" to "Kotak",
        "com.bankofbaroda.mconnect" to "bob World",
        "com.Version1" to "PNB ONE",
        "com.canarabank.mobility" to "Canara ai1",
        "com.idfcfirstbank.optimus" to "IDFC FIRST",
        "com.fss.indus" to "IndusMobile",
        "com.fss.unbi" to "Union Bank",
        "com.unionbank.ecommerce.mobile.android" to "Vyom",
        "com.fedmobile" to "FedMobile",
        "com.infrasofttech.indianBank" to "IndOASIS",
        "com.boi.ua.android" to "BOI Mobile",
        "com.infrasofttech.CentralBank" to "Cent Mobile",
        "com.yesbank" to "YES Mobile",
        "com.snapwork.IDBI" to "IDBI Bank",
        "com.rblbank.mobank" to "RBL MoBank",
        "com.aubank.aubank" to "AU 0101",
        "com.dbs.in.digitalbank" to "digibank",
        "com.hsbc.hsbcindia" to "HSBC India",
        "air.app.scb.breeze.android.main.in.prod" to "SC Mobile",
    )

    private const val TAG = "Wilt"

    const val PREF_PACKAGE = "paymentPausePackage"
    const val PREF_LABEL = "paymentPauseLabel"
    const val PREF_AT = "paymentPausedAt"
    /** Set by "Leave it off for now", cleared when the service connects again. */
    const val PREF_LEFT_OFF = "serviceLeftOff"

    private const val CHANNEL_ID = "wilt_payment_pause"
    const val NOTIFICATION_ID = 7031
    private const val RESUME_REQUEST = 7032
    private const val AUTO_RESUME_AFTER_MS = 4 * 60 * 1000L
    /** First alarm when the watch is running: just after Android ends it. */
    private const val WATCH_HANDOFF_MS = 3 * 60 * 1000L
    /** How often the alarm looks again while the payment app is still in front. */
    const val STILL_THERE_RECHECK_MS = 30 * 1000L

    // --- Finding payment apps ------------------------------------------------------

    /** An installed payment app: its package, the label the user sees, and the titles its windows may carry. */
    class PaymentApp(val pkg: String, val label: String, val titles: Set<String>)

    @Volatile private var found: Map<String, PaymentApp>? = null
    private var detecting = false
    private var generation = 0

    /** The [known] list on its own, while detection is still running. */
    private val fallback: Map<String, PaymentApp> by lazy {
        known.mapValues { (pkg, label) -> PaymentApp(pkg, label, setOf(label)) }
    }

    /**
     * Every installed app Wilt steps aside for, found on the phone rather
     * than listed: anything that takes upi:// payment links (every UPI app and
     * most bank apps), anything whose name or package says bank, UPI, pay or
     * wallet, and the [known] apps. Worked out once, in the background (it
     * loads every launcher app's label, about two seconds), and kept until an
     * app is installed or removed ([forget]). Until then, the [known] list.
     */
    fun paymentApps(context: Context): Map<String, PaymentApp> {
        found?.let { return it }
        detectInBackground(context)
        return fallback
    }

    fun detectInBackground(context: Context) {
        val gen = synchronized(this) {
            if (detecting || found != null) return
            detecting = true
            generation
        }
        val app = context.applicationContext
        Thread {
            val apps = runCatching { detect(app) }.getOrNull()
            synchronized(this) {
                detecting = false
                // An install during the scan makes this result stale; scan again.
                if (gen == generation && apps != null) found = apps
            }
            if (gen != generation) detectInBackground(app)
        }.start()
    }

    /** An app was installed or removed; work the list out again. */
    fun forget(context: Context) {
        synchronized(this) {
            generation++
            found = null
        }
        detectInBackground(context)
    }

    fun isPaymentApp(context: Context, pkg: String?): Boolean =
        pkg != null && paymentApps(context).containsKey(pkg)

    fun label(context: Context, pkg: String): String =
        paymentApps(context)[pkg]?.label ?: known[pkg] ?: pkg

    /**
     * Reverse lookup from a window title. When an app hides its content from
     * accessibility services the window's title (its app label) is all we get,
     * so "Paytm" or "Paytm Something" maps to Paytm. Whole-word prefix only, so
     * a short label such as "Fi" cannot match "Files". Only payment apps are
     * matched: a hidden screen from anything else (a permission dialog, a
     * password manager) is left alone.
     */
    fun packageForTitle(context: Context, title: String?): String? {
        val t = title?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return paymentApps(context).values.firstOrNull { app ->
            app.titles.any { t.equals(it, ignoreCase = true) || t.startsWith("$it ", ignoreCase = true) }
        }?.pkg
    }

    private val NAME_WORDS = Regex("""\b(bank|banking|upi|wallet|pay)\b""", RegexOption.IGNORE_CASE)

    /** A label or package that says what the app is: "HDFC Bank", "Google Pay", com.kvb.mobilebanking. */
    private fun looksLikePayment(pkg: String, label: String): Boolean {
        if (NAME_WORDS.containsMatchIn(label)) return true
        return pkg.lowercase().split('.', '_').any { part ->
            "bank" in part || "wallet" in part || "paisa" in part ||
                part.startsWith("upi") || part.startsWith("money") ||
                part.startsWith("pay") || part.endsWith("pay")
        }
    }

    private fun detect(context: Context): Map<String, PaymentApp> {
        val pm = context.packageManager
        val upi = runCatching {
            pm.queryIntentActivities(Intent(Intent.ACTION_VIEW, Uri.parse("upi://pay")), 0)
                .map { it.activityInfo.packageName }.toSet()
        }.getOrDefault(emptySet())
        val launchers = runCatching {
            pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
        }.getOrDefault(emptyList())
        val apps = linkedMapOf<String, PaymentApp>()
        val skip = setOf(context.packageName, "com.instagram.android", "com.google.android.youtube")
        for (info in launchers) {
            val pkg = info.activityInfo.packageName
            if (pkg in skip) continue
            val appLabel = runCatching { info.activityInfo.applicationInfo.loadLabel(pm).toString().trim() }
                .getOrDefault("")
            val activityLabel = runCatching { info.loadLabel(pm).toString().trim() }.getOrDefault("")
            if (pkg !in known && pkg !in upi && !looksLikePayment(pkg, appLabel)) continue
            val label = appLabel.ifEmpty { known[pkg] ?: pkg }
            val titles = (apps[pkg]?.titles.orEmpty() + listOfNotNull(appLabel, activityLabel, known[pkg]))
                .filter { it.isNotEmpty() }.toSet()
            apps[pkg] = PaymentApp(pkg, label, titles)
        }
        // A payment handler with no launcher entry still counts when it comes up.
        for (pkg in upi - apps.keys - skip) {
            val label = runCatching { pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() }
                .getOrDefault(known[pkg] ?: pkg)
            apps[pkg] = PaymentApp(pkg, label, setOf(label))
        }
        Log.i(TAG, "payment apps: ${apps.values.joinToString { "${it.label} (${it.pkg})" }}")
        return apps
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences("wilt_reels", Context.MODE_PRIVATE)

    fun serviceComponent(context: Context): ComponentName =
        ComponentName(context, ReelAccessibilityService::class.java)

    /**
     * Record the pause before the service disables itself. With the adb grants
     * in place this also arms the way back: the leave-the-app watch when Usage
     * access allows it, and the alarm always, which takes over once the watch
     * runs out (Android caps it at about three minutes).
     */
    fun markPaused(context: Context, pkg: String, label: String = label(context, pkg)) {
        prefs(context).edit()
            .putString(PREF_PACKAGE, pkg)
            .putString(PREF_LABEL, label)
            .putLong(PREF_AT, System.currentTimeMillis())
            .apply()
        notifyPaused(context, label)
        if (!canWriteSecureSettings(context)) return
        val watching = PaymentWatchService.canWatch(context) && PaymentWatchService.start(context, pkg, label)
        scheduleResume(context, if (watching) WATCH_HANDOFF_MS else AUTO_RESUME_AFTER_MS, attempt = 0)
    }

    /** Both grants present: the service comes back as soon as the user leaves the app. */
    fun resumesOnLeave(context: Context): Boolean =
        canWriteSecureSettings(context) && PaymentWatchService.canWatch(context)

    /** The service is back on: forget the pause and its reminders. */
    fun clearPaused(context: Context) {
        prefs(context).edit()
            .remove(PREF_PACKAGE).remove(PREF_LABEL).remove(PREF_AT).remove(PREF_LEFT_OFF)
            .apply()
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

    fun leftOff(context: Context): Boolean = prefs(context).getBoolean(PREF_LEFT_OFF, false)

    /**
     * After a reboot or an app update: put the service back if it was set up
     * and the user did not choose to leave it off. An update can drop it from
     * the enabled list or leave it bound but never connected; [enableService]
     * turns it off and on, which fixes both. Blocks for half a second.
     */
    fun restore(context: Context, reason: String) {
        val p = prefs(context)
        val setUp = p.getLong("lastConnectedAt", 0L) > 0L
        if (!setUp || leftOff(context) || !canWriteSecureSettings(context)) return
        Log.i(TAG, "restoring the accessibility service: $reason")
        if (enableService(context)) scheduleVerify(context, attempt = 1)
    }

    /**
     * True while the paused-for app is still in front, as far as Usage access
     * can tell: no other app has come up since the pause. Null without Usage
     * access, when there is no telling.
     */
    fun stillInPausedApp(context: Context): Boolean? {
        if (!PaymentWatchService.canWatch(context)) return null
        val pkg = pausedPackage(context) ?: return false
        val since = prefs(context).getLong(PREF_AT, 0L)
        val front = PaymentWatchService.frontPackage(context, since) ?: return true
        return front == pkg
    }

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
        // Before the writes: the service can connect within the half second below,
        // and its heartbeat must land after this to count as the attempt taking.
        prefs(context).edit().putLong(PREF_RESUME_TRIED_AT, System.currentTimeMillis()).commit()
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
            Log.i(TAG, "re-enabled accessibility service")
            true
        }.onFailure { Log.w(TAG, "re-enable failed", it) }.getOrDefault(false)
    }

    private const val PREF_RESUME_TRIED_AT = "resumeTriedAt"

    /**
     * Heartbeat the service writes in onServiceConnected; newer than the last
     * attempt to turn it on (the pause itself, or a [restore]) means it is back.
     */
    fun reconnectedSinceAttempt(context: Context): Boolean {
        val p = prefs(context)
        val since = maxOf(p.getLong(PREF_AT, 0L), p.getLong(PREF_RESUME_TRIED_AT, 0L))
        return p.getLong("lastConnectedAt", 0L) > since
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
    /** Ten minutes of rebind attempts; waiting on the payment app does not count. */
    private const val MAX_RETRIES = 10
    const val EXTRA_ATTEMPT = "attempt"

    /**
     * After a resume attempt, look again a minute later: if the service has
     * not written its heartbeat since, the rebind did not take and the attempt
     * is repeated, up to [MAX_RETRIES] times.
     */
    fun scheduleVerify(context: Context, attempt: Int) {
        if (attempt >= MAX_RETRIES) { Log.w(TAG, "auto-resume gave up after $attempt attempts"); return }
        scheduleResume(context, VERIFY_AFTER_MS, attempt)
    }

    fun scheduleResume(context: Context, delayMs: Long, attempt: Int) {
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
            "$appLabel blocks payments while Wilt is on. It comes back on its own in 4 minutes, or when you open Wilt."
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
 * Fires after a payment pause (and after each resume attempt), only on phones
 * where the app can write secure settings. While Usage access shows the
 * payment app still in front it simply looks again shortly, so the service is
 * never switched on in the middle of a payment. Otherwise it re-enables the
 * service and checks a minute later that it really connected, so a pause the
 * user forgot about does not switch counting off for the rest of the day.
 */
class PaymentResumeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val paused = PaymentPause.pausedPackage(context)
        val attempt = intent?.getIntExtra(PaymentPause.EXTRA_ATTEMPT, 0) ?: 0
        val back = PaymentPause.reconnectedSinceAttempt(context)
        val stillThere = paused != null && PaymentPause.stillInPausedApp(context) == true
        Log.d("Wilt", "auto-resume alarm: paused=$paused attempt=$attempt reconnected=$back stillThere=$stillThere")
        if (back || PaymentPause.leftOff(context)) return
        // A restore after a reboot or update carries no pause; it only verifies.
        if (paused == null && attempt == 0) return
        if (stillThere) {
            PaymentPause.scheduleResume(context, PaymentPause.STILL_THERE_RECHECK_MS, attempt)
            return
        }
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

/**
 * After a reboot or an app update, put the service back on (see
 * [PaymentPause.restore]). Updates are the usual way it goes missing: a
 * reinstall can drop it from the enabled list or leave it bound but silent.
 */
class ServiceRestoreReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val pending = goAsync()
        Thread {
            try {
                PaymentPause.restore(context, action.substringAfterLast('.'))
            } finally {
                pending.finish()
            }
        }.start()
    }
}
