package com.inkframe.feature.canvas

internal data class RadialFanOffset(
    val xDp: Float,
    val yDp: Float,
)

internal data class RadialFanBounds(
    val minXDp: Float,
    val minYDp: Float,
    val widthDp: Float,
    val heightDp: Float,
) {
    val nodeXDp: Float get() = -minXDp
    val nodeYDp: Float get() = -minYDp

    fun actionXDp(offset: RadialFanOffset): Float =
        nodeXDp + offset.xDp + RadialFanLayout.ACTION_POSITION_CORRECTION_DP

    fun actionYDp(offset: RadialFanOffset): Float =
        nodeYDp + offset.yDp + RadialFanLayout.ACTION_POSITION_CORRECTION_DP
}

/**
 * Bounds for an expanded radial menu rendered inside the normal Compose hierarchy.
 *
 * The parent is large enough to contain every clickable circle plus its visible shadow and label,
 * but the parent itself has no pointer modifier. Transparent gaps therefore remain non-interactive
 * and normal hit-testing can continue to the artwork beneath them.
 */
internal object RadialFanLayout {
    const val NODE_EXTENT_DP: Float = 58f
    const val NODE_SHADOW_DP: Float = 24f
    const val NODE_LABEL_BOTTOM_OVERFLOW_DP: Float = 32f

    const val ACTION_EXTENT_DP: Float = 48f
    const val ACTION_POSITION_CORRECTION_DP: Float = 5f
    const val ACTION_SHADOW_DP: Float = 16f
    const val ACTION_LABEL_BOTTOM_OVERFLOW_DP: Float = 36f

    fun bounds(offsets: List<RadialFanOffset>): RadialFanBounds {
        var minX = -NODE_SHADOW_DP
        var minY = -NODE_SHADOW_DP
        var maxX = NODE_EXTENT_DP + NODE_SHADOW_DP
        var maxY = NODE_EXTENT_DP + NODE_LABEL_BOTTOM_OVERFLOW_DP

        offsets.forEach { offset ->
            val circleX = offset.xDp + ACTION_POSITION_CORRECTION_DP
            val circleY = offset.yDp + ACTION_POSITION_CORRECTION_DP
            minX = minOf(minX, circleX - ACTION_SHADOW_DP)
            minY = minOf(minY, circleY - ACTION_SHADOW_DP)
            maxX = maxOf(maxX, circleX + ACTION_EXTENT_DP + ACTION_SHADOW_DP)
            maxY = maxOf(maxY, circleY + ACTION_EXTENT_DP + ACTION_LABEL_BOTTOM_OVERFLOW_DP)
        }

        return RadialFanBounds(
            minXDp = minX,
            minYDp = minY,
            widthDp = maxX - minX,
            heightDp = maxY - minY,
        )
    }
}
