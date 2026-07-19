package com.inkframe.feature.canvas

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

internal enum class GlassHorizonAtmosphereLayer {
    HORIZON,
    RAYS,
    GRAIN,
    VIGNETTE,
    GLINT,
}

internal data class GlassHorizonWorldPalette(
    val horizonStops: List<Pair<Float, Color>>,
    val rayColor: Color,
    val grainColor: Color,
    val vignetteColor: Color,
    val glintColor: Color,
)

/** Pure, testable theme-world specification used by the Compose atmosphere. */
internal object GlassHorizonThemeWorld {
    val layerOrder: List<GlassHorizonAtmosphereLayer> = listOf(
        GlassHorizonAtmosphereLayer.HORIZON,
        GlassHorizonAtmosphereLayer.RAYS,
        GlassHorizonAtmosphereLayer.GRAIN,
        GlassHorizonAtmosphereLayer.VIGNETTE,
        GlassHorizonAtmosphereLayer.GLINT,
    )

    val plum: GlassHorizonWorldPalette = GlassHorizonWorldPalette(
        horizonStops = listOf(
            0.00f to Color(0xFFFFD9E2),
            0.14f to Color(0xFFF7CAC9),
            0.38f to Color(0xFFD77FA0),
            0.64f to Color(0xFFA52766),
            0.86f to Color(0xFF4D0A33),
            1.00f to Color(0xFF1A001A),
        ),
        rayColor = Color.White,
        grainColor = Color.White,
        vignetteColor = Color(0x8C14000E),
        glintColor = Color(0xFFFFF0F3),
    )

    val blue: GlassHorizonWorldPalette = GlassHorizonWorldPalette(
        horizonStops = listOf(
            0.00f to Color(0xFFE7F0FF),
            0.14f to Color(0xFFBFD7FF),
            0.38f to Color(0xFF8BB7FF),
            0.64f to Color(0xFF2D75FF),
            0.86f to Color(0xFF08235F),
            1.00f to Color(0xFF071032),
        ),
        rayColor = Color(0xFFF4F8FF),
        grainColor = Color.White,
        vignetteColor = Color(0x99030924),
        glintColor = Color(0xFFE8F0FF),
    )

    fun palette(isBlue: Boolean): GlassHorizonWorldPalette = if (isBlue) blue else plum
}

/**
 * Full-screen native atmospheric stack. Each visual concern stays in its own composited layer,
 * matching the binding Glass Horizon order and keeping transient glints out of the static world.
 */
