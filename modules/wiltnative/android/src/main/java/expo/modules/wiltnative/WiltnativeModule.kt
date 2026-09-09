package expo.modules.wiltnative

import android.content.Context
import android.provider.Settings
import android.text.TextUtils
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Reports the live state of the two permissions the Reel counter needs, plus
 * today's count, so the JS onboarding UI can show a tick once each is on and
 * actually working. Reads the same SharedPreferences the accessibility service
 * writes (same app process), and Android's settings for permission state.
 */
class WiltnativeModule : Module() {
  private val MAX_EXTRA_MINUTES = 3

  override fun definition() = ModuleDefinition {
    Name("Wilt")

    Function("getStatus") {
      val context = appContext.reactContext?.applicationContext
        ?: return@Function defaultStatus()

      mapOf(
        "overlay" to Settings.canDrawOverlays(context),
        "accessibilityEnabled" to isAccessibilityEnabled(context),
        "accessibilityRunning" to isAccessibilityRunning(context),
        "todayCount" to todayCount(context),
        "todayShorts" to todayShorts(context),
        "todaySeconds" to todaySeconds(context),
        "mode" to currentMode(context),
        "limitMinutes" to limitMinutes(context),
        "pendingLimit" to pendingRaise(context),
        "autoBlocked" to autoBlocked(context),
        "graceLeft" to (MAX_EXTRA_MINUTES - extraMinutes(context)).coerceAtLeast(0),
        "lastCelebratedStreakMilestone" to prefs(context).getInt("lastCelebratedStreakMilestone", 0),
        "lastPointsCelebrated" to prefs(context).getInt("lastPointsCelebrated", 0),
        "paymentPauseApp" to paymentPauseApp(context),
        "canAutoResume" to canWriteSecureSettings(context),
      )
    }

    // After a payment pause: turn the service back on directly when the phone
    // has granted WRITE_SECURE_SETTINGS over adb (returns true), otherwise open
    // Settings > Accessibility on Wilt's entry and return false.
    Function("resumeAfterPayment") {
      val context = appContext.reactContext?.applicationContext ?: return@Function false
      if (enableService(context)) return@Function true
      openServiceSettings(context)
      false
    }

    // Drop the "paused for payments" record without turning the service on, so
    // the app falls back to plain setup instead of nagging about the pause.
    Function("dismissPaymentPause") {
      val context = appContext.reactContext?.applicationContext
      if (context != null) {
        prefs(context).edit()
          .remove("paymentPausePackage")
          .remove("paymentPauseLabel")
          .remove("paymentPausedAt")
          .apply()
      }
    }

    Function("setMode") { mode: String ->
      val context = appContext.reactContext?.applicationContext ?: return@Function
      val normalized = if (mode == "block") "block" else "guilt"
      prefs(context).edit().putString("mode", normalized).apply()
    }

    // Lowering the limit is instant; raising it is deferred to the next daily
    // reset, so you can't escape a block by bumping the limit mid-scroll.
    Function("setLimit") { minutes: Int ->
      val context = appContext.reactContext?.applicationContext ?: return@Function
      val v = minutes.coerceIn(5, 240)
      val p = prefs(context)
      if (v <= limitMinutes(context)) {
        p.edit().putInt("limitMinutes", v).remove("pendingLimit").remove("pendingLimitDate").apply()
      } else {
        p.edit().putInt("pendingLimit", v).putString("pendingLimitDate", tomorrow()).apply()
      }
    }

    // Set the limit immediately, no deferral — used only for the first-run pick
    // in onboarding, before any commitment exists to protect.
    Function("setLimitNow") { minutes: Int ->
      val context = appContext.reactContext?.applicationContext ?: return@Function
      prefs(context).edit()
        .putInt("limitMinutes", minutes.coerceIn(5, 240))
        .remove("pendingLimit")
        .remove("pendingLimitDate")
        .apply()
    }

    // Grant one more minute of budget today (max 3), from the dashboard's blocked
    // screen. Clears the once-a-day limit-card flag so it can re-announce.
    Function("grantExtraMinute") {
      val context = appContext.reactContext?.applicationContext
      if (context != null) {
        val p = prefs(context)
        val used = p.getInt("extraMinutes", 0)
        if (used < MAX_EXTRA_MINUTES) {
          p.edit().putInt("extraMinutes", used + 1).remove("limitAlertDate").apply()
        }
      }
    }

    Function("getHistory") {
      val context = appContext.reactContext?.applicationContext
        ?: return@Function emptyList<Map<String, Any>>()
      history(context)
    }

    Function("consumeOpenCats") {
      val context = appContext.reactContext?.applicationContext ?: return@Function false
      val p = prefs(context)
      val v = p.getBoolean("openCats", false)
      if (v) p.edit().putBoolean("openCats", false).apply()
      v
    }

    Function("markStreakCelebrated") { milestone: Int ->
      val context = appContext.reactContext?.applicationContext ?: return@Function
      val p = prefs(context)
      val cur = p.getInt("lastCelebratedStreakMilestone", 0)
      if (milestone > cur) p.edit().putInt("lastCelebratedStreakMilestone", milestone).apply()
    }

    Function("markPointsCelebrated") { points: Int ->
      val context = appContext.reactContext?.applicationContext ?: return@Function
      val p = prefs(context)
      val cur = p.getInt("lastPointsCelebrated", 0)
      if (points > cur) p.edit().putInt("lastPointsCelebrated", points).apply()
    }

    // How many gallery cats are unlocked. The thresholds and the points maths
    // live in JS, so JS owns this number and mirrors it here for the
    // accessibility service, which shows cats on the nudge and the block cover
    // and must never spoil a locked one. Never below 1: the first cat is free.
    Function("setUnlockedCats") { count: Int ->
      val context = appContext.reactContext?.applicationContext ?: return@Function
      prefs(context).edit().putInt("unlockedCats", count.coerceAtLeast(1)).apply()
    }
  }

