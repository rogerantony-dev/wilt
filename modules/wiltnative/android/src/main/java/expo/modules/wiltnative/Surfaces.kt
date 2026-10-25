package expo.modules.wiltnative

import android.content.SharedPreferences
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Which parts of Instagram and YouTube Wilt guards. A guarded surface counts
 * toward the daily limit in Guilt and is blocked in Block (and past the limit);
 * an unguarded one is ignored. Shared by the JS bridge and the accessibility
 * service, which both read the same prefs.
 *
 * Guarding applies at once. Unguarding waits for the next daily reset, the same
 * rule as a limit raise, so a toggle can't be used to slip out of a block.
 */
object Surfaces {
  const val IG_REELS = "igReels"
  const val IG_FEED = "igFeed"
  const val IG_STORIES = "igStories"
  const val IG_DMS = "igDms"
  const val YT_SHORTS = "ytShorts"
  const val YT_VIDEO = "ytVideo"

  val ALL = listOf(IG_REELS, IG_FEED, IG_STORIES, IG_DMS, YT_SHORTS, YT_VIDEO)

  /** Each app's parts. All of them guarded means the whole app is. */
  val INSTAGRAM = listOf(IG_REELS, IG_FEED, IG_STORIES, IG_DMS)
  val YOUTUBE = listOf(YT_SHORTS, YT_VIDEO)

  /**
   * The whole app is guarded when every one of its parts is: then all of it
   * counts in Guilt, and Block keeps you out of it entirely, not just the
   * parts. There is no separate switch to fall out of step with the parts.
   */
  fun isAppGuarded(prefs: SharedPreferences, parts: List<String>): Boolean =
    parts.all { isGuarded(prefs, it) }

  // --- Apps the user added -----------------------------------------------------
  //
  // Any other app can be added to the Apps sheet and is guarded as a whole. Its
  // guard is an ordinary key, "app:<package>", so it follows the same rules:
  // on at once, off only at the next reset. The added list itself is separate,
  // so an app switched off stays in the sheet until it is removed.

  private const val APP_PREFIX = "app:"
  private const val CUSTOM_APPS = "customApps"

  fun appKey(pkg: String) = APP_PREFIX + pkg

  /** Packages the user added, guarded or not. */
  fun customApps(prefs: SharedPreferences): Set<String> =
    prefs.getStringSet(CUSTOM_APPS, emptySet()) ?: emptySet()

  /** An added app that is guarded right now. */
  fun isCustomGuarded(prefs: SharedPreferences, pkg: String?): Boolean =
    pkg != null && pkg in customApps(prefs) && isGuarded(prefs, appKey(pkg))

  /** Add [pkg] to the sheet, guarded from now. */
  fun addCustomApp(prefs: SharedPreferences, pkg: String) {
    prefs.edit().putStringSet(CUSTOM_APPS, customApps(prefs) + pkg).apply()
    set(prefs, appKey(pkg), true)
  }

  /**
   * Take [pkg] off the sheet. Refused (false) while it is still guarded, so
   * removing an app can't skip the wait that switching it off has.
   */
  fun removeCustomApp(prefs: SharedPreferences, pkg: String): Boolean {
    if (isGuarded(prefs, appKey(pkg))) return false
    promote(prefs)
    prefs.edit()
      .putStringSet(CUSTOM_APPS, customApps(prefs) - pkg)
      .remove(pref(appKey(pkg)))
      .apply()
    return true
  }

  // What Wilt guarded before the toggles existed, so an update changes nothing.
  private val DEFAULT_ON = setOf(IG_REELS, IG_FEED, YT_SHORTS)

  private const val PENDING_OFF = "guardOffPending"
  private const val PENDING_OFF_DATE = "guardOffDate"

  private fun pref(key: String) = "guard_$key"

  private fun today(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

  private fun tomorrow(): String {
    val cal = Calendar.getInstance()
    cal.add(Calendar.DAY_OF_YEAR, 1)
    return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.time)
  }

  /** Keys still waiting to turn off at a reset that hasn't come yet. */
  fun pendingOff(prefs: SharedPreferences): Set<String> {
    val date = prefs.getString(PENDING_OFF_DATE, null) ?: return emptySet()
    if (today() >= date) return emptySet()
    return prefs.getStringSet(PENDING_OFF, emptySet()) ?: emptySet()
  }

  /** Guarded right now. A turn-off whose reset has arrived counts as off even before it's written back. */
  fun isGuarded(prefs: SharedPreferences, key: String): Boolean {
    val stored = prefs.getBoolean(pref(key), key in DEFAULT_ON)
    if (!stored) return false
    val date = prefs.getString(PENDING_OFF_DATE, null) ?: return true
    val pending = prefs.getStringSet(PENDING_OFF, emptySet()) ?: emptySet()
    return !(key in pending && today() >= date)
  }

  /** Guard [key] now, or queue it to stop being guarded at the next reset. */
  fun set(prefs: SharedPreferences, key: String, on: Boolean) {
    if (key !in ALL && !key.startsWith(APP_PREFIX)) return
    promote(prefs)
    val pending = pendingOff(prefs).toMutableSet()
    val editor = prefs.edit()
    if (on) {
      editor.putBoolean(pref(key), true)
      pending.remove(key)
    } else if (isGuarded(prefs, key)) {
      pending.add(key)
    }
    if (pending.isEmpty()) {
      editor.remove(PENDING_OFF).remove(PENDING_OFF_DATE)
    } else {
      editor.putStringSet(PENDING_OFF, pending).putString(PENDING_OFF_DATE, tomorrow())
    }
    editor.apply()
  }

  /** Write back any turn-offs whose reset has arrived, so a new queue doesn't swallow them. */
  fun promote(prefs: SharedPreferences) {
    val date = prefs.getString(PENDING_OFF_DATE, null) ?: return
    if (today() < date) return
    val editor = prefs.edit()
    for (key in prefs.getStringSet(PENDING_OFF, emptySet()) ?: emptySet()) {
      editor.putBoolean(pref(key), false)
    }
    editor.remove(PENDING_OFF).remove(PENDING_OFF_DATE).apply()
  }
}
