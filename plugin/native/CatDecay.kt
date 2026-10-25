package com.rogerantony.wilt

import android.graphics.Color

/**
 * The cat that rots. One drawing of the mascot, decaying with the minutes
 * spent against the daily limit: fresh, wilting, mouldy, rotting, nearly gone,
 * and a skull once the limit is blown. Six stages; CatFigureLayers draws each
 * one from the stage-numbered layers in res/drawable-nodpi.
 *
 * The pill, the block cover, the nudge and the home-screen widget all read the
 * stage from here so they can never disagree about how far the cat has gone.
 * Bands are fractions of the limit; the last one is reached at the limit
 * itself, not a minute over, because the moment you hit it is the moment the
 * cat is gone.
 */
object CatDecay {

    /** Six stages, 1 = fresh .. 6 = gone. */
    fun stage(usedMinutes: Int, limitMinutes: Int): Int {
        if (limitMinutes <= 0) return 1
        if (usedMinutes >= limitMinutes) return 6
        val frac = usedMinutes.toDouble() / limitMinutes
        return when {
            frac >= 0.92 -> 5
            frac >= 0.82 -> 4
            frac >= 0.65 -> 3
            frac >= 0.35 -> 2
            else -> 1
        }
    }

    /**
     * Text colour that follows the cat: bone while it is merely wilting, amber
     * once the mould shows, red once it is gone.
     */
    fun textColor(usedMinutes: Int, limitMinutes: Int): Int = when (stage(usedMinutes, limitMinutes)) {
        6 -> Color.parseColor("#D2542F")
        3, 4, 5 -> Color.parseColor("#E0913C")
        else -> Color.parseColor("#F2F1EC")
    }
}
