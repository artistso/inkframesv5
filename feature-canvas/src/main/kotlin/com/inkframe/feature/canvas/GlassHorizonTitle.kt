package com.inkframe.feature.canvas

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal object GlassHorizonTitleSpec {
    const val TITLE: String = "INKFRAME"
    const val SUBTITLE: String = "THE GLASS HORIZON"
    const val TITLE_SIZE_SP: Float = 20f
    const val TITLE_TRACKING_SP: Float = 4.4f
    const val SUBTITLE_SIZE_SP: Float = 10f
    const val SUBTITLE_TRACKING_SP: Float = 2.8f
    const val TOP_OFFSET_DP: Float = 14f
    const val SUBTITLE_TOP_GAP_DP: Float = 3f
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
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = GlassHorizonTitleSpec.TITLE,
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
                letterSpacing = GlassHorizonTitleSpec.TITLE_TRACKING_SP.sp,
                shadow = Shadow(
                    color = Color.White.copy(alpha = 0.25f),
                    blurRadius = 16f,
                ),
            ),
        )
        Text(
            text = GlassHorizonTitleSpec.SUBTITLE,
            modifier = Modifier.padding(top = GlassHorizonTitleSpec.SUBTITLE_TOP_GAP_DP.dp),
            color = dim.copy(alpha = 0.86f),
            textAlign = TextAlign.Center,
            maxLines = 1,
            style = TextStyle(
                fontFamily = FontFamily.Default,
                fontWeight = FontWeight.Bold,
                fontSize = GlassHorizonTitleSpec.SUBTITLE_SIZE_SP.sp,
                letterSpacing = GlassHorizonTitleSpec.SUBTITLE_TRACKING_SP.sp,
                shadow = Shadow(
                    color = Color.Black.copy(alpha = 0.72f),
                    blurRadius = 10f,
                ),
            ),
        )
    }
}