  private fun defaultStatus(): Map<String, Any?> = mapOf(
    "overlay" to false,
    "accessibilityEnabled" to false,
    "accessibilityRunning" to false,
    "todayCount" to 0,
    "todayShorts" to 0,
    "todaySeconds" to 0,
    "mode" to "guilt",
    "limitMinutes" to 30,
    "pendingLimit" to 0,
    "autoBlocked" to false,
    "graceLeft" to 3,
    "lastCelebratedStreakMilestone" to 0,
    "lastPointsCelebrated" to 0,
    "paymentPauseApp" to null,
    "canAutoResume" to false,
  )

  private fun prefs(context: Context) =
    context.getSharedPreferences("wilt_reels", Context.MODE_PRIVATE)

  private fun currentMode(context: Context): String =
    prefs(context).getString("mode", "guilt") ?: "guilt"

  /**
   * The daily limit in effect today (minutes, default 30). A raise queued for a
   * day that has now arrived counts as effective, even before the service's
   * midnight rollover has promoted it into the base pref. Read-only.
   */
  private fun limitMinutes(context: Context): Int {
    val p = prefs(context)
    val pending = p.getInt("pendingLimit", 0)
    val pendingDate = p.getString("pendingLimitDate", null)
    if (pending in 5..240 && pendingDate != null && today() >= pendingDate) {
      return pending
    }
    return p.getInt("limitMinutes", 30).coerceIn(5, 240)
  }

  /** A limit raise still waiting for the next reset (0 if none pending). */
  private fun pendingRaise(context: Context): Int {
    val p = prefs(context)
    val pending = p.getInt("pendingLimit", 0)
    val pendingDate = p.getString("pendingLimitDate", null)
    return if (pending in 5..240 && pendingDate != null && today() < pendingDate) pending else 0
  }

  private fun today(): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