@Composable
internal fun GlassHorizonAtmosphere(
    isBlue: Boolean,
    glintAlpha: Float,
    modifier: Modifier = Modifier,
) {
    Box(modifier) {
        Crossfade(
            targetState = isBlue,
            animationSpec = tween(durationMillis = 600),
            label = "Glass Horizon theme world",
        ) { blue ->
            val palette = GlassHorizonThemeWorld.palette(blue)
            Box(Modifier.fillMaxSize()) {
                GlassHorizonLayer(palette, Modifier.fillMaxSize())
                GlassHorizonRays(palette, Modifier.fillMaxSize().blur(2.dp))
                GlassHorizonGrain(palette, Modifier.fillMaxSize())
                GlassHorizonVignette(palette, Modifier.fillMaxSize())
            }
        }
        GlassHorizonGlint(
            palette = GlassHorizonThemeWorld.palette(isBlue),
            alpha = glintAlpha.coerceIn(0f, 1f),
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
private fun GlassHorizonLayer(
    palette: GlassHorizonWorldPalette,
    modifier: Modifier,
) {
    Canvas(modifier) {
        drawRect(
            brush = Brush.radialGradient(
                colorStops = palette.horizonStops.toTypedArray(),
                center = Offset(size.width * 0.5f, -size.height * 0.12f),
                radius = size.width * 1.20f,
            ),
        )
    }
}

@Composable
private fun GlassHorizonRays(
    palette: GlassHorizonWorldPalette,
    modifier: Modifier,
) {
    Canvas(modifier) {
        val origin = Offset(size.width * 0.5f, 0f)
        val raySpecs = listOf(
            Triple(-64f, 0.080f, 0.35f),
            Triple(-44f, 0.045f, 0.22f),
            Triple(-24f, 0.075f, 0.30f),
            Triple(-6f, 0.040f, 0.18f),
            Triple(16f, 0.072f, 0.30f),
            Triple(38f, 0.046f, 0.22f),
            Triple(58f, 0.076f, 0.32f),
        )
        raySpecs.forEach { (degrees, spreadFraction, sourceAlpha) ->
            val radians = degrees / 180f * PI.toFloat()
            val reach = size.maxDimension * 1.42f
            val center = Offset(
                origin.x + cos(radians) * reach,
                origin.y + sin(radians) * reach,
            )
            val spread = size.width * spreadFraction
            val path = Path().apply {
                moveTo(origin.x, origin.y)
                lineTo(center.x - spread, center.y)
                lineTo(center.x + spread, center.y)
                close()
            }
            // The reference layer is 42% overall opacity; source wedges retain their own alpha.
            drawPath(
                path = path,
                color = palette.rayColor,
                alpha = sourceAlpha * 0.42f,
                blendMode = BlendMode.Screen,
            )
        }
    }
}

@Composable
private fun GlassHorizonGrain(
    palette: GlassHorizonWorldPalette,
    modifier: Modifier,
) {
    Canvas(modifier) {
        // Deterministic low-discrepancy distribution: no runtime randomness and no visible tile.
        repeat(720) { index ->
            val x = ((index * 0.61803398875f) % 1f) * size.width
            val y = ((index * 0.754877666f + 0.173f) % 1f) * size.height
            val radius = when (index % 7) {
                0 -> 0.72f
                1, 2 -> 0.48f
                else -> 0.30f
            }
            drawCircle(
                color = palette.grainColor,
                radius = radius,
                center = Offset(x, y),
                alpha = if (index % 5 == 0) 0.05f else 0.032f,
                blendMode = BlendMode.Overlay,
            )
        }
    }
}

@Composable
private fun GlassHorizonVignette(
    palette: GlassHorizonWorldPalette,
    modifier: Modifier,
) {
    Canvas(modifier) {
        drawRect(
            brush = Brush.radialGradient(
                colorStops = arrayOf(
                    0.00f to Color.Transparent,
                    0.55f to Color.Transparent,
                    1.00f to palette.vignetteColor,
                ),
                center = Offset(size.width * 0.5f, size.height * 0.42f),
                radius = size.maxDimension * 0.92f,
            ),
        )
    }
}

@Composable
private fun GlassHorizonGlint(
    palette: GlassHorizonWorldPalette,
    alpha: Float,
    modifier: Modifier,
) {
    Canvas(modifier) {
        if (alpha <= 0f) return@Canvas
        drawCircle(
            brush = Brush.radialGradient(
                colorStops = arrayOf(
                    0.00f to palette.glintColor.copy(alpha = alpha),
                    0.22f to palette.glintColor.copy(alpha = alpha * 0.44f),
                    1.00f to Color.Transparent,
                ),
                center = Offset(size.width * 0.50f, size.height * 0.08f),
                radius = size.minDimension * 0.36f,
            ),
            radius = size.minDimension * 0.36f,
            center = Offset(size.width * 0.50f, size.height * 0.08f),
            blendMode = BlendMode.Screen,
        )
        drawCircle(
            brush = Brush.radialGradient(
                colorStops = arrayOf(
                    0.00f to palette.glintColor.copy(alpha = alpha * 0.26f),
                    1.00f to Color.Transparent,
                ),
                center = Offset(size.width * 0.50f, size.height * 0.50f),
                radius = size.minDimension * 0.28f,
            ),
            radius = size.minDimension * 0.28f,
            center = Offset(size.width * 0.50f, size.height * 0.50f),
            blendMode = BlendMode.Screen,
        )
    }
}
