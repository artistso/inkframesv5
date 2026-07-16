package com.inkframe.studio.nativeink

/** Fractional density conversion used by the artist brush-size slider. */
internal fun NativeArtistActivity.dp(value: Float): Int =
    (value * resources.displayMetrics.density).toInt()
