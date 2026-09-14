package com.rogerantony.wilt

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.animation.ValueAnimator
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import org.json.JSONObject

/**
 * Watches the Instagram app and counts how many Reels the user scrolls through
 * each day, drawing a small floating "pill" with the running total on top of
 * the Reels feed. The count resets automatically when the calendar day changes.
 *
 * Detection here is heuristic — there is no DOM/public API for IG's UI, so we
 * read the accessibility node tree. All reel-related actions route through one
 * detector, [detectReel], which both decides "is this a full-screen reel" and
 * extracts the per-reel identity key. The parts most likely to need tuning against
 * a specific Instagram version are [detectReel] (which ids mark the full-screen
 * player) and [coversScreen] (the full-screen bounds thresholds).
 */
class ReelAccessibilityService : AccessibilityService() {

    private companion object {
        /** Sparse logcat tag: window switches, payment pauses, filter changes. */
        const val TAG = "Wilt"
    }

    private val instagramPackage = "com.instagram.android"
    private val youtubePackage = "com.google.android.youtube"

    // When true the pill always shows while Instagram is foreground and prints
    // what the detector sees (in-reels flag, sampled view-ids, signature). Flip
    // to true only for a tuning build — it's noisy and not for real use.
    private val debug = false

    /** Daily limit in minutes — user-set, read live from prefs (mirrors dashboard + widget). */
    /** Daily limit in effect today; a raise queued for today counts even before rollover. */
    private fun limitMinutes(): Int {
        val pending = prefs.getInt("pendingLimit", 0)
        val pendingDate = prefs.getString("pendingLimitDate", null)
        if (pending in 5..240 && pendingDate != null && today() >= pendingDate) return pending
        return prefs.getInt("limitMinutes", 30).coerceIn(5, 240)
    }

    private var windowManager: WindowManager? = null
    private var pill: View? = null
    private var catView: ImageView? = null
    private var pillLabel: TextView? = null
    private var overlayShown = false

    // Nudge state. nudgeModalShown freezes the time ticker while a modal is up;
    // sittingSeconds measures one unbroken reel sitting; wasOnReel tracks the
    // not-on-reel → on-reel transition so entry triggers fire once per entry.
    private var nudgeModalShown = false
    private var sittingSeconds = 0
    private var wasOnReel = false
    private val nudgeCooldownMs = 20 * 60 * 1000L
    private var nudgeModal: View? = null
    private var nudgeCountdown: Runnable? = null
    private val nudgeHardKeys = setOf("latenight", "morning", "workhours")

    // Block mode: when you're on the Instagram home feed, this cover blanks the whole
    // feed behind a cat photo + a cheeky line and EATS touches over it, so the feed
    // can't be scrolled at all. The bottom nav is left uncovered so you can still
    // leave. Distinct from the pill so the two never fight.
    //
    // Touches are consumed (no FLAG_NOT_TOUCHABLE) which both blocks scrolling and
    // sidesteps Android's 0.8 opacity cap on pass-through overlays; we still stack a
    // few identical layers so it's reliably opaque either way. Within an Instagram
    // session, showing/hiding just toggles window alpha + touchability — no
    // addView/removeView churn. But the windows MUST be fully removed the moment we
    // are not in a tracked app: UPI/banking apps (Paytm etc.) run tapjacking checks
    // and refuse payments while ANY foreign window overlays them, even a fully
    // transparent one. removeCatCover() is therefore called on every leave-app /
    // screen-off / block-mode-off path, and the layers rebuild lazily on next show.
    private val catLayers = mutableListOf<View>()
    private var catImageView: ImageView? = null
    private var catTextView: TextView? = null
    private var catCoverVisible = false
    private val catCoverShown get() = catCoverVisible
    private var blockShowSeq = 0 // rotates the cat/line each time the block re-appears
    private var lastCoverBounds: Rect? = null
    private val catCoverLayerCount = 3

    // A transparent interceptor over the stories tray: the tray stays visible and usable
    // (tap a circle, swipe the row sideways) but vertical drags are swallowed so you
    // can't SCROLL the blocked feed from up here. A tap is forwarded to the story circle
    // as an accessibility click; a horizontal swipe scrolls the tray's own row.
    private var trayCover: View? = null
    private var trayCoverActive = false
    // True only for the brief window of a forwarded synthetic tap, during which the
    // tray cover is set pass-through so the tap can land on Instagram. Guards the
    // 180ms cover ticker from re-arming touch-eating mid-tap.
    private var trayForwarding = false
    private var trayDownX = 0f
    private var trayDownY = 0f
    private var trayDownAt = 0L

    // Every scan below hits the accessibility node tree (rootInActiveWindow — an
    // expensive IPC fetch — plus id lookups). A *playing* reel fires content-changed
    // events continuously, so scans were running at ~16-27Hz and pegged the CPU
    // (~45-60%) — the battery drain. Fix: cap scan frequency by wall-clock. The event
    // handler throttles its scan ([eventScanMinMs]); the two self-pollers run on a
    // modest fixed cadence and stop entirely when the screen is off (a screen-on event
    // restarts them). A flat poll still catches "you left the reel" within ~250ms.
    private var lastEventScanAt = 0L
    private val eventScanMinMs = 200L

    // The block is shown/hidden on our OWN clock, not IG's sparse accessibility events
    // (which go silent at rest and during tab transitions). Hides the block within
    // ~1-2 ticks of leaving the feed.
    private var coverTickerRunning = false
    private val coverTickMs = 180L
    private val coverTicker = object : Runnable {
        override fun run() {
            // Screen off → really remove the windows: no event will fire outside
            // IG/YT (package-filtered service) to clean them up after unlock.
            if (!isScreenOn()) { coverTickerRunning = false; removeCatCover(); return }
            if (refreshCover()) mainHandler.postDelayed(this, coverTickMs)
            else coverTickerRunning = false
        }
    }
    private val coverLines = listOf(
        "Feed's closed.\nHere's a cat.",
        "No scrolling today.\nCat instead.",
        "Nope.\nGo do something else.",
        "This is better for you,\npromise."
    )

    // Per-platform counting de-dup. Each distinct full-screen reel/short is keyed
    // by its on-screen text; keys are compared by word-overlap (not equality) so a
    // caption finishing loading a frame later still reads as the same item and
    // counts once, and a bounded list of keys seen today stops a recount when you
    // scroll back. Reels and shorts keep separate counts; the timer is shared.
    private class Counter(val countPref: String) {
        var lastKey: String? = null
        val recent = ArrayDeque<String>() // newest first, capped at 50
    }
    private val reelCounter = Counter("count")
    private val shortCounter = Counter("shortsCount")
    private var seenKeysDate: String? = null
    // Block mode: throttle the auto-back so one item isn't backed out repeatedly.
    private var lastBackAt = 0L
    // Throttle home-screen widget pushes so the 1s time ticker doesn't spam
    // RemoteViews updates; a changed count still forces an immediate refresh.
    private var lastWidgetUpdateAt = 0L

    // Time-on-reels meter: a 1s ticker accrues real wall-clock seconds while a reel is
    // up, so the pill shows measured minutes. Tears down when the screen is off; stopped
    // by the event handler the moment you leave a reel.
    private var reelTimerRunning = false
    private val reelTimeTicker = object : Runnable {
        override fun run() {
            // Screen off → pull the pill, don't just pause. The pill's watchdog
            // (pillTicker) also stops on screen-off, and no accessibility event fires
            // outside Instagram/YouTube (the service is package-filtered) — so if this
            // ticker kept re-rendering instead, the pill would survive the lock and
            // reappear over the home screen / another app on unlock, with nothing left
            // to clear it. If still on a reel after unlock, the next IG/YT event rebuilds.
            if (!isScreenOn()) { hideOverlay(); return }
            addSeconds(1)
            render()
            mainHandler.postDelayed(this, 1000L)
        }
    }

    // Pill upkeep on our OWN clock (same pattern as the cover): once the pill is up,
    // this polls and pulls it the instant you're no longer on a reel — switching tabs
    // or leaving IG/YT — without waiting on IG's events (which go silent at rest).
    private var pillTickerRunning = false
    private val pillTickMs = 250L
    private val pillTicker = object : Runnable {
        override fun run() {
            if (!isScreenOn()) { pillTickerRunning = false; return }
            val keep = runCatching { refreshPill() }.getOrDefault(true)
            if (keep) mainHandler.postDelayed(this, pillTickMs)
            else pillTickerRunning = false
        }
    }


    private val prefs by lazy {
        getSharedPreferences("wilt_reels", Context.MODE_PRIVATE)
    }

    // Hide hysteresis: a single mis-detected event shouldn't blink the pill out.
    private val mainHandler = Handler(Looper.getMainLooper())
    // Hides the PILL only. The cat cover has its own ticker-driven lifecycle
    // ([refreshCover]/[hideCatCover]) so the two never fight over the same timer.
    private val hideRunnable = Runnable { hideOverlay() }
    private val hideDelayMs = 250L

    override fun onServiceConnected() {
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        // Heartbeat so the app can confirm the service is actually running.
        prefs.edit().putLong("lastConnectedAt", System.currentTimeMillis()).apply()
        // Being connected means any payment pause is over (the user, or the
        // auto-resume alarm, turned us back on).
        PaymentPause.clearPaused(this)
        setTrackedEvents(false)
    }

    // The config XML deliberately has no android:packageNames filter: to notice a
    // payment app coming to the front we must hear window-state changes from EVERY
    // package. Everything else (content-changed, scrolled) is only wanted inside
    // Instagram/YouTube, and a playing reel floods those, so the subscribed event
    // set is switched at runtime: window-state only while idle, the full set while
    // in a tracked app.
    // Null until first applied: the XML declares the full set, so the first
    // narrowing must not be skipped as a no-op.
    private var trackedEventsOn: Boolean? = null

