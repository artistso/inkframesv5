package com.inkframe.feature.canvas

import android.view.MotionEvent
import com.inkframe.core.model.Brush
import com.inkframe.core.model.DefaultBrushes

/** Returns true when Android identifies the contact as an eraser or inverted stylus. */
internal fun isPhysicalEraserTool(toolType: Int): Boolean =
    toolType == MotionEvent.TOOL_TYPE_ERASER

/** True when the active drawing contact is owned by an S Pen tip or its eraser. */
internal fun isStylusTool(toolType: Int): Boolean =
    toolType == MotionEvent.TOOL_TYPE_STYLUS || isPhysicalEraserTool(toolType)

/**
 * Decides what a second pointer means while a stroke is active.
 *
 * A touch stroke yields to a two-finger viewport gesture and must be rolled back. An S Pen
 * stroke keeps ownership so a resting palm cannot cancel the artist's line or move the canvas.
 */
internal enum class AdditionalPointerAction {
    KEEP_STYLUS_STROKE,
    CANCEL_TOUCH_STROKE_AND_NAVIGATE,
}

internal fun additionalPointerAction(activeToolType: Int): AdditionalPointerAction =
    if (isStylusTool(activeToolType)) {
        AdditionalPointerAction.KEEP_STYLUS_STROKE
    } else {
        AdditionalPointerAction.CANCEL_TOUCH_STROKE_AND_NAVIGATE
    }

/**
 * Resolves the temporary contact brush without mutating the artist's selected brush.
 * Android reports an eraser-button/inverted contact as TOOL_TYPE_ERASER.
 */
internal fun brushForStylusTool(selectedBrush: Brush, toolType: Int): Brush =
    if (isPhysicalEraserTool(toolType)) DefaultBrushes.eraser else selectedBrush
