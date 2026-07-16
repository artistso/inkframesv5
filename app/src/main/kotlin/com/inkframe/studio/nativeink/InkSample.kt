package com.inkframe.studio.nativeink

/**
 * Platform-neutral representation of one Android ink sample.
 *
 * The native drawing surface records MotionEvent data into this model so the
 * same samples can later feed deterministic brush replay, parity tests, and
 * project serialization without retaining Android framework objects.
 */
data class InkSample(
    val x: Float,
    val y: Float,
    val pressure: Float,
    val tiltRadians: Float,
    val orientationRadians: Float,
    val distance: Float,
    val eventTimeMillis: Long,
    val receivedUptimeMillis: Long,
    val tool: InkTool,
    val phase: InkPhase,
    val historical: Boolean,
    val buttonState: Int,
) {
    val deliveryLatencyMillis: Long
        get() = (receivedUptimeMillis - eventTimeMillis).coerceAtLeast(0L)
}

enum class InkTool {
    STYLUS,
    ERASER,
    TOUCH,
    MOUSE,
    UNKNOWN,
}

enum class InkPhase {
    CONTACT,
    HOVER,
}
