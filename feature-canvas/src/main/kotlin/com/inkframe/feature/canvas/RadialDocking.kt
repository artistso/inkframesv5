package com.inkframe.feature.canvas

import kotlin.math.max
import kotlin.math.min

internal enum class RadialDockRegion { LEFT, RIGHT, BOTTOM }

internal data class RadialDockRect(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
)

internal data class RadialDockOffset(val x: Float, val y: Float)

/**
 * Clamps a radial node to a screen-safe command zone while keeping its body out of the
 * drawing stage. Offsets are relative to the node's original Glass Horizon position.
 */
internal fun clampRadialDockOffset(
    originX: Float,
    originY: Float,
    requestedOffset: RadialDockOffset,
    nodeWidth: Float,
    nodeHeight: Float,
    workspaceWidth: Float,
    workspaceHeight: Float,
    canvas: RadialDockRect,
    region: RadialDockRegion,
    edgePadding: Float,
    canvasGap: Float,
): RadialDockOffset {
    require(nodeWidth > 0f && nodeHeight > 0f)
    require(workspaceWidth > 0f && workspaceHeight > 0f)

    val edge = edgePadding.coerceAtLeast(0f)
    val gap = canvasGap.coerceAtLeast(0f)
    val screenMinX = edge
    val screenMinY = edge
    val screenMaxX = max(screenMinX, workspaceWidth - nodeWidth - edge)
    val screenMaxY = max(screenMinY, workspaceHeight - nodeHeight - edge)
    val requestedX = originX + requestedOffset.x
    val requestedY = originY + requestedOffset.y

    fun clampOrFallback(value: Float, minValue: Float, maxValue: Float, fallback: Float): Float =
        if (minValue <= maxValue) value.coerceIn(minValue, maxValue)
        else fallback.coerceIn(screenMinX, screenMaxX)

    val absoluteX: Float
    val absoluteY: Float
    when (region) {
        RadialDockRegion.LEFT -> {
            val maxX = min(screenMaxX, canvas.left - nodeWidth - gap)
            absoluteX = clampOrFallback(requestedX, screenMinX, maxX, screenMinX)
            absoluteY = requestedY.coerceIn(screenMinY, screenMaxY)
        }
        RadialDockRegion.RIGHT -> {
            val minX = max(screenMinX, canvas.right + gap)
            absoluteX = if (minX <= screenMaxX) requestedX.coerceIn(minX, screenMaxX) else screenMaxX
            absoluteY = requestedY.coerceIn(screenMinY, screenMaxY)
        }
        RadialDockRegion.BOTTOM -> {
            absoluteX = requestedX.coerceIn(screenMinX, screenMaxX)
            val minY = max(screenMinY, canvas.bottom + gap)
            absoluteY = if (minY <= screenMaxY) requestedY.coerceIn(minY, screenMaxY) else screenMaxY
        }
    }

    return RadialDockOffset(absoluteX - originX, absoluteY - originY)
}
