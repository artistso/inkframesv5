from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:220]!r}")
    p.write_text(text.replace(old, new, 1))


canvas = "feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/CanvasView.kt"
replace_once(
    canvas,
    "import com.inkframe.core.model.Brush\n",
    "import com.inkframe.core.model.Brush\nimport com.inkframe.core.model.DefaultBrushes\n",
)
replace_once(
    canvas,
    '''    private enum class Mode { IDLE, DRAW, NAVIGATE }\n    private var mode = Mode.IDLE\n''',
    '''    private enum class Mode { IDLE, DRAW, NAVIGATE }\n    private var mode = Mode.IDLE\n    private var physicalEraserStroke = false\n''',
)
replace_once(
    canvas,
    '''                    eyedropperActive -> {\n                        // Eyedropper: sample the colour under the finger; don't draw.\n                        mode = Mode.IDLE\n                        sampleColorAtView(event.getX(0), event.getY(0))\n                    }\n                    fillActive -> {\n                        // Bucket: flood-fill the active cel at the tap; don't draw.\n                        mode = Mode.IDLE\n                        floodFillAtView(event.getX(0), event.getY(0))\n                    }\n                    else -> {\n                        mode = Mode.DRAW\n                        onStrokeInput?.invoke(\n                            "INK CONTACT · ${cfg.brush.name.uppercase()} · ${cfg.brush.sizePx.toInt()} PX",\n                        )\n                        renderer.post(CanvasRenderer.EngineEvent.Begin(cfg.targetSurfaceId, cfg.brush, cfg.color, sample(0)))\n                        requestRender()\n                    }\n''',
    '''                    eyedropperActive -> {\n                        // Eyedropper: sample the colour under the finger; don't draw.\n                        mode = Mode.IDLE\n                        physicalEraserStroke = false\n                        sampleColorAtView(event.getX(0), event.getY(0))\n                    }\n                    fillActive -> {\n                        // Bucket: flood-fill the active cel at the tap; don't draw.\n                        mode = Mode.IDLE\n                        physicalEraserStroke = false\n                        floodFillAtView(event.getX(0), event.getY(0))\n                    }\n                    else -> {\n                        mode = Mode.DRAW\n                        val toolType = event.getToolType(0)\n                        physicalEraserStroke = isPhysicalEraserTool(toolType)\n                        val contactBrush = brushForStylusTool(cfg.brush, toolType)\n                        onStrokeInput?.invoke(\n                            if (physicalEraserStroke) {\n                                "ERASER CONTACT · ${contactBrush.sizePx.toInt()} PX"\n                            } else {\n                                "INK CONTACT · ${contactBrush.name.uppercase()} · ${contactBrush.sizePx.toInt()} PX"\n                            },\n                        )\n                        renderer.post(\n                            CanvasRenderer.EngineEvent.Begin(\n                                cfg.targetSurfaceId, contactBrush, cfg.color, sample(0),\n                            ),\n                        )\n                        requestRender()\n                    }\n''',
)
replace_once(
    canvas,
    '''                if (mode == Mode.DRAW) {\n                    renderer.post(CanvasRenderer.EngineEvent.End)\n                    onArtworkChanged?.invoke()\n                }\n                if (event.pointerCount >= 2) beginNavigation(event)\n''',
    '''                if (mode == Mode.DRAW) {\n                    renderer.post(CanvasRenderer.EngineEvent.End)\n                    onArtworkChanged?.invoke()\n                    physicalEraserStroke = false\n                }\n                if (event.pointerCount >= 2) beginNavigation(event)\n''',
)
replace_once(
    canvas,
    '''                if (mode == Mode.DRAW) {\n                    renderer.post(CanvasRenderer.EngineEvent.End)\n                    onStrokeInput?.invoke("INK COMMITTED · FRAME ${cfg.targetSurfaceId}")\n                    onArtworkChanged?.invoke()\n                }\n                mode = Mode.IDLE\n''',
    '''                if (mode == Mode.DRAW) {\n                    renderer.post(CanvasRenderer.EngineEvent.End)\n                    onStrokeInput?.invoke(\n                        if (physicalEraserStroke) {\n                            "ERASER COMMITTED · CEL ${cfg.targetSurfaceId}"\n                        } else {\n                            "INK COMMITTED · CEL ${cfg.targetSurfaceId}"\n                        },\n                    )\n                    onArtworkChanged?.invoke()\n                }\n                physicalEraserStroke = false\n                mode = Mode.IDLE\n''',
)