    private fun setTrackedEvents(on: Boolean) {
        if (on == trackedEventsOn) return
        trackedEventsOn = on
        val info = serviceInfo ?: return
        val switchEvents = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
            AccessibilityEvent.TYPE_WINDOWS_CHANGED
        info.eventTypes = if (on) {
            switchEvents or
                AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED or
                AccessibilityEvent.TYPE_VIEW_SCROLLED
        } else {
            switchEvents
        }
        info.packageNames = null
        runCatching { serviceInfo = info }
            .onFailure { Log.w(TAG, "setServiceInfo failed", it) }
        Log.d(TAG, "tracked events ${if (on) "on" else "off"}")
    }

    /** What the focused window resolves to; [hiddenTitle] is set when its content is withheld from us. */
    private class ActiveWindow(val pkg: String?, val hiddenTitle: String?)

    /**
     * The window that currently holds focus. rootInActiveWindow can be null
     * mid-transition, or hidden on purpose, so fall back to the windows list.
     */
    private fun activeWindow(): ActiveWindow {
        rootInActiveWindow?.packageName?.let { return ActiveWindow(it.toString(), null) }
        val win = runCatching { windows }.getOrNull()
            ?.let { list -> list.firstOrNull { it.isActive } ?: list.firstOrNull { it.isFocused } }
            ?: return ActiveWindow(null, null)
        win.root?.packageName?.let { return ActiveWindow(it.toString(), null) }
        // The root is hidden from us: Android 14 lets an app mark its content
        // accessibilityDataSensitive, which banking apps do, and the system then
        // shows a non-accessibility-tool service no nodes at all. The window
        // title is still reported and is the app's label.
        val title = win.title?.toString()?.trim()?.takeIf { it.isNotEmpty() }
        val isApp = win.type == android.view.accessibility.AccessibilityWindowInfo.TYPE_APPLICATION
        Log.d(TAG, "active window root hidden; type=${win.type} title='$title'")
        return ActiveWindow(PaymentPause.packageForTitle(title), if (isApp) title else null)
    }

    /**
     * Decide what a window switch means. The active window can be unresolvable
     * for a few hundred ms while the system finishes the switch, so an
     * undecidable switch is looked at again shortly rather than judged from the
     * event alone. A hidden app window pauses only once [confirmed] by that
     * second look, so a transient blank during a switch never trips it.
     */
    private fun handleWindowSwitch(
        eventPkg: String?,
        source: String,
        retriesLeft: Int,
        confirmed: Boolean = false,
    ) {
        val active = activeWindow()
        val activePkg = active.pkg
        Log.d(TAG, "$source: event=$eventPkg active=$activePkg hidden=${active.hiddenTitle}")
        if (activePkg == instagramPackage || activePkg == youtubePackage) return
        val paymentPkg = when {
            PaymentPause.isPaymentApp(activePkg) -> activePkg
            PaymentPause.isPaymentApp(eventPkg) -> eventPkg
            else -> null
        }
        if (paymentPkg != null) { pauseForPaymentApp(paymentPkg); return }
        if (activePkg == null) {
            val hidden = active.hiddenTitle
            if (hidden != null && confirmed) {
                pauseForPaymentApp(PaymentPause.HIDDEN_WINDOW, label = hidden)
                return
            }
            if (retriesLeft > 0) {
                mainHandler.removeCallbacks(settleCheck)
                settleRetries = retriesLeft - 1
                mainHandler.postDelayed(settleCheck, settleDelayMs)
                return
            }
        }
        // Left a tracked app: tear the pill + cat cover down immediately and reset.
        onLeftTrackedApp()
    }

    private val settleDelayMs = 600L
    private var settleRetries = 0
    private val settleCheck = Runnable { handleWindowSwitch(null, "settle", settleRetries, confirmed = true) }

    /** Tear down every overlay and reset per-app state: we are no longer in IG/YT. */
    private fun onLeftTrackedApp() {
        mainHandler.removeCallbacks(hideRunnable)
        stopReelTimer()
        stopCoverTicker()
        hideOverlay()
        removeCatCover()
        hideNudgeModal()
        reelCounter.lastKey = null
        shortCounter.lastKey = null
        setTrackedEvents(false)
        // Likely heading back to the home screen — make the widget current.
        updateWidget(force = true)
    }

    /**
     * A payment app is up, or an app that hides its screen from accessibility
     * services. Paytm and friends refuse to proceed while this service is ENABLED (not merely while an overlay exists; see [PaymentPause]), so the
     * only fix is to switch ourselves off. disableSelf() is one-way: the service
     * stays off until re-enabled from Settings or, with WRITE_SECURE_SETTINGS
     * granted over adb, by the app itself. onUnbind() follows and clears overlays.
     */
    private fun pauseForPaymentApp(pkg: String, label: String = PaymentPause.label(pkg)) {
        Log.i(TAG, "payment app $pkg ($label) in front; disabling self")
        onLeftTrackedApp()
        PaymentPause.markPaused(this, pkg, label)
        runCatching { disableSelf() }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        val pkg = event.packageName?.toString()
        if (pkg != instagramPackage && pkg != youtubePackage) {
            // Only a window switch can mean we left a tracked app; anything else
            // from a foreign package (keyboard content, system UI) is noise. Two
            // events signal a switch: an app's own window-state change, and the
            // system's windows-changed notice (package null), which is the one
            // that reliably fires when an app is merely resumed from Recents.
            val type = event.eventType
            if (type != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
                type != AccessibilityEvent.TYPE_WINDOWS_CHANGED
            ) return
            // The keyboard or a system dialog opening over Instagram also reports a
            // foreign package. Trust the active window, not the event's sender.
            // (Never throttled: leaving must be instant.)
            handleWindowSwitch(pkg, AccessibilityEvent.eventTypeToString(type), retriesLeft = 2)
            return
        }
        mainHandler.removeCallbacks(settleCheck)
        setTrackedEvents(true)

        // A playing reel floods content-changed events; cap the expensive node scan
        // to ~5Hz. The self-pollers (cover/pill) still catch anything between events.
        val now = System.currentTimeMillis()
        if (!debug && now - lastEventScanAt < eventScanMinMs) return
        lastEventScanAt = now

        val root = rootInActiveWindow ?: return

        // Block mode is latency-sensitive — the cat cover has to track the reel and
        // react the instant you change tabs — so it runs ONE fast detection pass per
        // platform (not the broader guilt detectors) and reacts to the event type.
        if (isBlockingNow() && !debug) {
            stopReelTimer()
            // Auto-block (guilt at limit): announce it once, and hold while the
            // alert is up rather than also bouncing underneath it.
            if (currentMode() == "guilt") {
                if (maybeShowLimitAlert()) return
                if (nudgeModalShown) return
            }
            if (pkg == youtubePackage) {
                handleBlockFullScreen(detectShort(root) != null)
            } else {
                handleBlockInstagram()
            }
            return
        }

        // Guilt mode (and the debug overlay): one detection pass per package. Block
        // mode uses STRICT full-screen detection so it never bounces you out of the
        // feed; guilt uses BROADER detection that also counts reels/shorts watched
        // inline in the feed — there we only measure, so anything you watch counts.
        val counter = if (pkg == youtubePackage) shortCounter else reelCounter
        val hit = if (pkg == youtubePackage) detectShortGuilt(root) else detectReelGuilt(root)

        if (debug) {
            mainHandler.removeCallbacks(hideRunnable)
            render(debugText(root, hit))
            return
        }

        // Guilt mode: show + accrue only when actually viewing a reel ON-SCREEN (so the
        // pill doesn't latch onto an off-screen Reels-tab pager neighbour). Counting
        // still keys off the broader detector's identity.
        val onReel = if (pkg == youtubePackage) hit != null else onReelSurface(root)
        if (onReel) {
            val justEntered = !wasOnReel
            wasOnReel = true
            if (hit != null) countItem(counter, hit.key)
            startReelTimer()
            render()
            startPillTicker() // owns the pill's hide: pulls it the instant you leave a reel
            if (justEntered && !nudgeModalShown) {
                val s = currentSeconds()
                val c = currentCount() + prefs.getInt("shortsCount", 0)
                pickNudgeKey("entry", s, s, c, c, sittingSeconds, sittingSeconds)
                    ?.let { showNudge(it) }
            }
        }
        // No else: the pill ticker takes it down on its own clock.
    }

    private fun startPillTicker() {
        if (pillTickerRunning) return
        pillTickerRunning = true
        mainHandler.postDelayed(pillTicker, pillTickMs)
    }

    private fun stopPillTicker() {
        pillTickerRunning = false
        mainHandler.removeCallbacks(pillTicker)
    }

    /**
     * Returns true while the pill should stay (still on a reel) so the ticker keeps
     * polling; false once it's pulled (you left the reel / the app), which stops it.
     */
    private fun refreshPill(): Boolean {
        if (debug) return false
        if (!overlayShown) return false
        val root = rootInActiveWindow ?: return true // transient; keep checking
        val pkg = root.packageName?.toString()
        if (pkg != instagramPackage && pkg != youtubePackage) {
            stopReelTimer(); hideOverlay(); return false // left the app
        }
        if (isBlockingNow()) {
            // Blocking now: on Instagram the cat cover is the feedback, so pull the
            // scroll pill so it doesn't linger on top of the blocked feed. (YouTube
            // shows its own "Blocked" pill via renderBlocked from the event path.)
            if (pkg == instagramPackage) { stopReelTimer(); hideOverlay() }
            return false
        }
        val onReel = if (pkg == youtubePackage) detectShortGuilt(root) != null else onReelSurface(root)
        if (onReel) return true
        stopReelTimer(); hideOverlay(); return false // off a reel → gone
    }

