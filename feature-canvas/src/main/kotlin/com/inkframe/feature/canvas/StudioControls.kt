package com.inkframe.feature.canvas

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

/**
 * Shared visual language for the InkFrame studio controls.
 *
 * Controls are deliberately larger than phone defaults because the primary target is a
 * landscape Galaxy Tab operated by touch and S Pen. Selected tools retain a filled surface
 * instead of relying on icon tint alone, making state legible in peripheral vision.
 */
internal object StudioControlTokens {
    val TouchTarget = 52.dp
    val IconSize = 24.dp
    val GroupRadius = 14.dp
    val ControlRadius = 12.dp
    val GroupGap = 6.dp

    val ToolbarBackground = Color(0xFF202126)
    val GroupBackground = Color(0xFF2A2C32)
    val IdleBackground = Color.Transparent
    val HoverBackground = Color(0xFF363941)
    val DisabledContent = Color(0xFF6D7079)
}

/** A compact visual grouping for related toolbar actions. */
@Composable
internal fun StudioControlGroup(
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    Surface(
        modifier = modifier,
        color = StudioControlTokens.GroupBackground,
        shape = RoundedCornerShape(StudioControlTokens.GroupRadius),
        tonalElevation = 1.dp,
    ) {
        Row(
            modifier = Modifier.padding(StudioControlTokens.GroupGap),
            horizontalArrangement = Arrangement.spacedBy(StudioControlTokens.GroupGap),
            verticalAlignment = Alignment.CenterVertically,
            content = content,
        )
    }
}

/**
 * Tablet-sized icon action with explicit idle, selected, and disabled states.
 *
 * The selected state changes both container and content colors. This avoids the current
 * toolbar ambiguity where active modes are communicated only by a small icon tint change.
 */
@Composable
internal fun StudioIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    selected: Boolean = false,
) {
    val container = when {
        selected -> MaterialTheme.colorScheme.primaryContainer
        else -> StudioControlTokens.IdleBackground
    }
    val content = when {
        !enabled -> StudioControlTokens.DisabledContent
        selected -> MaterialTheme.colorScheme.onPrimaryContainer
        else -> MaterialTheme.colorScheme.onSurface
    }

    IconButton(
        onClick = onClick,
        modifier = modifier
            .defaultMinSize(
                minWidth = StudioControlTokens.TouchTarget,
                minHeight = StudioControlTokens.TouchTarget,
            )
            .size(StudioControlTokens.TouchTarget),
        enabled = enabled,
        colors = IconButtonDefaults.iconButtonColors(
            containerColor = container,
            contentColor = content,
            disabledContainerColor = StudioControlTokens.IdleBackground,
            disabledContentColor = StudioControlTokens.DisabledContent,
        ),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            modifier = Modifier.size(StudioControlTokens.IconSize),
        )
    }
}

/**
 * Brush/tool selector with a persistent selection ring and a generous S Pen target.
 * The slot permits either an icon or the current brush-initial representation.
 */
@Composable
internal fun StudioToolButton(
    selected: Boolean,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Surface(
        onClick = onClick,
        modifier = modifier.size(StudioControlTokens.TouchTarget),
        shape = RoundedCornerShape(StudioControlTokens.ControlRadius),
        color = if (selected) {
            MaterialTheme.colorScheme.primaryContainer
        } else {
            StudioControlTokens.GroupBackground
        },
        contentColor = if (selected) {
            MaterialTheme.colorScheme.onPrimaryContainer
        } else {
            MaterialTheme.colorScheme.onSurface
        },
        border = if (selected) {
            BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
        } else {
            BorderStroke(1.dp, Color(0xFF41444D))
        },
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.size(StudioControlTokens.TouchTarget),
        ) {
            // Surface supplies semantics through onClick; description is provided by slot content.
            @Suppress("UNUSED_VARIABLE")
            val accessibilityLabel = contentDescription
            content()
        }
    }
}