  private fun tomorrow(): String {
    val cal = Calendar.getInstance()
    cal.add(Calendar.DAY_OF_YEAR, 1)
    return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.time)
  }

  /** Extra minutes granted today via the "1 more minute" grace on the limit card. */
  private fun extraMinutes(context: Context): Int =
    prefs(context).getInt("extraMinutes", 0)

  /**
   * True when a guilt-mode user has crossed their daily limit (plus any granted
   * grace) — i.e. reels are being bounced right now. Guilt always blocks at the
   * limit, locked until the next daily reset (aside from up to 3 grace minutes).
   */
  private fun autoBlocked(context: Context): Boolean {
    if (currentMode(context) != "guilt") return false
    return todaySeconds(context) >= (limitMinutes(context) + extraMinutes(context)) * 60
  }

  private fun serviceId(context: Context): String {
    val pkg = context.packageName
    return "$pkg/$pkg.ReelAccessibilityService"
  }

  /**
   * The payment app the service switched itself off for, or null. Set by the
   * service right before disableSelf(); cleared when it reconnects. Only
   * meaningful while the service is off, so a stale record from a pause the
   * user resolved by hand is ignored.
   */
  private fun paymentPauseApp(context: Context): String? {
    if (isAccessibilityEnabled(context)) return null
    return prefs(context).getString("paymentPauseLabel", null)
  }

  private fun canWriteSecureSettings(context: Context): Boolean =
    context.checkSelfPermission(android.Manifest.permission.WRITE_SECURE_SETTINGS) ==
      android.content.pm.PackageManager.PERMISSION_GRANTED

  /** Append the service to the enabled list. Needs WRITE_SECURE_SETTINGS (adb only). */
  private fun enableService(context: Context): Boolean {
    if (!canWriteSecureSettings(context)) return false
    val id = serviceId(context)
    val resolver = context.contentResolver
    return runCatching {
      val current = Settings.Secure.getString(
        resolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
      ).orEmpty()
      // Off, then on, so the system really rebinds the service (a write with
      // the service already listed can leave it "bound" but never connected).
      val others = current.split(':').filter { it.isNotBlank() && !it.equals(id, ignoreCase = true) }
      Settings.Secure.putString(resolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, others.joinToString(":"))
      android.os.SystemClock.sleep(500)
      Settings.Secure.putString(resolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, (others + id).joinToString(":"))
      Settings.Secure.putInt(resolver, Settings.Secure.ACCESSIBILITY_ENABLED, 1)
      true
    }.getOrDefault(false)
  }

  /** Settings > Accessibility, scrolled to Wilt where the skin supports it. */
  private fun openServiceSettings(context: Context) {
    val id = serviceId(context)
    val args = android.os.Bundle().apply { putString(":settings:fragment_args_key", id) }
    val intent = android.content.Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
      addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
      putExtra(":settings:fragment_args_key", id)
      putExtra(":settings:show_fragment_args", args)
    }
    runCatching { context.startActivity(intent) }
  }

  private fun isAccessibilityEnabled(context: Context): Boolean {
    val enabled = Settings.Secure.getString(
      context.contentResolver,
      Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
    ) ?: return false
    val target = serviceId(context)
    val splitter = TextUtils.SimpleStringSplitter(':')
    splitter.setString(enabled)
    while (splitter.hasNext()) {
      if (splitter.next().equals(target, ignoreCase = true)) return true
    }
    return false
  }

  /** Enabled AND the service has actually connected at least once. */
  private fun isAccessibilityRunning(context: Context): Boolean {
    if (!isAccessibilityEnabled(context)) return false
    val prefs = context.getSharedPreferences("wilt_reels", Context.MODE_PRIVATE)
    return prefs.getLong("lastConnectedAt", 0L) > 0L
  }

  private fun todayCount(context: Context): Int {
    val prefs = context.getSharedPreferences("wilt_reels", Context.MODE_PRIVATE)
    return prefs.getInt("count", 0)
  }

  private fun todayShorts(context: Context): Int {
    val prefs = context.getSharedPreferences("wilt_reels", Context.MODE_PRIVATE)
    return prefs.getInt("shortsCount", 0)
  }

  /** Seconds spent on short-form players (reels + shorts) today; drives the timer. */
  private fun todaySeconds(context: Context): Int {
    val prefs = context.getSharedPreferences("wilt_reels", Context.MODE_PRIVATE)
    return prefs.getInt("seconds", 0)
  }

  /**
   * Archived days merged with the in-progress (or stale, not-yet-rolled) live
   * day. The live counters are filed under their own stored date, so a
   * yesterday-counter read on a new day is attributed to yesterday, never
   * mislabeled "today".
   */
  private fun history(context: Context): List<Map<String, Any>> {
    val prefs = prefs(context)
    val byDate = linkedMapOf<String, IntArray>() // date -> [seconds, count, shorts, limitMinutes]

    runCatching {
      val json = JSONObject(prefs.getString("history", "{}") ?: "{}")
      val keys = json.keys()
      while (keys.hasNext()) {
        val date = keys.next()
        val day = json.getJSONObject(date)
        byDate[date] = intArrayOf(
          day.optInt("seconds"),
          day.optInt("count"),
          day.optInt("shorts"),
          day.optInt("limitMinutes"), // 0 when archived before this shipped; JS falls back
        )
      }
    }

    val liveDate = prefs.getString("date", null)
    if (liveDate != null) {
      val cur = byDate[liveDate] ?: intArrayOf(0, 0, 0, 0)
      cur[0] += prefs.getInt("seconds", 0)
      cur[1] += prefs.getInt("count", 0)
      cur[2] += prefs.getInt("shortsCount", 0)
      cur[3] = limitMinutes(context) // live day is always judged against the current limit
      byDate[liveDate] = cur
    }

    return byDate.entries
      .sortedBy { it.key }
      .map { (date, v) ->
        val m = mutableMapOf<String, Any>(
          "date" to date,
          "seconds" to v[0],
          "count" to v[1],
          "shorts" to v[2],
        )
        if (v[3] > 0) m["limitMinutes"] = v[3]
        m
      }
  }
}