    /**
     * Fast, on-screen-scoped "am I actually viewing a reel right now?" — used by the pill
     * ticker (so it can poll quickly) and to gate the pill on/off. Two direct view-id
     * lookups, no tree walk:
     *  - the Reels player (`clips_viewer_view_pager`) ON-SCREEN (covers the window), which
     *    rejects the Reels tab when it's parked off-screen as a bottom-nav pager neighbour
     *    (that off-screen reel is exactly what kept the pill stuck on Profile/Search), or
     *  - a large, on-screen inline feed video.
     */
    private fun onReelSurface(root: AccessibilityNodeInfo): Boolean {
        val win = Rect().also { root.getBoundsInScreen(it) }
        if (win.width() <= 0) return false
        runCatching {
            root.findAccessibilityNodeInfosByViewId("$instagramPackage:id/clips_viewer_view_pager")
        }.getOrNull()?.forEach {
            if (it.isVisibleToUser && coversScreen(root, it)) return true
        }
        runCatching {
            root.findAccessibilityNodeInfosByViewId("$instagramPackage:id/video_container")
        }.getOrNull()?.forEach {
            if (it.isVisibleToUser) {
                val b = Rect().also { r -> it.getBoundsInScreen(r) }
                if (onScreenLargeVideo(b, win)) return true
            }
        }
        return false
    }

    private fun currentMode(): String = prefs.getString("mode", "guilt") ?: "guilt"

    // --- Auto-block at the daily limit ----------------------------------------
    /** Extra minutes granted today via the "1 more minute" button (on the dashboard). */
    private fun extraMinutes(): Int = prefs.getInt("extraMinutes", 0)

    /** Guilt user is over the daily limit (plus any granted grace): reels are bounced. */
    private fun autoBlocking(): Boolean {
        if (currentMode() != "guilt") return false
        return currentSeconds() >= (limitMinutes() + extraMinutes()) * 60
    }

    /** Reels should be bounced right now: manual Block, or auto-block at the limit. */
    private fun isBlockingNow(): Boolean = currentMode() == "block" || autoBlocking()

    /** Throttled Back-press used to bounce the user out of a full-screen reel/short. */
    private fun backThrottled() {
        val now = System.currentTimeMillis()
        if (now - lastBackAt > 1200L) {
            lastBackAt = now
            performGlobalAction(GLOBAL_ACTION_BACK)
        }
    }

    /**
     * Block mode for a full-screen-only platform (YouTube Shorts): Back-press on
     * sight with a brief "Blocked" pill, else let the overlays fade after a grace.
     */
    private fun handleBlockFullScreen(inReels: Boolean) {
        if (inReels) {
            mainHandler.removeCallbacks(hideRunnable)
            hideCatCover()
            backThrottled()
            renderBlocked()
        } else if (overlayShown || catCoverShown) {
            mainHandler.removeCallbacks(hideRunnable)
            mainHandler.postDelayed(hideRunnable, hideDelayMs)
        }
    }

    /**
     * Block mode for Instagram. An accessibility event just kicks the self-scheduling
     * [coverTicker]; the actual decision lives in [refreshCover] so events and the
     * ticker share one code path. Starting the ticker here means the cover keeps
     * tracking (and hides itself) even after IG stops emitting events.
     */
    private fun handleBlockInstagram() {
        if (refreshCover()) startCoverTicker()
    }

    private fun startCoverTicker() {
        if (coverTickerRunning) return
        coverTickerRunning = true
        mainHandler.postDelayed(coverTicker, coverTickMs)
    }

    private fun stopCoverTicker() {
        coverTickerRunning = false
        mainHandler.removeCallbacks(coverTicker)
    }

    /**
     * One Block-mode decision for the CURRENT Instagram screen. Returns true while the
     * block is up (so the ticker keeps polling), false once we're clear.
     *  - Full-screen Reels player → Back-press (+ "Blocked" pill), stop covering.
     *  - On the home feed → blank the whole feed with the touch-eating cat cover.
     *  - A couple of empty scans in a row → uncover. This is what makes leaving the
     *    feed (or switching tabs) feel instant without flickering on a dropped frame.
     */
    /**
     * Keeps polling (returns true) the whole time Instagram is foreground, so the block
     * shows/hides within one tick (~55ms) of any screen change — including snapping back
     * the instant a story closes onto the feed. Returns false only when we've left IG or
     * block mode, which stops the ticker until the next event restarts it.
     */
    /**
     * Keeps polling (returns true) the whole time Instagram is foreground, so the block
     * shows/hides within one tick (~55ms) of any screen change. The decision is driven
     * by a single fast signal — the bottom-nav HOME TAB being selected — so switching to
     * Reels/Messages/Search/Profile (or opening a story) uncovers INSTANTLY: we don't do
     * any heavy tree work unless we're actually on the feed and about to draw the block.
     */
    private fun refreshCover(): Boolean {
        if (!isBlockingNow()) { removeCatCover(); return false }
        if (nudgeModalShown) return true // hold the cover while the limit alert is up
        val root = rootInActiveWindow ?: return true // transient; keep polling
        if (root.packageName?.toString() != instagramPackage) { removeCatCover(); return false }

        val win = Rect().also { root.getBoundsInScreen(it) }

        // Full-screen Reels player → bounce out (and uncover). One direct lookup.
        if (isFullScreenReel(root, win)) {
            hideCatCover()
            backThrottled()
            renderBlocked()
            mainHandler.removeCallbacks(hideRunnable)
            mainHandler.postDelayed(hideRunnable, hideDelayMs)
            return true
        }

        // On/off signal: the Home tab is selected, OR a real feed post is on screen.
        // Both are needed — the Home tab's `isSelected` flips reliably when you switch
        // tabs, but Instagram often DOESN'T set it on a freshly-opened feed (cold start),
        // where a visible `row_feed_profile_header` is the dependable tell instead. Either
        // way Explore/Reels/Profile/DMs and stories don't expose a visible feed post.
        var feedTabSelected = false
        var navTop = -1
        runCatching {
            root.findAccessibilityNodeInfosByViewId("$instagramPackage:id/feed_tab")
        }.getOrNull()?.forEach { n ->
            if (n.isVisibleToUser) {
                if (n.isSelected) feedTabSelected = true
                val b = Rect().also { n.getBoundsInScreen(it) }
                if (win.height() > 0 && b.top > win.top + win.height() / 2 &&
                    (navTop < 0 || b.top < navTop)
                ) navTop = b.top
            }
        }
        var feedContentTop = -1
        runCatching {
            root.findAccessibilityNodeInfosByViewId("$instagramPackage:id/row_feed_profile_header")
        }.getOrNull()?.forEach { n ->
            if (n.isVisibleToUser) {
                val b = Rect().also { n.getBoundsInScreen(it) }
                if (feedContentTop < 0 || b.top < feedContentTop) feedContentTop = b.top
            }
        }
        if (!feedTabSelected && feedContentTop < 0) { hideCatCover(); hideOverlay(); return true }

        // On the home feed → work out the block bounds (leaving the stories tray) and show.
        val appBarBottom = win.top + dp(85)
        val top = maxOf(appBarBottom, feedContentTop)
        val bottom = if (navTop > win.top + win.height() / 2) navTop else win.bottom - dp(60)
        if (win.width() <= 0 || bottom <= top) { hideCatCover(); return true }

        hideOverlay() // the cover is the feedback here; don't also show the pill
        showBlockCover(Rect(win.left, top, win.right, bottom))
        // Guard the stories-tray strip against scroll while leaving the circles tappable.
        if (feedContentTop > appBarBottom + dp(36)) {
            showTrayCover(Rect(win.left, appBarBottom, win.right, feedContentTop))
        } else {
            hideTrayCover()
        }
        return true
    }

    /** Full-screen Reels player? One direct lookup of the clips pager, must cover the window. */
    private fun isFullScreenReel(root: AccessibilityNodeInfo, win: Rect): Boolean {
        val pagers = runCatching {
            root.findAccessibilityNodeInfosByViewId("$instagramPackage:id/clips_viewer_view_pager")
        }.getOrNull() ?: return false
        for (p in pagers) if (p.isVisibleToUser && coversScreen(root, p)) return true
        return false
    }

    /**
     * Count this item (reel or short, identified by [key]) into [counter] unless
     * we've already counted it today. A null key means labels haven't loaded yet,
     * so we wait for a later event. Keys are matched by word-overlap so a
     * still-loading caption doesn't double-count, and scrolling back doesn't recount.
     */
    private fun countItem(counter: Counter, key: String?) {
        val today = today()
        if (seenKeysDate != today) {
            seenKeysDate = today
            reelCounter.recent.clear(); reelCounter.lastKey = null
            shortCounter.recent.clear(); shortCounter.lastKey = null
        }
        if (key == null) return
        // Same item as the last event (its caption may have just finished loading,
        // growing the key) — adopt the fuller key but don't recount.
        counter.lastKey?.let { if (overlap(key, it) >= 0.9f) { counter.lastKey = key; return } }
        counter.lastKey = key
        // Scrolled back to an item already counted today.
        if (counter.recent.any { overlap(key, it) >= 0.9f }) return
        counter.recent.addFirst(key)
        while (counter.recent.size > 50) counter.recent.removeLast()
        incrementPref(counter.countPref)
    }

    /** Fraction of the smaller key's words shared with the other (0f..1f). */
    private fun overlap(a: String, b: String): Float {
        val wa = a.lowercase(Locale.US).split(' ', '|').filterTo(HashSet()) { it.isNotBlank() }
        val wb = b.lowercase(Locale.US).split(' ', '|').filterTo(HashSet()) { it.isNotBlank() }
        if (wa.isEmpty() || wb.isEmpty()) return if (a == b) 1f else 0f
        val shared = wa.count { it in wb }
        return shared.toFloat() / minOf(wa.size, wb.size)
    }

    private fun nodeText(node: AccessibilityNodeInfo): String? =
        node.text?.toString()?.takeIf { it.isNotBlank() }
            ?: node.contentDescription?.toString()?.takeIf { it.isNotBlank() }

