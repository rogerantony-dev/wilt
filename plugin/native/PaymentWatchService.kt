package com.rogerantony.wilt

import android.app.AppOpsManager
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Process
import android.util.Log

/**
 * Turns Wilt back on the moment the user leaves the payment app it paused for.
 *
 * Once the accessibility service has called disableSelf() nothing tells us
 * what is on screen any more, so this reads the system's usage-events log
 * instead and resumes as soon as a different app is brought to the front.
 * That needs Usage access (PACKAGE_USAGE_STATS: Settings > Apps > Special app
 * access > Usage access, or `adb shell appops set <pkg> GET_USAGE_STATS allow`),
 * on top of the WRITE_SECURE_SETTINGS grant that re-enabling needs at all.
 *
 * Runs as a short foreground service so Samsung's background freezer does not
 * stop the polling. Android caps that kind of service at about three minutes;
 * if the payment takes longer, the resume alarm in [PaymentPause] takes over.
 */
class PaymentWatchService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private var pausedPkg: String? = null
    private var since = 0L
    private var done = false

    private val tick = object : Runnable {
        override fun run() {
            poll()
            if (!done) handler.postDelayed(this, POLL_MS)
        }
    }
    private val timeout = Runnable { finish("timed out; alarm takes over") }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val pkg = intent?.getStringExtra(EXTRA_PACKAGE) ?: PaymentPause.pausedPackage(this)
        val label = intent?.getStringExtra(EXTRA_LABEL) ?: pkg?.let { PaymentPause.label(it) }
        if (pkg == null || label == null) { stopSelf(); return START_NOT_STICKY }
        since = System.currentTimeMillis()
        // A pause triggered by a hidden screen carries no package, only a title,
        // so the app to watch for leaving is whatever the usage log says came to
        // the front most recently. Fall back to the given package.
        pausedPkg = foregroundPackage(since - RECENT_MS) ?: pkg
        done = false
        val notification = PaymentPause.pausedNotification(this, label)
        if (notification == null) { stopSelf(); return START_NOT_STICKY }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                PaymentPause.NOTIFICATION_ID, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE,
            )
        } else {
            startForeground(PaymentPause.NOTIFICATION_ID, notification)
        }
        handler.removeCallbacksAndMessages(null)
        handler.post(tick)
        handler.postDelayed(timeout, MAX_MS)
        Log.d(TAG, "watching for the user to leave $pausedPkg")
        return START_NOT_STICKY
    }

    private fun poll() {
        if (PaymentPause.pausedPackage(this) == null) { finish("pause already cleared"); return }
        val front = foregroundPackage(since) ?: return
        if (front == pausedPkg) return
        Log.i(TAG, "left $pausedPkg for $front; turning the service back on")
        finish("left the app")
        // enableService sleeps between its off and on writes; keep that off the main thread.
        Thread { PaymentPause.resumeNow(this, "left the app") }.start()
    }

    /** The package most recently brought to the front after [since], or null if none. */
    private fun foregroundPackage(since: Long): String? {
        val usage = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager ?: return null
        val events = runCatching { usage.queryEvents(since, System.currentTimeMillis()) }.getOrNull()
            ?: return null
        val event = UsageEvents.Event()
        var last: String? = null
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            @Suppress("DEPRECATION")
            if (event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) last = event.packageName
        }
        return last
    }

    private fun finish(reason: String) {
        if (done) return
        done = true
        Log.d(TAG, "watch over: $reason")
        handler.removeCallbacksAndMessages(null)
        // Keep the pause notification up; the service cancels it when it reconnects.
        stopForeground(STOP_FOREGROUND_DETACH)
        stopSelf()
    }

    // Android 14 ends a short service itself after its time limit.
    override fun onTimeout(startId: Int) {
        finish("stopped by the system")
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    companion object {
        private const val TAG = "Wilt"
        private const val EXTRA_PACKAGE = "package"
        private const val EXTRA_LABEL = "label"
        private const val POLL_MS = 1000L
        private const val RECENT_MS = 15 * 1000L
        private const val MAX_MS = 170 * 1000L

        /** Usage access granted, in Settings or over adb. */
        fun canWatch(context: Context): Boolean {
            val ops = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager ?: return false
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
            } else {
                @Suppress("DEPRECATION")
                ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
            }
            return mode == AppOpsManager.MODE_ALLOWED || (
                mode == AppOpsManager.MODE_DEFAULT &&
                    context.checkSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) ==
                    PackageManager.PERMISSION_GRANTED
                )
        }

        /** Start watching; false when the system refused (the alarm still covers the pause). */
        fun start(context: Context, pkg: String, label: String): Boolean {
            val intent = Intent(context, PaymentWatchService::class.java)
                .putExtra(EXTRA_PACKAGE, pkg)
                .putExtra(EXTRA_LABEL, label)
            return runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
                else context.startService(intent)
                true
            }.onFailure { Log.w(TAG, "could not start the payment watch", it) }.getOrDefault(false)
        }

        fun stop(context: Context) {
            runCatching { context.stopService(Intent(context, PaymentWatchService::class.java)) }
        }
    }
}