helper = Path("feature-canvas/src/main/kotlin/com/inkframe/feature/canvas/PhysicalStylusTool.kt")
helper.write_text('''package com.inkframe.feature.canvas\n\nimport android.view.MotionEvent\nimport com.inkframe.core.model.Brush\nimport com.inkframe.core.model.DefaultBrushes\n\n/** Returns true when Android identifies the contact as an eraser or inverted stylus. */\ninternal fun isPhysicalEraserTool(toolType: Int): Boolean =\n    toolType == MotionEvent.TOOL_TYPE_ERASER\n\n/**\n * Resolves the temporary contact brush without mutating the artist's selected brush.\n * Android reports an eraser-button/inverted contact as TOOL_TYPE_ERASER.\n */\ninternal fun brushForStylusTool(selectedBrush: Brush, toolType: Int): Brush =\n    if (isPhysicalEraserTool(toolType)) DefaultBrushes.eraser else selectedBrush\n''')

test = Path("feature-canvas/src/test/kotlin/com/inkframe/feature/canvas/PhysicalStylusToolTest.kt")
test.parent.mkdir(parents=True, exist_ok=True)
test.write_text('''package com.inkframe.feature.canvas\n\nimport android.view.MotionEvent\nimport com.inkframe.core.model.BrushKind\nimport com.inkframe.core.model.DefaultBrushes\nimport org.junit.Assert.assertEquals\nimport org.junit.Assert.assertFalse\nimport org.junit.Assert.assertSame\nimport org.junit.Assert.assertTrue\nimport org.junit.Test\n\nclass PhysicalStylusToolTest {\n    @Test\n    fun eraserToolSelectsTemporaryEraserBrush() {\n        val result = brushForStylusTool(DefaultBrushes.ink, MotionEvent.TOOL_TYPE_ERASER)\n        assertEquals(BrushKind.ERASER, result.kind)\n        assertEquals(DefaultBrushes.eraser.id, result.id)\n    }\n\n    @Test\n    fun stylusTipKeepsSelectedBrush() {\n        val selected = DefaultBrushes.pencil\n        val result = brushForStylusTool(selected, MotionEvent.TOOL_TYPE_STYLUS)\n        assertSame(selected, result)\n    }\n\n    @Test\n    fun fingerKeepsSelectedBrush() {\n        val selected = DefaultBrushes.marker\n        val result = brushForStylusTool(selected, MotionEvent.TOOL_TYPE_FINGER)\n        assertSame(selected, result)\n    }\n\n    @Test\n    fun physicalEraserDetectionIsExact() {\n        assertTrue(isPhysicalEraserTool(MotionEvent.TOOL_TYPE_ERASER))\n        assertFalse(isPhysicalEraserTool(MotionEvent.TOOL_TYPE_STYLUS))\n    }\n}\n''')

registry = "docs/FEATURE_PARITY_REGISTRY.json"
replace_once(
    registry,
    '{"id":"physical-eraser","status":"missing","evidence":[]}',
    '{"id":"physical-eraser","status":"implemented_unverified","evidence":["CanvasView.kt","PhysicalStylusTool.kt","PhysicalStylusToolTest.kt"]}',
)

changelog = "CHANGELOG.md"
replace_once(
    changelog,
    "## [Unreleased]\n\n",
    "## [Unreleased]\n\n### Native Android — physical S Pen eraser\n- Routed Android `TOOL_TYPE_ERASER` contacts through the native eraser brush without changing the artist's selected brush.\n- Added explicit eraser contact/commit QA status and unit tests for stylus-tip, eraser, and finger tool selection.\n\n",
)
