from pathlib import Path
import re

screen_path = Path("feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/ClosedBetaGlassHorizonScreen.kt")
screen = screen_path.read_text()

dp_anchor = "import androidx.compose.ui.unit.Dp\n"
if "import androidx.compose.ui.unit.IntOffset\n" not in screen:
    if dp_anchor not in screen:
        raise SystemExit("Dp import anchor missing")
    screen = screen.replace(dp_anchor, dp_anchor + "import androidx.compose.ui.unit.IntOffset\n", 1)

android_view_anchor = "import androidx.compose.ui.viewinterop.AndroidView\n"
if "import androidx.compose.ui.window.Popup\n" not in screen:
    if android_view_anchor not in screen:
        raise SystemExit("AndroidView import anchor missing")
    screen = screen.replace(
        android_view_anchor,
        android_view_anchor + "import androidx.compose.ui.window.Popup\nimport androidx.compose.ui.window.PopupProperties\n",
        1,
    )

replacement = '''@Composable
private fun ClosedBetaNode(
    node: BetaNode,
    palette: BetaPalette,
    open: Boolean,
    onToggle: () -> Unit,
    actions: List<BetaAction>,
    fan: Fan,
    modifier: Modifier = Modifier,
) {
    Box(modifier.size(58.dp), contentAlignment = Alignment.Center) {
        if (open) {
            val density = LocalDensity.current
            actions.forEachIndexed { index, action ->
                val offset = betaFanOffset(index, fan)
                val popupOffset = with(density) {
                    IntOffset(
                        x = RadialActionPopupLayout.popupXDp(offset.first.value).dp.roundToPx(),
                        y = RadialActionPopupLayout.popupYDp(offset.second.value).dp.roundToPx(),
                    )
                }
                Popup(
                    alignment = Alignment.TopStart,
                    offset = popupOffset,
                    properties = PopupProperties(
                        focusable = false,
                        clippingEnabled = false,
                    ),
                ) {
                    ClosedBetaKid(action, palette)
                }
            }
        }

        val shape = CircleShape
        Box(
            modifier = Modifier
                .size(58.dp)
                .shadow(if (open) 24.dp else 14.dp, shape, clip = false)
                .clip(shape)
                .background(UiBrush.radialGradient(listOf(palette.glassStrong, palette.glassFill, Color(0x4614000E))))
                .border(1.dp, if (open) palette.rim else palette.stroke, shape)
                .clickable(onClick = onToggle),
            contentAlignment = Alignment.Center,
        ) {
            androidx.compose.material3.Text(
                text = node.glyph,
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                style = TextStyle(shadow = Shadow(Color(0xCC000000), Offset(0f, 1f), blurRadius = 8f)),
            )
            androidx.compose.material3.Text(
                text = node.label,
                color = palette.dim,
                fontSize = 9.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 1.1.sp,
                modifier = Modifier.align(Alignment.BottomCenter).offset(y = 22.dp),
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun ClosedBetaKid(action: BetaAction, palette: BetaPalette, modifier: Modifier = Modifier) {
    val tileShape = RoundedCornerShape(0.dp)
    Box(
        modifier = modifier
            .size(
                RadialActionPopupLayout.TILE_WIDTH_DP.dp,
                RadialActionPopupLayout.TILE_HEIGHT_DP.dp,
            )
            .background(
                when {
                    action.color != null -> UiBrush.linearGradient(listOf(action.color, Color(0xFF14000E)))
                    action.selected -> UiBrush.linearGradient(listOf(palette.accent, palette.accentDeep))
                    else -> UiBrush.linearGradient(listOf(palette.glassStrong, Color(0xFF14000E)))
                },
                tileShape,
            )
            .border(
                if (action.selected) 2.dp else 1.dp,
                if (action.selected) palette.rim else palette.stroke,
                tileShape,
            )
            .clickable(onClick = action.onClick)
            .padding(horizontal = 3.dp, vertical = 2.dp),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.material3.Text(
            text = action.label,
            color = Color.White,
            fontSize = 7.sp,
            lineHeight = 8.sp,
            fontWeight = FontWeight.Black,
            textAlign = TextAlign.Center,
            maxLines = 2,
        )
    }
}
'''

