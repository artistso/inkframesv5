package com.inkframe.feature.canvas

import android.view.MotionEvent
import com.inkframe.core.model.Brush
import com.inkframe.core.model.DefaultBrushes

/** Returns true when Android identifies the contact as an eraser or inverted stylus. */
internal fun isPhysicalEraserTool(toolType: Int): Boolean =
    toolType == MotionEvent.TOOL_TYPE_ERASER

/**
 * Resolves the temporary contact brush without mutating the artist's selected brush.
 * Android reports an eraser-button/inverted contact as TOOL_TYPE_ERASER.
 */
internal fun brushForStylusTool(selectedBrush: Brush, toolType: Int): Brush =
    if (isPhysicalEraserTool(toolType)) DefaultBrushes.eraser else selectedBrush