    private fun debugText(root: AccessibilityNodeInfo, hit: Detected?): String {
        val ids = collectViewIdFragments(root, 6).joinToString(", ")
        return buildString {
            append("hit=").append(hit != null).append("  n=").append(currentCount()).append('\n')
            append("key=").append(hit?.key ?: "—").append('\n')
            append("ids=").append(if (ids.isBlank()) "—" else ids)
        }
    }

    override fun onInterrupt() {}

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        mainHandler.removeCallbacks(hideRunnable)
        stopCoverTicker()
        hideOverlay()
        removeCatCover()
        return super.onUnbind(intent)
    }

    // --- Detection heuristics (tuning lives here) ------------------------------

    /** A confirmed full-screen reel/short and its identity [key] (null until loaded). */
    private class Detected(val key: String?)

    /**
     * THE single source of truth for "are we on a full-screen Reel, and which one".
     * Every reel-related action — block-mode Back, guilt counting, the time meter —
     * consumes this one result, so they can never disagree on what a reel is.
     * Returns null unless the dedicated full-screen player actually fills the window.
     *
     * Anchor on ids that exist ONLY in the dedicated full-screen Reels player
     * (Instagram's ClipsViewerFragment), verified against a real device tree and
     * corroborated by every mature open-source IG reel-blocker (curbox, etc.):
     *
     *   - clips_viewer_view_pager: the vertical full-screen ReboundViewPager
     *     holding the swipeable reels. The home feed, Explore, and profile Reels
     *     grids are RecyclerViews and never have it; DM reel-preview bubbles don't.
     *   - clips_ufi_component / clips_author_username / clips_captions_component:
     *     per-reel chrome, present only once a reel has actually rendered. Requiring
     *     at least one rejects the transient/empty clips container, while OR-ing
     *     them survives IG's chrome-stripped fullscreen variants. The author +
     *     caption text double as the per-reel identity [key].
     *
     * We deliberately do NOT match the bottom-nav Reels tab (clips_tab, on every
     * screen), "Reel by" text (feed + DM-shared reels carry it too), nor the story
     * player (reel_viewer_root) — all historical false positives.
     *
     * The id pair alone is NOT enough: IG keeps recycled/off-screen pager nodes in
     * the tree during transitions, and embedded reels surface partial nodes. So we
     * additionally require the pager to be visible AND to physically fill the window
     * (coversScreen) — this is what stops Block mode from pressing Back on DM
     * bubbles, feed items, and the reel sliding away mid-transition.
     */
    private fun detectReel(root: AccessibilityNodeInfo): Detected? {
        var pager: AccessibilityNodeInfo? = null
        var hasReelChrome = false
        var author: String? = null
        var caption: String? = null
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        while (queue.isNotEmpty() && visited < 3000) {
            val node = queue.removeFirst()
            visited++
            node.viewIdResourceName?.let { id ->
                when {
                    // Stories - never the Reels player. Bail the whole detection.
                    id.endsWith("reel_viewer_root") -> return null
                    id.endsWith("clips_viewer_view_pager") ->
                        if (pager == null && node.isVisibleToUser) pager = node
                    id.endsWith("clips_ufi_component") ->
                        if (node.isVisibleToUser) hasReelChrome = true
                    id.endsWith("clips_author_username") -> {
                        hasReelChrome = true
                        if (author == null) author = nodeText(node)
                    }
                    id.endsWith("clips_captions_component") -> {
                        hasReelChrome = true
                        if (caption == null) caption = nodeText(node)
                    }
                }
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        val visiblePager = pager ?: return null
        if (!hasReelChrome) return null
        if (!coversScreen(root, visiblePager)) return null
        // Identity: author + caption prefix (taken before IG's "… more" truncation
        // so an expanding caption doesn't read as a different reel). Null until loaded.
        val key = buildString {
            author?.trim()?.let { append(it) }
            append('|')
            caption?.trim()?.take(48)?.let { append(it) }
        }.trim('|').ifBlank { null }
        return Detected(key)
    }

    /**
     * Guilt-mode reel detection — broader than [detectReel]. Counts two cases the
     * strict full-screen detector misses, because in guilt mode we only measure, so
     * anything you're actually watching should count:
     *
     *   1. The dedicated Reels player, via its `clips_*` chrome (like the strict
     *      detector, but without requiring full-window coverage).
     *   2. A video playing inline in the HOME FEED — delegated to [detectFeedVideo],
     *      which is fenced tightly to the focused feed row (see its doc).
     */
    private fun detectReelGuilt(root: AccessibilityNodeInfo): Detected? {
        var hasReelChrome = false
        var author: String? = null
        var caption: String? = null
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        while (queue.isNotEmpty() && visited < 3000) {
            val node = queue.removeFirst()
            visited++
            node.viewIdResourceName?.let { id ->
                when {
                    id.endsWith("reel_viewer_root") -> return null // stories, not reels
                    id.endsWith("clips_ufi_component") ->
                        if (node.isVisibleToUser) hasReelChrome = true
                    id.endsWith("clips_author_username") ->
                        if (node.isVisibleToUser) {
                            hasReelChrome = true
                            if (author == null) author = nodeText(node)
                        }
                    id.endsWith("clips_captions_component") ->
                        if (node.isVisibleToUser) {
                            hasReelChrome = true
                            if (caption == null) caption = nodeText(node)
                        }
                }
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }

        // Case 1: dedicated Reels player.
        if (hasReelChrome) {
            val key = buildString {
                author?.trim()?.let { append(it) }
                append('|')
                caption?.trim()?.take(48)?.let { append(it) }
            }.trim('|').ifBlank { null }
            return Detected(key)
        }

        // Case 2: inline home-feed video.
        return detectFeedVideo(root)?.let { Detected(it.key) }
    }

    /** An inline home-feed video: its on-screen [bounds] and its identity [key]. */
    private class FeedVideo(val bounds: Rect, val key: String?)

    /**
     * Detect a video playing inline in the Instagram HOME FEED, returning the
     * playing `video_container`'s screen bounds (so Block mode can cover it) and a
     * stable per-post identity key. Shared by guilt counting and block-mode covering.
     *
     * Fenced tightly to the focused feed row so it never reacts to anything else:
     * it fires ONLY when the feed UFI bar (`row_feed_view_group_buttons`, which
     * renders only for the focused feed row) is present AND a `video_container`
     * fills the row's width. That excludes DMs/messages (those are `direct_*` with
     * no `row_feed_*`), Explore and profile reel grids (thumbnails, no large playing
     * video + no feed UFI), the suggested-reels carousel (small previews), and photo
     * posts (no `video_container`). Stories (`reel_viewer_root`) bail out.
     */
    private fun detectFeedVideo(root: AccessibilityNodeInfo): FeedVideo? {
        // "We're in the home-feed timeline" — ANY visible `row_feed_*` node proves it
        // (those ids exist only in feed rows, never DMs/Explore/grids). We use this
        // broad signal rather than the UFI bar specifically, because once a reel fills
        // the viewport its own like/comment bar scrolls off the bottom — the very
        // moment we most need to cover it. The post header usually stays on screen.
        var feedContext = false
        var videoBox: Rect? = null
        var author: String? = null
        var headerDesc: String? = null

        val win = Rect().also { root.getBoundsInScreen(it) }
        if (win.width() <= 0) return null
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        while (queue.isNotEmpty() && visited < 3000) {
            val node = queue.removeFirst()
            visited++
            node.viewIdResourceName?.let { id ->
                when {
                    id.endsWith("reel_viewer_root") -> return null // stories
                    id.contains("row_feed_profile_header") ->
                        if (node.isVisibleToUser) {
                            feedContext = true
                            if (headerDesc == null) headerDesc = node.contentDescription?.toString()
                        }
                    id.contains("row_feed_photo_profile_name") ->
                        if (node.isVisibleToUser) {
                            feedContext = true
                            if (author == null) author = nodeText(node)
                        }
                    id.contains("row_feed") ->
                        if (node.isVisibleToUser) feedContext = true
                    id.endsWith("video_container") ->
                        if (node.isVisibleToUser && videoBox == null) {
                            val box = Rect().also { node.getBoundsInScreen(it) }
                            if (onScreenLargeVideo(box, win)) videoBox = box
                        }
                }
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }

        if (!feedContext) return null
        val box = videoBox ?: return null
        // Identity = the feed header's description with its drifting relative
        // timestamp ("9 hours ago") stripped, falling back to the author handle.
        val key = (headerDesc?.let { stripRelativeTime(it) } ?: author)?.trim()?.ifBlank { null }
        return FeedVideo(box, key)
    }

    /**
     * Is [box] a large video that's actually ON this screen (not an off-screen
     * ViewPager neighbour)? IG keeps the feed tab alive beside Explore/Reels in a
     * horizontal pager, and its `video_container` still reports visible — just parked
     * at x≈-width. We require the box to fill the row's width AND straddle the visible
     * horizontal centre, which rejects those parked neighbours so the cover releases
     * the moment you leave the feed tab.
     */
    private fun onScreenLargeVideo(box: Rect, win: Rect): Boolean {
        if (win.width() <= 0) return false
        if (box.width() < win.width() * 0.90f) return false
        val cx = win.centerX()
        if (box.left > cx || box.right < cx) return false
        return box.bottom > win.top && box.top < win.bottom
    }

    /** Drop a trailing relative timestamp so a post's key doesn't drift as time passes. */
    private fun stripRelativeTime(s: String): String =
        s.replace(
            Regex(
                "\\s*\\d+\\s*(s|m|h|d|w|second|minute|hour|day|week|month|year)s?\\s*ago\\s*$",
                RegexOption.IGNORE_CASE
            ),
            ""
        ).replace(Regex("\\s*(just now|now)\\s*$", RegexOption.IGNORE_CASE), "").trim()

    /**
     * YouTube Shorts analog of [detectReel]. Anchors on `reel_recycler` — the
     * vertical RecyclerView of the full-screen Shorts player, which (unlike IG) is
     * absent from the home Shorts shelf, search, and watch page, so it alone
     * excludes those. We still require it to fill the window (coversScreen) to
     * reject any embedded variant and recycled/off-screen nodes.
     *
     * Identity: YouTube exposes no clean author/title nodes (heavy obfuscation), so
     * we concatenate all text under `reel_player_page_content` and cleanse the fixed
     * chrome strings, then de-dup by the same word-overlap as reels. Verified
     * against curbox + ReVanced, which both anchor on `reel_recycler`.
     */
    private fun detectShort(root: AccessibilityNodeInfo): Detected? {
        var recycler: AccessibilityNodeInfo? = null
        var pageContent: AccessibilityNodeInfo? = null
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        while (queue.isNotEmpty() && visited < 3000) {
            val node = queue.removeFirst()
            visited++
            node.viewIdResourceName?.let { id ->
                when {
                    id.endsWith("reel_recycler") ->
                        if (recycler == null && node.isVisibleToUser) recycler = node
                    id.endsWith("reel_player_page_content") ->
                        if (pageContent == null && node.isVisibleToUser) pageContent = node
                }
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        val player = recycler ?: return null
        if (!coversScreen(root, player)) return null
        return Detected(shortKey(pageContent ?: player))
    }

    /**
     * Guilt-mode shorts detection — broader than [detectShort]. Same `reel_recycler`
     * anchor (which only exists in the full-screen Shorts player, so the home Shorts
     * shelf of thumbnails still won't count), but without the strict full-window
     * coverage gate, so transitions and slightly-inset players still accrue time.
     */
    private fun detectShortGuilt(root: AccessibilityNodeInfo): Detected? {
        var recycler: AccessibilityNodeInfo? = null
        var pageContent: AccessibilityNodeInfo? = null
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        while (queue.isNotEmpty() && visited < 3000) {
            val node = queue.removeFirst()
            visited++
            node.viewIdResourceName?.let { id ->
                when {
                    id.endsWith("reel_recycler") ->
                        if (recycler == null && node.isVisibleToUser) recycler = node
                    id.endsWith("reel_player_page_content") ->
                        if (pageContent == null && node.isVisibleToUser) pageContent = node
                }
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        val player = recycler ?: return null
        return Detected(shortKey(pageContent ?: player))
    }

    /**
     * Per-Short identity: all text + content-descriptions under the page-content
     * node, with YouTube's fixed chrome stripped out. Null until the overlay has
     * loaded enough to be meaningful (or when it's clearly a non-Short layout).
     */
    private fun shortKey(node: AccessibilityNodeInfo): String? {
        val raw = StringBuilder()
        collectText(node, raw, 0)
        val s = raw.toString()
            .replace("Video Progress", "")
            .replace("Tap to watch live", "")
            .replace("Go to channel", "")
            .replace("SearchMoreHomeHomeShortsShortsCreateSubscriptions", "")
            .trim()
        if (s.contains("PostPostPostlike")) return null // not a Short layout
        if (s.length <= 15) return null // not loaded yet — wait for a later event
        return s
    }

    private fun collectText(node: AccessibilityNodeInfo, out: StringBuilder, depth: Int) {
        if (depth > 40) return
        node.text?.let { if (it.isNotBlank()) out.append(it) }
        node.contentDescription?.let { if (it.isNotBlank()) out.append(it) }
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { collectText(it, out, depth + 1) }
        }
    }

    /**
     * The immersive Reels player fills its window; an embedded reel (a home-feed
     * item, a DM preview bubble) or a recycled/transitioning pager node does not.
     * Compare the pager's on-screen box to the active window's box rather than to a
     * fixed pixel size, so the test holds across devices, insets, and split-screen.
     */
    private fun coversScreen(root: AccessibilityNodeInfo, pager: AccessibilityNodeInfo): Boolean {
        val win = Rect().also { root.getBoundsInScreen(it) }
        val box = Rect().also { pager.getBoundsInScreen(it) }
        val w = win.width()
        val h = win.height()
        if (w <= 0 || h <= 0) return false
        // Off-screen / recycled pager parked outside the window.
        if (box.right <= win.left || box.left >= win.right) return false
        return box.width() >= w * 0.90f && box.height() >= h * 0.75f
    }

    // --- Counting + daily reset ------------------------------------------------

    private fun today(): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    /** Roll the reel count, the short count, and the shared timer over at midnight. */
    private fun ensureToday() {
        val today = today()
        val storedDate = prefs.getString("date", null)
        if (storedDate != today) {
            // Archive the finishing day into history before we zero it, so the
            // graph keeps it. Only days with real activity are stored. Use the
            // raw stored limit so a raise queued for the new day doesn't
            // retroactively raise yesterday's.
            if (storedDate != null) {
                val seconds = prefs.getInt("seconds", 0)
                val count = prefs.getInt("count", 0)
                val shorts = prefs.getInt("shortsCount", 0)
                if (seconds > 0 || count > 0 || shorts > 0) {
                    val finishingLimit = prefs.getInt("limitMinutes", 30).coerceIn(5, 240)
                    archiveDay(storedDate, seconds, count, shorts, finishingLimit)
                }
            }
            val editor = prefs.edit()
                .putString("date", today)
                .putInt("count", 0)
                .putInt("shortsCount", 0)
                .putInt("seconds", 0)
                .remove("nudgeFiredToday")
                .remove("extraMinutes") // grace resets each day
            // Promote a queued limit raise now that its day has arrived.
            val pending = prefs.getInt("pendingLimit", 0)
            val pendingDate = prefs.getString("pendingLimitDate", null)
            if (pending in 5..240 && pendingDate != null && today >= pendingDate) {
                editor.putInt("limitMinutes", pending)
                    .remove("pendingLimit")
                    .remove("pendingLimitDate")
            }
            editor.apply()
        }
    }

    /** Fold one finished day's totals into the persisted history JSON map. */
    private fun archiveDay(date: String, seconds: Int, count: Int, shorts: Int, limitMinutes: Int) {
        val history = runCatching {
            JSONObject(prefs.getString("history", "{}") ?: "{}")
        }.getOrElse { JSONObject() }
        history.put(
            date,
            JSONObject()
                .put("seconds", seconds)
                .put("count", count)
                .put("shorts", shorts)
                .put("limitMinutes", limitMinutes),
        )
        prefs.edit().putString("history", history.toString()).apply()
    }

    // --- Nudge selection -------------------------------------------------------

    /** "yyyy-MM-dd" for today minus [offsetDays], device-local — matches today(). */
    private fun dayKey(offsetDays: Int): String {
        val cal = java.util.Calendar.getInstance()
        cal.add(java.util.Calendar.DAY_OF_YEAR, -offsetDays)
        return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.time)
    }

    private fun archivedSeconds(date: String): Int {
        val json = runCatching {
            JSONObject(prefs.getString("history", "{}") ?: "{}")
        }.getOrElse { JSONObject() }
        return json.optJSONObject(date)?.optInt("seconds") ?: 0
    }

    /** Yesterday's archived reel/short seconds (0 if none recorded). */
    private fun yesterdaySeconds(): Int = archivedSeconds(dayKey(1))

    /** Rolling 7-day seconds: today's live counter + the last 6 archived days. */
    private fun weekSeconds(): Int {
        var total = currentSeconds()
        for (i in 1..6) total += archivedSeconds(dayKey(i))
        return total
    }

    private fun nudgeFiredToday(): MutableSet<String> =
        prefs.getStringSet("nudgeFiredToday", emptySet())?.toMutableSet() ?: mutableSetOf()

    private fun markNudgeFired(key: String) {
        val set = nudgeFiredToday()
        set.add(key)
        prefs.edit()
            .putStringSet("nudgeFiredToday", set)
            .putLong("lastNudgeAt", System.currentTimeMillis())
            .apply()
    }

    private fun cooldownActive(): Boolean =
        System.currentTimeMillis() - prefs.getLong("lastNudgeAt", 0L) < nudgeCooldownMs

    // Reel-time milestones every 3 minutes, 99 down to 3 (highest first for
    // priority). HARD (countdown) and cooldown-exempt — see pickNudgeKey/showNudge.
    private val timeThresholds = (33 downTo 1).map { "time${it * 3}" to it * 3 * 60 }
    private val countThresholds = listOf("count100" to 100, "count50" to 50, "count25" to 25)

    private fun crossed(prev: Int, cur: Int, at: Int): Boolean = prev < at && cur >= at

    /**
     * Highest-priority eligible trigger key, or null. Mirrors components/nudges.ts
     * (kept in sync as an executable spec of these rules).
     */
    private fun pickNudgeKey(
        event: String, prevSeconds: Int, seconds: Int,
        prevCount: Int, count: Int, prevSitting: Int, sitting: Int,
    ): String? {
        if (currentMode() != "guilt") return null
        // Reel-time milestones (time*) bypass the cooldown so each 3-min mark fires;
        // everything else respects it.
        val cooling = cooldownActive()

        val cal = java.util.Calendar.getInstance()
        val hour = cal.get(java.util.Calendar.HOUR_OF_DAY)
        val dow = cal.get(java.util.Calendar.DAY_OF_WEEK) // 1=Sun..7=Sat
        val isWeekday = dow in java.util.Calendar.MONDAY..java.util.Calendar.FRIDAY
        val yest = yesterdaySeconds()
        val fired = nudgeFiredToday()

        val candidates = mutableListOf<String>()
        if (event == "entry") {
            when {
                hour < 5 -> candidates.add("latenight")
                hour < 10 -> candidates.add("morning")
                isWeekday && hour < 17 -> candidates.add("workhours")
            }
        } else {
            if (crossed(prevSitting, sitting, 900)) candidates.add("sitting")
            for ((key, at) in timeThresholds) if (crossed(prevSeconds, seconds, at)) candidates.add(key)
            for ((key, at) in countThresholds) if (crossed(prevCount, count, at)) candidates.add(key)
            if (yest > 0 && crossed(prevSeconds, seconds, yest + 1)) candidates.add("vsyesterday")
        }
        if (event == "entry") {
            if (yest in 1..899) candidates.add("cleanday")
            candidates.add("weekly")
        }

        return candidates.firstOrNull { it !in fired && (it.startsWith("time") || !cooling) }
    }

    private fun currentCount(): Int {
        ensureToday()
        return prefs.getInt("count", 0)
    }

    private fun incrementPref(name: String) {
        ensureToday()
        val before = prefs.getInt(name, 0)
        prefs.edit().putInt(name, before + 1).apply()
        updateWidget(force = true)
        if (!nudgeModalShown) {
            val total = prefs.getInt("count", 0) + prefs.getInt("shortsCount", 0)
            val s = currentSeconds()
            pickNudgeKey("tick", s, s, total - 1, total, sittingSeconds, sittingSeconds)
                ?.let { showNudge(it) }
        }
    }

    /** Seconds spent on the full-screen Reels player today. */
    private fun currentSeconds(): Int {
        ensureToday()
        return prefs.getInt("seconds", 0)
    }

    private fun addSeconds(delta: Int) {
        ensureToday()
        val prev = prefs.getInt("seconds", 0)
        val cur = prev + delta
        prefs.edit().putInt("seconds", cur).apply()
        val prevSitting = sittingSeconds
        sittingSeconds += delta
        updateWidget()
        if (!nudgeModalShown) {
            val total = prefs.getInt("count", 0) + prefs.getInt("shortsCount", 0)
            pickNudgeKey("tick", prev, cur, total, total, prevSitting, sittingSeconds)
                ?.let { showNudge(it) }
        }
    }

    /**
     * Push the current counts to any placed home-screen widget. Throttled to once
     * per 10s so the per-second time ticker doesn't churn RemoteViews; [force]
     * bypasses the throttle for count changes and when leaving a tracked app.
     */
    private fun updateWidget(force: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!force && now - lastWidgetUpdateAt < 10_000L) return
        lastWidgetUpdateAt = now
        runCatching { WiltWidgetProvider.updateAll(this) }
    }

    // --- Time-on-reels ticker --------------------------------------------------

    private fun startReelTimer() {
        if (reelTimerRunning) return
        reelTimerRunning = true
        mainHandler.postDelayed(reelTimeTicker, 1000L)
    }

    private fun stopReelTimer() {
        if (!reelTimerRunning) return
        reelTimerRunning = false
        mainHandler.removeCallbacks(reelTimeTicker)
    }

    private fun isScreenOn(): Boolean =
        (getSystemService(POWER_SERVICE) as? PowerManager)?.isInteractive ?: true

    // --- Floating pill overlay -------------------------------------------------

    /**
     * Show the pill (building it on first call) and update it for the time spent
     * on reels today. The stopwatch reddens as the minutes climb; [debugText]
     * overrides the label when set.
     */
    private fun render(debugText: String? = null) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (!Settings.canDrawOverlays(this)) return

        if (!overlayShown) buildPill()
        catView?.setImageResource(catFaceRes())
        pillLabel?.setTextColor(CatDecay.textColor(currentSeconds() / 60, limitMinutes()))
        pillLabel?.text = debugText ?: pillText(currentSeconds())
    }

    /** Block-mode pill shown the instant we bounce the user out of reels. */
    private fun renderBlocked() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (!Settings.canDrawOverlays(this)) return
        if (!overlayShown) buildPill()
        catView?.setImageResource(CatDecay.drawableForStage(6)) // gone
        pillLabel?.setTextColor(Color.parseColor("#38C786"))
        pillLabel?.text = "Blocked"
    }

    /** Cat face for the pill/widget by how close today's time is to the limit. */
    private fun catFaceRes(): Int = CatDecay.drawable(currentSeconds() / 60, limitMinutes())

    private fun buildPill() {
        val cat = ImageView(this).apply {
            scaleType = ImageView.ScaleType.FIT_CENTER
            setImageResource(catFaceRes())
        }
        val label = TextView(this).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, if (debug) 11f else 15f)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            letterSpacing = 0.01f
        }

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(14), dp(10), dp(18), dp(10))
            background = pillBackground()
            elevation = dp(6).toFloat()
            addView(
                cat,
                LinearLayout.LayoutParams(dp(30), dp(30)).apply { rightMargin = dp(10) }
            )
            addView(label)
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = dp(52)
        }

        runCatching {
            windowManager?.addView(container, params)
            pill = container
            catView = cat
            pillLabel = label
            overlayShown = true
        }
    }

    private fun hideOverlay() {
        if (!overlayShown) return
        stopReelTimer()
        stopPillTicker()
        pill?.let { view -> runCatching { windowManager?.removeView(view) } }
        pill = null
        catView = null
        pillLabel = null
        overlayShown = false
        // Left the reel/app (debounced by hideRunnable): end this sitting and arm
        // the next entry trigger.
        sittingSeconds = 0
        wasOnReel = false
    }

    // --- Block-mode cat cover (inline feed reels) ------------------------------

    /**
     * Show the full-feed block at [bounds] (the feed area, above the bottom nav). The
     * cat (one of the unlocked ones) + line rotate each time the block re-appears, then
     * stay put while it's up. We only push a layout when first revealing or when the
     * bounds actually change, so a steady block doesn't churn updateViewLayout every tick.
     */
    private fun showBlockCover(bounds: Rect) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (!Settings.canDrawOverlays(this)) return
        if (bounds.width() <= 0 || bounds.height() <= 0) return
        if (catLayers.isEmpty()) buildCatCover()
        if (catLayers.isEmpty()) return

        val fresh = !catCoverVisible
        if (fresh) {
            // A random photo from the cats you have unlocked, and the next line.
            val idx = blockShowSeq++
            val resId = randomUnlockedCatRes()
            if (resId != 0) catImageView?.setImageResource(resId)
            catTextView?.text = coverLines[idx % coverLines.size]
        }
        if (fresh || bounds != lastCoverBounds) {
            lastCoverBounds = Rect(bounds)
            for (layer in catLayers) {
                val lp = layer.layoutParams as WindowManager.LayoutParams
                lp.x = bounds.left
                lp.y = bounds.top
                lp.width = bounds.width()
                lp.height = bounds.height()
                lp.alpha = 1f
                lp.flags = lp.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
                runCatching { windowManager?.updateViewLayout(layer, lp) }
            }
        }
        catCoverVisible = true
    }

    private fun buildCatCover() {
        // Bottom-to-top: plain dark layers for occlusion, the cat card only on top.
        for (i in 0 until catCoverLayerCount) {
            val cover = FrameLayout(this).apply {
                setBackgroundColor(Color.parseColor("#050507"))
                isClickable = true // swallow taps/scrolls inside the block
                setOnClickListener { /* eat */ }
            }
            if (i == catCoverLayerCount - 1) {
                val img = ImageView(this).apply {
                    scaleType = ImageView.ScaleType.CENTER_CROP
                    clipToOutline = true
                    outlineProvider = object : ViewOutlineProvider() {
                        override fun getOutline(view: View, outline: Outline) {
                            outline.setRoundRect(0, 0, view.width, view.height, dp(22).toFloat())
                        }
                    }
                }
                val label = TextView(this).apply {
                    setTextColor(Color.WHITE)
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
                    typeface = Typeface.create(Typeface.DEFAULT_BOLD, Typeface.BOLD)
                    gravity = Gravity.CENTER
                    setLineSpacing(dp(3).toFloat(), 1f)
                }
                val card = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER_HORIZONTAL
                    setPadding(dp(24), dp(24), dp(24), dp(24))
                    addView(img, LinearLayout.LayoutParams(dp(190), dp(190)))
                    addView(
                        label,
                        LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.WRAP_CONTENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                        ).apply { topMargin = dp(20) }
                    )
                }
                cover.addView(
                    card,
                    FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.WRAP_CONTENT,
                        FrameLayout.LayoutParams.WRAP_CONTENT,
                        Gravity.CENTER
                    )
                )
                catImageView = img
                catTextView = label
            }

            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                // No NOT_TOUCHABLE → the cover CONSUMES touches inside its bounds, so the
                // feed can't be scrolled. NOT_FOCUSABLE keeps it from grabbing the keyboard;
                // NOT_TOUCH_MODAL lets touches OUTSIDE its bounds (the bottom nav) through so
                // you can still leave. LAYOUT_IN_SCREEN/NO_LIMITS → absolute screen coords.
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                alpha = 0f // built hidden; showBlockCover reveals
            }
            runCatching {
                windowManager?.addView(cover, params)
                catLayers.add(cover)
            }
        }
    }

    /** Hide the cover by making the (persistent) layers transparent — no removeView.
     *  Does NOT touch the ticker; its lifecycle is driven by [refreshCover]'s return. */
    private fun hideCatCover() {
        hideTrayCover()
        if (!catCoverVisible) return
        catCoverVisible = false
        lastCoverBounds = null
        for (layer in catLayers) {
            val lp = layer.layoutParams as WindowManager.LayoutParams
            lp.alpha = 0f
            // Invisible must also mean intangible: alpha is visual-only, and a
            // hidden-but-touchable layer would keep eating taps inside its old bounds.
            lp.flags = lp.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
            runCatching { windowManager?.updateViewLayout(layer, lp) }
        }
    }

    /**
     * Real teardown of the cover + tray windows. Called whenever we are no longer
     * actively covering inside Instagram (leave-app, screen-off, block-mode-off,
     * unbind): payment apps refuse to run while any foreign overlay window exists,
     * so nothing may stay attached outside a tracked app. Layers rebuild lazily.
     */
    private fun removeCatCover() {
        for (layer in catLayers) runCatching { windowManager?.removeView(layer) }
        catLayers.clear()
        catImageView = null
        catTextView = null
        catCoverVisible = false
        lastCoverBounds = null
        trayCover?.let { runCatching { windowManager?.removeView(it) } }
        trayCover = null
        trayCoverActive = false
    }

    // --- Nudge modal -----------------------------------------------------------

    /** Build + show the center modal for [key], if still eligible. */
    private fun showNudge(key: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (!Settings.canDrawOverlays(this)) return
        if (nudgeModalShown) return

        val (tag, headline, body) = nudgeCopy(key)
        val hard = key in nudgeHardKeys || key.startsWith("time")

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(16), dp(18), dp(16))
            background = nudgeCardBackground()
            elevation = dp(12).toFloat()
        }

        if (tag != null) {
            card.addView(TextView(this).apply {
                text = tag.removePrefix("// ")
                setTextColor(Color.parseColor("#E0913C"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
                typeface = Typeface.create(Typeface.DEFAULT_BOLD, Typeface.BOLD)
                letterSpacing = 0.08f
                setPadding(dp(11), dp(5), dp(11), dp(5))
                background = GradientDrawable().apply {
                    cornerRadius = dp(999).toFloat()
                    setColor(Color.parseColor("#24E0913C")) // ~14% amber tint
                }
            }, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = dp(12) })
        }

        // A cat photo from the ones the user has unlocked.
        val img = ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            clipToOutline = true
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(view: View, outline: Outline) {
                    outline.setRoundRect(0, 0, view.width, view.height, dp(13).toFloat())
                }
            }
            val resId = randomUnlockedCatRes()
            if (resId != 0) setImageResource(resId)
        }
        card.addView(img, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(124)))

        card.addView(TextView(this).apply {
            text = headline
            setTextColor(Color.parseColor("#F2F1EC"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            typeface = Typeface.create(Typeface.DEFAULT_BOLD, Typeface.BOLD)
        }, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(12) })

        card.addView(TextView(this).apply {
            text = body
            setTextColor(Color.parseColor("#9A9A92"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setLineSpacing(dp(3).toFloat(), 1f)
        }, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(8) })

        val catBtn = TextView(this).apply {
            text = "Watch a cat instead"
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#0D0D0C"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14.5f)
            typeface = Typeface.create(Typeface.DEFAULT_BOLD, Typeface.BOLD)
            setPadding(0, dp(14), 0, dp(14))
            background = nudgeButtonBackground("#F2F1EC")
            setOnClickListener { hideNudgeModal(); launchCatGallery() }
        }
        card.addView(catBtn, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(18) })

        val keepBtn = TextView(this).apply {
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#62625B"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            typeface = Typeface.DEFAULT
            setPadding(0, dp(12), 0, dp(6))
            text = "Keep scrolling"
        }
        card.addView(keepBtn, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(4) })

        // Full-screen scrim that consumes touches (blocks the reel underneath).
        val scrim = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#BF000000"))
            isClickable = true
            setOnClickListener { /* eat */ }
            addView(card, FrameLayout.LayoutParams(
                dp(300), FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER
            ).apply { leftMargin = dp(16); rightMargin = dp(16) })
        }

        // HARD: gate "Keep scrolling" behind a 3-2-1 countdown; SOFT: instant.
        if (hard) {
            var remaining = 3
            keepBtn.isEnabled = false
            keepBtn.alpha = 0.5f
            keepBtn.text = "Keep scrolling ($remaining)"
            val tick = object : Runnable {
                override fun run() {
                    remaining -= 1
                    if (remaining <= 0) {
                        keepBtn.text = "Keep scrolling"
                        keepBtn.isEnabled = true
                        keepBtn.alpha = 1f
                        keepBtn.setOnClickListener { hideNudgeModal() }
                        nudgeCountdown = null
                    } else {
                        keepBtn.text = "Keep scrolling ($remaining)"
                        mainHandler.postDelayed(this, 1000L)
                    }
                }
            }
            nudgeCountdown = tick
            mainHandler.postDelayed(tick, 1000L)
        } else {
            keepBtn.setOnClickListener { hideNudgeModal() }
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.TOP or Gravity.START }

        runCatching {
            windowManager?.addView(scrim, params)
            nudgeModal = scrim
            nudgeModalShown = true
            markNudgeFired(key)
        }
    }

    private fun hideNudgeModal() {
        nudgeCountdown?.let { mainHandler.removeCallbacks(it) }
        nudgeCountdown = null
        nudgeModal?.let { view -> runCatching { windowManager?.removeView(view) } }
        nudgeModal = null
        nudgeModalShown = false
    }

    /** Bring Wilt to the front and ask it to open the cat gallery. */
    private fun launchCatGallery() {
        prefs.edit().putBoolean("openCats", true).apply()
        val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        }
        runCatching { if (intent != null) startActivity(intent) }
    }

    /** Announce auto-block once per day when it first engages (guilt only). */
    private fun maybeShowLimitAlert(): Boolean {
        if (currentMode() != "guilt") return false
        if (nudgeModalShown) return false
        if (prefs.getString("limitAlertDate", "") == today()) return false
        prefs.edit().putString("limitAlertDate", today()).apply()
        showLimitReached()
        return nudgeModalShown
    }

    /** "You hit your limit" card. Reels stay blocked until the next daily reset. */
    private fun showLimitReached() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (!Settings.canDrawOverlays(this)) return
        if (nudgeModalShown) return

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22), dp(22), dp(22), dp(20))
            background = nudgeCardBackground()
            elevation = dp(12).toFloat()
        }

        card.addView(TextView(this).apply {
            text = "${currentSeconds() / 60} min today"
            setTextColor(Color.parseColor("#E0913C"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
            typeface = Typeface.create(Typeface.DEFAULT_BOLD, Typeface.BOLD)
            letterSpacing = 0.08f
            setPadding(dp(11), dp(5), dp(11), dp(5))
            background = GradientDrawable().apply {
                cornerRadius = dp(999).toFloat()
                setColor(Color.parseColor("#24E0913C"))
            }
        }, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dp(14) })

        card.addView(TextView(this).apply {
            text = "That's your limit."
            setTextColor(Color.parseColor("#F2F1EC"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
            typeface = Typeface.create(Typeface.DEFAULT_BOLD, Typeface.BOLD)
        }, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        card.addView(TextView(this).apply {
            text = "You've spent ${fmtDurationLong(currentSeconds())} on reels today. Wilt's blocking them until midnight."
            setTextColor(Color.parseColor("#9A9A92"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14.5f)
            setLineSpacing(dp(3).toFloat(), 1f)
        }, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(9) })

        card.addView(TextView(this).apply {
            text = "Okay"
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#04140B"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14.5f)
            typeface = Typeface.create(Typeface.DEFAULT_BOLD, Typeface.BOLD)
            setPadding(0, dp(14), 0, dp(14))
            background = nudgeButtonBackground("#38C786")
            setOnClickListener { hideNudgeModal() }
        }, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(18) })

        val scrim = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#BF000000"))
            isClickable = true
            setOnClickListener { /* eat */ }
            addView(card, FrameLayout.LayoutParams(
                dp(320), FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER
            ).apply { leftMargin = dp(16); rightMargin = dp(16) })
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.TOP or Gravity.START }

        runCatching {
            windowManager?.addView(scrim, params)
            nudgeModal = scrim
            nudgeModalShown = true
        }
    }

    private fun nudgeCardBackground(): GradientDrawable =
        GradientDrawable().apply {
            setColor(Color.parseColor("#1A1A18"))
            cornerRadius = dp(26).toFloat()
            setStroke(dp(1), Color.parseColor("#1AF2F1EC"))
        }

    private fun nudgeButtonBackground(hex: String): GradientDrawable =
        GradientDrawable().apply {
            setColor(Color.parseColor(hex))
            cornerRadius = dp(15).toFloat()
        }

    // --- Stories-tray scroll guard --------------------------------------------

    /**
     * Show/move the transparent interceptor over the stories tray at [band]. It eats
     * drags (so the feed can't be scrolled from the tray) but forwards a genuine tap to
     * the story circle under it via an accessibility click — so stories stay watchable.
     */
    private fun showTrayCover(band: Rect) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (!Settings.canDrawOverlays(this)) return
        if (band.width() <= 0 || band.height() <= 0) { hideTrayCover(); return }
        if (trayCover == null) buildTrayCover()
        val view = trayCover ?: return
        val lp = view.layoutParams as WindowManager.LayoutParams
        // Eat touches (so a vertical drag can't scroll the blocked feed) — but never
        // re-arm mid-tap: while a forwarded tap is in flight the cover must stay
        // pass-through, and this runs every ~180ms from the cover ticker.
        lp.flags = if (trayForwarding) {
            lp.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        } else {
            lp.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
        }
        lp.x = band.left
        lp.y = band.top
        lp.width = band.width()
        lp.height = band.height()
        runCatching { windowManager?.updateViewLayout(view, lp) }
        trayCoverActive = true
    }

    /** Toggle whether the tray cover eats touches (true) or lets them pass through (false). */
    private fun setTrayTouchable(touchable: Boolean) {
        val view = trayCover ?: return
        val lp = view.layoutParams as WindowManager.LayoutParams
        lp.flags = if (touchable) {
            lp.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
        } else {
            lp.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        }
        runCatching { windowManager?.updateViewLayout(view, lp) }
    }

    private fun hideTrayCover() {
        if (!trayCoverActive) return
        trayCoverActive = false
        val view = trayCover ?: return
        val lp = view.layoutParams as WindowManager.LayoutParams
        lp.flags = lp.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE // pass through when idle
        runCatching { windowManager?.updateViewLayout(view, lp) }
    }

    private fun buildTrayCover() {
        val view = View(this).apply {
            setOnTouchListener { _, e ->
                when (e.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        trayDownX = e.rawX; trayDownY = e.rawY
                        trayDownAt = System.currentTimeMillis()
                        true
                    }
                    MotionEvent.ACTION_UP -> {
                        // Classify the gesture on release. The cover eats EVERY gesture
                        // (so a vertical drag can never scroll the blocked feed from up
                        // here), then replays only the story-tray-safe ones via
                        // accessibility actions — no synthetic touch, so the replay can't
                        // re-enter this same overlay:
                        //   - a near-stationary touch → tap → forward a click to the circle
                        //   - a mostly-horizontal drag → scroll the stories row itself
                        //   - anything else (a vertical drag) → swallow it
                        val dx = e.rawX - trayDownX
                        val dy = e.rawY - trayDownY
                        val dist = Math.hypot(dx.toDouble(), dy.toDouble())
                        val held = System.currentTimeMillis() - trayDownAt
                        // Looser than before (was 16dp/350ms): some users' taps drift a
                        // little or linger, and were being eaten as drags — so the story
                        // never opened.
                        if (dist < dp(24) && held < 600L) {
                            clickNodeAt(e.rawX.toInt(), e.rawY.toInt())
                        } else if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > dp(24)) {
                            // Swiping the finger LEFT (dx < 0) reveals later stories →
                            // scroll the row forward; RIGHT scrolls it back.
                            scrollTrayAt(trayDownX.toInt(), trayDownY.toInt(), forward = dx < 0)
                        }
                        true // always consume so a drag never scrolls the feed
                    }
                    else -> true
                }
            }
        }
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE, // built idle
            PixelFormat.TRANSPARENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
        }
        runCatching {
            windowManager?.addView(view, params)
            trayCover = view
        }
    }

    /**
     * Forward a tap to the story circle under (x, y). Prefer an accessibility click on
     * the clickable node when IG exposes one (cheap, no window churn). Many IG builds
     * DON'T mark the story ring clickable, though — there `deepestClickableAt` returns
     * null (or the click isn't accepted), and because the cover already ate the real
     * touch the story would never open. Fall back to a real synthetic tap through the
     * cover so it works regardless of IG's accessibility tree.
     */
    private fun clickNodeAt(x: Int, y: Int) {
        val node = rootInActiveWindow?.let { deepestClickableAt(it, x, y) }
        val clicked = node != null &&
            runCatching { node.performAction(AccessibilityNodeInfo.ACTION_CLICK) }.getOrDefault(false)
        if (!clicked) tapThrough(x, y)
    }

    /**
     * Land a REAL tap on Instagram at (x, y) by briefly making the tray cover
     * pass-through and dispatching a one-shot tap gesture, then re-arming the cover so
     * a later drag still can't scroll the blocked feed. Requires
     * `android:canPerformGestures="true"` on the accessibility service. The stroke
     * starts 50ms out so WindowManager has applied the pass-through flag before the tap
     * lands — otherwise it could re-hit this same overlay.
     */
    private fun tapThrough(x: Int, y: Int) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
        if (trayCover == null) return
        trayForwarding = true
        setTrayTouchable(false)
        val restore = Runnable {
            trayForwarding = false
            if (trayCoverActive) setTrayTouchable(true)
        }
        val path = Path().apply { moveTo(x.toFloat(), y.toFloat()) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 50L, 40L))
            .build()
        val dispatched = runCatching {
            dispatchGesture(
                gesture,
                object : GestureResultCallback() {
                    override fun onCompleted(d: GestureDescription?) = restore.run()
                    override fun onCancelled(d: GestureDescription?) = restore.run()
                },
                mainHandler,
            )
        }.getOrDefault(false)
        if (!dispatched) restore.run()
    }

    /** Deepest visible clickable node whose bounds contain (x, y), or null. */
    private fun deepestClickableAt(node: AccessibilityNodeInfo, x: Int, y: Int): AccessibilityNodeInfo? {
        if (!node.isVisibleToUser) return null
        val b = Rect().also { node.getBoundsInScreen(it) }
        if (!b.contains(x, y)) return null
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { deepestClickableAt(it, x, y)?.let { hit -> return hit } }
        }
        return if (node.isClickable) node else null
    }

    /**
     * Scroll the stories row under (x, y) by one step. Drives the tray's own
     * scrollable node through accessibility actions rather than synthesizing a swipe,
     * so it can't bounce off this overlay — the cover eats the real drag, this nudges
     * the underlying RecyclerView a page in the matching direction.
     */
    private fun scrollTrayAt(x: Int, y: Int, forward: Boolean) {
        val root = rootInActiveWindow ?: return
        val node = deepestScrollableAt(root, x, y) ?: return
        val action = if (forward) {
            AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
        } else {
            AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
        }
        runCatching { node.performAction(action) }
    }

    /** Deepest visible scrollable node whose bounds contain (x, y), or null. */
    private fun deepestScrollableAt(node: AccessibilityNodeInfo, x: Int, y: Int): AccessibilityNodeInfo? {
        if (!node.isVisibleToUser) return null
        val b = Rect().also { node.getBoundsInScreen(it) }
        if (!b.contains(x, y)) return null
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { deepestScrollableAt(it, x, y)?.let { hit -> return hit } }
        }
        return if (node.isScrollable) node else null
    }

    private val catCount = 13

    /** Resolve a bundled cat photo (`wilt_cat_1..N`) by index, 0 if missing. */
    private fun catDrawableRes(index: Int): Int =
        resources.getIdentifier("wilt_cat_$index", "drawable", packageName)

    /**
     * How many cats the user has actually earned. The gallery gates each cat behind
     * a lifetime-points threshold, so the block cover and the nudge must only draw
     * from that prefix: showing a locked cat gives away a reward not yet earned.
     * JS owns the number and mirrors it into prefs (see setUnlockedCats); 1 is the
     * floor because the first cat is free, so there is always something to show.
     */
    private fun unlockedCatCount(): Int =
        prefs.getInt("unlockedCats", 1).coerceIn(1, catCount)

    /** A random one of the unlocked cat photos, 0 if the drawable is missing. */
    private fun randomUnlockedCatRes(): Int =
        catDrawableRes(java.util.concurrent.ThreadLocalRandom.current().nextInt(unlockedCatCount()) + 1)

    private fun pillText(seconds: Int): String {
        val minutes = seconds / 60
        return when {
            minutes < 1 -> "under a min scrolling"
            minutes == 1 -> "1 min scrolling"
            else -> "$minutes min scrolling"
        }
    }

    // Rotating bodies for the 3-minute reel-time milestones (templated, not 33 lines).
    private val timeBodies = listOf(
        "Still scrolling. The cat's keeping count.",
        "That's time you won't get back.",
        "The cat napped. You scrolled.",
        "Deep in the feed. Worth it?",
    )

    /** (tag, headline, body) for a nudge trigger; tag is null when there's no // label. */
    private fun nudgeCopy(key: String): Triple<String?, String, String> {
        if (key.startsWith("time")) {
            val mins = key.removePrefix("time").toIntOrNull() ?: 0
            val body = timeBodies[(mins / 3) % timeBodies.size]
            return Triple("// $mins MIN TODAY", "$mins minutes today.", body)
        }
        return nudgeCopyFixed(key)
    }

    private fun nudgeCopyFixed(key: String): Triple<String?, String, String> = when (key) {
        "latenight" -> Triple(null, "It's late. Put it down.", "Nothing good happens in the reels at this hour. Go to sleep.")
        "morning" -> Triple(null, "Reels before 10am?", "You could be doing something better than ruining your morning with this.")
        "workhours" -> Triple(null, "Mid-workday scroll.", "The deadline didn't move. The cat's judging you.")
        "sitting" -> Triple("// 15 MIN STRAIGHT", "Come up for air.", "Fifteen minutes in the feed without stopping.")
        "count100" -> Triple("// 100 REELS TODAY", "A hundred reels.", "You've thumbed past 100 today. Triple digits.")
        "count50" -> Triple("// 50 REELS TODAY", "Fifty reels deep.", "Fifty swipes today. The cat lost count.")
        "count25" -> Triple("// 25 REELS TODAY", "Twenty-five reels.", "Twenty-five down. Notice you're doing it?")
        "vsyesterday" -> Triple(null, "Past yesterday already.", "You've out-scrolled your whole yesterday — and it's not over.")
        "cleanday" -> Triple(null, "Yesterday was clean.", "Barely scrolled. Keep it going today.")
        "weekly" -> Triple("// THIS WEEK", "This week so far", "${fmtDurationLong(weekSeconds())} in the feed this week.")
        else -> Triple(null, "Enough scrolling.", "The cat would rather you stopped.")
    }

    /** "1h 5m" / "45m" from seconds, for nudge copy. */
    private fun fmtDurationLong(seconds: Int): String {
        val m = seconds / 60
        return if (m < 60) "${m}m" else "${m / 60}h ${m % 60}m"
    }

    private fun pillBackground(): GradientDrawable =
        GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(Color.parseColor("#F21A1A18"), Color.parseColor("#F2141413"))
        ).apply {
            cornerRadius = dp(22).toFloat()
            setStroke(dp(1), Color.parseColor("#1AF2F1EC"))
        }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    // --- Node-tree traversal helpers ------------------------------------------

    private fun findByIdFragment(
        root: AccessibilityNodeInfo,
        fragment: String,
    ): AccessibilityNodeInfo? {
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        while (queue.isNotEmpty() && visited < 3000) {
            val node = queue.removeFirst()
            visited++
            node.viewIdResourceName?.let { if (it.contains(fragment, ignoreCase = true)) return node }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        return null
    }

    /** Debug aid: the trailing segment of the first few non-null view ids. */
    private fun collectViewIdFragments(
        root: AccessibilityNodeInfo,
        limit: Int,
    ): List<String> {
        val results = LinkedHashSet<String>()
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        while (queue.isNotEmpty() && visited < 3000 && results.size < limit) {
            val node = queue.removeFirst()
            visited++
            node.viewIdResourceName?.substringAfterLast('/')?.let {
                if (it.isNotBlank()) results.add(it)
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        return results.toList()
    }
}
