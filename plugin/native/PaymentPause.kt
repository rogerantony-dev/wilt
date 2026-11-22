package com.rogerantony.wilt

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.SystemClock
import android.provider.Settings
import android.util.Log

/**
 * Payment apps, and turning the service back on after a reboot or update.
 *
 * Wilt used to switch its accessibility service off whenever a payment app
 * came to the front, because Paytm showed "Suspicious App Detected" naming it.
 * Tested on the A54 (2026-11-22) with the same APK and the service left on:
 * installed by the Play Store, Paytm and Google Pay both went through to the
 * UPI PIN screen; installed over adb, Paytm stopped at the amount screen and
 * Google Pay still let it through. Paytm trusts accessibility services the
 * Play Store installed and blocks the rest, and Wilt ships through Play, so
 * the service now stays on. Payment apps are still recognised ([paymentApps])
 * so that every overlay comes down over them (their tapjacking checks refuse
 * to pay while any foreign window is attached) and so an added app can never
 * be one of them.
 */
object PaymentPause {

    /**
     * UPI and banking apps. Package to app label. Detection ([paymentApps]) finds most of these on its own; the list
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
    /** Request code of the restore check's alarm (the same one the old payment resume used). */
    private const val VERIFY_REQUEST = 7032

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
     * Every installed payment app, found on the phone rather
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

    /** Notification id the old payment pause posted under. */
    private const val OLD_PAUSE_NOTIFICATION_ID = 7031

    /**
     * Clear what the old payment pause (1.10.2 and earlier) may have left
     * behind: its record in prefs and its "paused for" notification.
     */
    fun clearPaused(context: Context) {
        prefs(context).edit()
            .remove("paymentPausePackage").remove("paymentPauseLabel").remove("paymentPausedAt")
            .remove("serviceLeftOff").remove("resumeClaimedAt")
            .apply()
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager)
            ?.cancel(OLD_PAUSE_NOTIFICATION_ID)
    }

    /**
     * After a reboot or an app update: put the service back if it was set up.
     * An update can drop it from the enabled list or leave it bound but never
     * connected; [enableService] turns it off and on, which fixes both. Only
     * with WRITE_SECURE_SETTINGS, which is granted over adb, never by Play.
     * Blocks for half a second.
     */
    fun restore(context: Context, reason: String) {
        val setUp = prefs(context).getLong("lastConnectedAt", 0L) > 0L
        if (!setUp || !canWriteSecureSettings(context)) return
        Log.i(TAG, "restoring the accessibility service: $reason")
        if (enableService(context)) scheduleVerify(context, attempt = 1)
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

    /** Heartbeat the service writes in onServiceConnected, newer than the last attempt to turn it on. */
    fun reconnectedSinceAttempt(context: Context): Boolean {
        val p = prefs(context)
        return p.getLong("lastConnectedAt", 0L) > p.getLong(PREF_RESUME_TRIED_AT, 0L)
    }

    private const val VERIFY_AFTER_MS = 60 * 1000L
    /** Ten minutes of rebind attempts. */
    private const val MAX_RETRIES = 10
    const val EXTRA_ATTEMPT = "attempt"

    /**
     * After a restore, look again a minute later: if the service has not
     * written its heartbeat since, the rebind did not take and the attempt is
     * repeated, up to [MAX_RETRIES] times. Allow-while-idle so Battery Saver
     * cannot hold it indefinitely.
     */
    fun scheduleVerify(context: Context, attempt: Int) {
        if (attempt >= MAX_RETRIES) { Log.w(TAG, "restore gave up after $attempt attempts"); return }
        val alarm = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val pending = PendingIntent.getBroadcast(
            context,
            VERIFY_REQUEST,
            Intent(context, ServiceVerifyReceiver::class.java).putExtra(EXTRA_ATTEMPT, attempt),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        runCatching {
            alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + VERIFY_AFTER_MS, pending)
        }.onFailure { Log.w(TAG, "restore check not scheduled", it) }
    }
}

/**
 * Fires a minute after a [PaymentPause.restore]: if the service has not
 * connected since, the off-and-on write did not take and is repeated, up to
 * ten times.
 */
class ServiceVerifyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val attempt = intent?.getIntExtra(PaymentPause.EXTRA_ATTEMPT, 0) ?: 0
        val back = PaymentPause.reconnectedSinceAttempt(context)
        Log.d("Wilt", "restore check: attempt=$attempt reconnected=$back")
        if (back || attempt == 0) return
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
