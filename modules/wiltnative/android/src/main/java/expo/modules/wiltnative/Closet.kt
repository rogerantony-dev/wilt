package expo.modules.wiltnative

import android.content.SharedPreferences

/**
 * What the cat wears, what the user owns, and what they have spent. Shared by
 * the JS bridge and the accessibility service, which both read the same prefs,
 * so the pill and the block cover dress the cat the way the app does.
 *
 * JS owns the coin maths (banked days minus spent); it passes the balance to
 * [buy], and native re-checks it. Unknown or unowned ids read as "none", so a
 * renamed item or hand-edited prefs can never draw a blank or broken layer.
 * Mirrors components/closet.ts by value.
 */
object Closet {
  val SLOTS = listOf("top", "body", "bottom")

  /** slot -> id -> price in coins. Price 0 items belong to everyone. */
  val PRICES: Map<String, Map<String, Int>> = mapOf(
    "top" to mapOf(
      "none" to 0, "beanie" to 0, "cap" to 100, "flower" to 150, "bow" to 150,
      "phones" to 250, "party" to 300, "crown" to 600, "halo" to 900,
    ),
    "body" to mapOf(
      "none" to 0, "tee" to 0, "hoodie" to 150, "stripes" to 200,
      "scarf" to 250, "raincoat" to 350, "suit" to 600,
    ),
    "bottom" to mapOf(
      "none" to 0, "shorts" to 0, "jeans" to 150, "joggers" to 200,
      "sneakers" to 300, "tutu" to 400,
    ),
  )

  private const val OWNED = "ownedItems"
  private const val SPENT = "coinsSpent"

  private fun key(slot: String) = "outfit" + slot.replaceFirstChar { it.uppercase() }

  /** Paid ids the user bought, from the comma-separated pref. */
  fun owned(prefs: SharedPreferences): Set<String> =
    (prefs.getString(OWNED, "") ?: "").split(",").filter { it.isNotEmpty() }.toSet()

  fun coinsSpent(prefs: SharedPreferences): Int = prefs.getInt(SPENT, 0).coerceAtLeast(0)

  private fun isOwned(prefs: SharedPreferences, slot: String, id: String): Boolean {
    val price = PRICES[slot]?.get(id) ?: return false
    return price == 0 || id in owned(prefs)
  }

  /** The worn id per slot; anything unknown or not owned reads as "none". */
  fun outfit(prefs: SharedPreferences): Map<String, String> =
    SLOTS.associateWith { slot ->
      val id = prefs.getString(key(slot), "none") ?: "none"
      if (isOwned(prefs, slot, id)) id else "none"
    }

  /** Put [id] on. False when it is unknown or not owned. */
  fun wear(prefs: SharedPreferences, slot: String, id: String): Boolean {
    if (!isOwned(prefs, slot, id)) return false
    return prefs.edit().putString(key(slot), id).commit()
  }

  /**
   * Buy [id] and wear it, in one write. False when it is unknown, already owned
   * (a double tap charges once), or costs more than [balance].
   */
  fun buy(prefs: SharedPreferences, slot: String, id: String, balance: Int): Boolean {
    val price = PRICES[slot]?.get(id) ?: return false
    if (isOwned(prefs, slot, id) || price > balance) return false
    return prefs.edit()
      .putString(OWNED, (owned(prefs) + id).joinToString(","))
      .putInt(SPENT, coinsSpent(prefs) + price)
      .putString(key(slot), id)
      .commit()
  }
}
