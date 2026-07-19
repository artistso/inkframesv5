package com.inkframe.feature.canvas

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale

internal object GlassHorizonTitleSpec {
    const val TITLE: String = "InkFrame"
    const val SUBTITLE: String = "The Glass Horizon"
    const val TITLE_SIZE_SP: Float = 20f
    const val TITLE_LINE_HEIGHT_SP: Float = 22f
    const val TITLE_TRACKING_SP: Float = 4.4f
    const val SUBTITLE_SIZE_SP: Float = 10f
    const val SUBTITLE_LINE_HEIGHT_SP: Float = 12f
    const val SUBTITLE_TRACKING_SP: Float = 2.8f
    const val TOP_OFFSET_DP: Float = 14f
    const val SUBTITLE_TOP_GAP_DP: Float = 3f
    const val SUBTITLE_VERTICAL_PADDING_DP: Float = 1f
    const val SUBTITLE_HORIZONTAL_PADDING_DP: Float = 8f
    const val COMMAND_TOP_OFFSET_DP: Float = 66f
    const val COMMAND_CLUSTER_HEIGHT_DP: Float = 81f
    const val MIN_COMMAND_CLEARANCE_DP: Float = 12f
    const val SUBTITLE_PLATE_ALPHA: Float = 0.82f

    val displayedTitle: String get() = TITLE.uppercase(Locale.ROOT)
    val displayedSubtitle: String get() = SUBTITLE.uppercase(Locale.ROOT)
    val accessibilityLabel: String get() = "$TITLE. $SUBTITLE"

    fun measuredTextBlockHeightDp(fontScale: Float): Float {
        require(fontScale > 0f)
        val scaledLineHeight = (TITLE_LINE_HEIGHT_SP + SUBTITLE_LINE_HEIGHT_SP) * fontScale
        return scaledLineHeight + SUBTITLE_TOP_GAP_DP + 2f * SUBTITLE_VERTICAL_PADDING_DP
    }

    fun titleBottomDp(fontScale: Float): Float =
        TOP_OFFSET_DP + measuredTextBlockHeightDp(fontScale)

    fun commandTopDp(fontScale: Float): Float = maxOf(
        COMMAND_TOP_OFFSET_DP,
        titleBottomDp(fontScale) + MIN_COMMAND_CLEARANCE_DP,
    )

    fun commandBottomDp(
        fontScale: Float,
        commandClusterHeightDp: Float = COMMAND_CLUSTER_HEIGHT_DP,
    ): Float {
        require(commandClusterHeightDp > 0f)
        return commandTopDp(fontScale) + commandClusterHeightDp
    }
}

/** Fixed top-center product identity from the binding Glass Horizon contract. */
@Composable
internal fun GlassHorizonTitle(
    accent: Color,
    rose: Color,
    dim: Color,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.clearAndSetSemantics {
            heading()
            contentDescription = GlassHorizonTitleSpec.accessibilityLabel
        },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = GlassHorizonTitleSpec.displayedTitle,
            textAlign = TextAlign.Center,
            maxLines = 1,
            style = TextStyle(
                brush = Brush.verticalGradient(
                    colorStops = arrayOf(
                        0.00f to Color.White,
                        0.55f to rose,
                        1.00f to accent,
                    ),
                ),
                fontFamily = FontFamily.Serif,
                fontWeight = FontWeight.Bold,
                fontSize = GlassHorizonTitleSpec.TITLE_SIZE_SP.sp,
                lineHeight = GlassHorizonTitleSpec.TITLE_LINE_HEIGHT_SP.sp,
                letterSpacing = GlassHorizonTitleSpec.TITLE_TRACKING_SP.sp,
                shadow = Shadow(
                    color = Color.White.copy(alpha = 0.25f),
                    blurRadius = 16f,
                ),
            ),
        )
        Box(
            modifier = Modifier
                .padding(top = GlassHorizonTitleSpec.SUBTITLE_TOP_GAP_DP.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0xFF14000E).copy(alpha = GlassHorizonTitleSpec.SUBTITLE_PLATE_ALPHA))
                .padding(
                    horizontal = GlassHorizonTitleSpec.SUBTITLE_HORIZONTAL_PADDING_DP.dp,
                    vertical = GlassHorizonTitleSpec.SUBTITLE_VERTICAL_PADDING_DP.dp,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = GlassHorizonTitleSpec.displayedSubtitle,
                color = dim,
                textAlign = TextAlign.Center,
                maxLines = 1,
                style = TextStyle(
                    fontFamily = FontFamily.Default,
                    fontWeight = FontWeight.Bold,
                    fontSize = GlassHorizonTitleSpec.SUBTITLE_SIZE_SP.sp,
                    lineHeight = GlassHorizonTitleSpec.SUBTITLE_LINE_HEIGHT_SP.sp,
                    letterSpacing = GlassHorizonTitleSpec.SUBTITLE_TRACKING_SP.sp,
                    shadow = Shadow(
                        color = Color.Black.copy(alpha = 0.92f),
                        blurRadius = 4f,
                    ),
                ),
            )
        }
    }
}
