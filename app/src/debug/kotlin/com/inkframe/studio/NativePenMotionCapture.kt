package com.inkframe.studio

import android.view.MotionEvent
import android.webkit.WebView

/** Captures raw stylus MotionEvents before Chromium converts them to PointerEvents. */
internal class NativePenMotionCapture(
    private val recorder: NativePenTraceRecorder,
) {
    private var dispatchSequence = 0L

    fun observe(webView: WebView, event: MotionEvent) {
        if (!isContactAction(event.actionMasked)) return

        val penPointers = buildList {
            for (pointerIndex in 0 until event.pointerCount) {
                val toolType = event.getToolType(pointerIndex)
                if (toolType == MotionEvent.TOOL_TYPE_STYLUS || toolType == MotionEvent.TOOL_TYPE_ERASER) {
                    add(pointerIndex)
                }
            }
        }
        if (penPointers.isEmpty()) return

        val samples = ArrayList<NativePenSample>(
            penPointers.size * (event.historySize + 1)
        )

        for (historyIndex in 0 until event.historySize) {
            val historicalTime = event.getHistoricalEventTime(historyIndex)
            for (pointerIndex in penPointers) {
                samples += NativePenSample(
                    pointerId = event.getPointerId(pointerIndex),
                    toolType = event.getToolType(pointerIndex),
                    historical = true,
                    historyIndex = historyIndex,
                    eventTimeMs = historicalTime,
                    x = event.getHistoricalX(pointerIndex, historyIndex),
                    y = event.getHistoricalY(pointerIndex, historyIndex),
                    pressure = event.getHistoricalPressure(pointerIndex, historyIndex),
                    tilt = event.getHistoricalAxisValue(MotionEvent.AXIS_TILT, pointerIndex, historyIndex),
                    orientation = event.getHistoricalOrientation(pointerIndex, historyIndex),
                    size = event.getHistoricalSize(pointerIndex, historyIndex),
                    touchMajor = event.getHistoricalTouchMajor(pointerIndex, historyIndex),
                    touchMinor = event.getHistoricalTouchMinor(pointerIndex, historyIndex),
                    toolMajor = event.getHistoricalToolMajor(pointerIndex, historyIndex),
                    toolMinor = event.getHistoricalToolMinor(pointerIndex, historyIndex),
                )
            }
        }

        for (pointerIndex in penPointers) {
            samples += NativePenSample(
                pointerId = event.getPointerId(pointerIndex),
                toolType = event.getToolType(pointerIndex),
                historical = false,
                historyIndex = -1,
                eventTimeMs = event.eventTime,
                x = event.getX(pointerIndex),
                y = event.getY(pointerIndex),
                pressure = event.getPressure(pointerIndex),
                tilt = event.getAxisValue(MotionEvent.AXIS_TILT, pointerIndex),
                orientation = event.getOrientation(pointerIndex),
                size = event.getSize(pointerIndex),
                touchMajor = event.getTouchMajor(pointerIndex),
                touchMinor = event.getTouchMinor(pointerIndex),
                toolMajor = event.getToolMajor(pointerIndex),
                toolMinor = event.getToolMinor(pointerIndex),
            )
        }

        recorder.record(
            NativePenDispatch(
                dispatchSequence = ++dispatchSequence,
                actionMasked = event.actionMasked,
                actionIndex = event.actionIndex,
                downTimeMs = event.downTime,
                eventTimeMs = event.eventTime,
                buttonState = event.buttonState,
                source = event.source,
                deviceId = event.deviceId,
                viewWidth = webView.width,
                viewHeight = webView.height,
                density = webView.resources.displayMetrics.density,
                historySize = event.historySize,
                samples = samples,
            )
        )
    }

    private fun isContactAction(action: Int): Boolean = when (action) {
        MotionEvent.ACTION_DOWN,
        MotionEvent.ACTION_MOVE,
        MotionEvent.ACTION_UP,
        MotionEvent.ACTION_CANCEL,
        MotionEvent.ACTION_POINTER_DOWN,
        MotionEvent.ACTION_POINTER_UP,
        -> true
        else -> false
    }
}