pattern = re.compile(
    r"@Composable\nprivate fun ClosedBetaNode\(.*?\n\}\n\nprivate fun betaFanOffset\(",
    re.S,
)
match = pattern.search(screen)
if not match:
    raise SystemExit("radial node/kid function boundary missing")
screen = screen[: match.start()] + replacement + "\n\nprivate fun betaFanOffset(" + screen[match.end() :]

if "RadialFanLayout" in screen or "RadialFanOffset" in screen:
    raise SystemExit("in-hierarchy radial fan references remain")
if screen.count("PopupProperties(") != 1:
    raise SystemExit("expected exactly one popup action policy")
if screen.count("RadialActionPopupLayout.popupXDp") != 1:
    raise SystemExit("popup center-preserving geometry missing")
screen_path.write_text(screen)

Path("feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/RadialActionPopupLayout.kt").write_text('''package com.inkframe.feature.canvas

/** Exact visible bounds for radial action tiles rendered above the top-ordered GL surface. */
internal object RadialActionPopupLayout {
    const val HISTORICAL_ACTION_EXTENT_DP: Float = 48f
    const val HISTORICAL_POSITION_CORRECTION_DP: Float = 5f
    const val TILE_WIDTH_DP: Float = 52f
    const val TILE_HEIGHT_DP: Float = 40f

    fun popupXDp(fanOffsetDp: Float): Float =
        fanOffsetDp + HISTORICAL_POSITION_CORRECTION_DP +
            (HISTORICAL_ACTION_EXTENT_DP - TILE_WIDTH_DP) / 2f

    fun popupYDp(fanOffsetDp: Float): Float =
        fanOffsetDp + HISTORICAL_POSITION_CORRECTION_DP +
            (HISTORICAL_ACTION_EXTENT_DP - TILE_HEIGHT_DP) / 2f

    fun historicalCenterDp(fanOffsetDp: Float): Float =
        fanOffsetDp + HISTORICAL_POSITION_CORRECTION_DP + HISTORICAL_ACTION_EXTENT_DP / 2f

    fun popupCenterXDp(fanOffsetDp: Float): Float = popupXDp(fanOffsetDp) + TILE_WIDTH_DP / 2f
    fun popupCenterYDp(fanOffsetDp: Float): Float = popupYDp(fanOffsetDp) + TILE_HEIGHT_DP / 2f
}
''')

Path("feature-canvas/src/test/kotlin/com/inkframe/feature/canvas/RadialActionPopupLayoutTest.kt").write_text('''package com.inkframe.feature.canvas

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RadialActionPopupLayoutTest {
    @Test
    fun rectangularTilePreservesHistoricalFanCenter() {
        listOf(-260f, -72f, 0f, 72f, 260f).forEach { offset ->
            val expected = RadialActionPopupLayout.historicalCenterDp(offset)
            assertEquals(expected, RadialActionPopupLayout.popupCenterXDp(offset), 0f)
            assertEquals(expected, RadialActionPopupLayout.popupCenterYDp(offset), 0f)
        }
    }

    @Test
    fun popupBoundsAreExactlyTheVisibleControl() {
        assertEquals(52f, RadialActionPopupLayout.TILE_WIDTH_DP, 0f)
        assertEquals(40f, RadialActionPopupLayout.TILE_HEIGHT_DP, 0f)
        assertTrue(RadialActionPopupLayout.TILE_WIDTH_DP > 0f)
        assertTrue(RadialActionPopupLayout.TILE_HEIGHT_DP > 0f)
    }
}
''')

Path("feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/RadialFanLayout.kt").unlink(missing_ok=True)
Path("feature-canvas/src/test/kotlin/com/inkframe/feature/canvas/RadialFanLayoutTest.kt").unlink(missing_ok=True)
