package com.inkframe.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class LayerOpsTest {

    private fun layer(id: String, name: String = id) = Layer(id = id, name = name)
    private fun scene(vararg ids: String) =
        Scene(id = "s", name = "S", frameCount = 4, layers = ids.map { layer(it) })

    private fun ids(s: Scene) = s.layers.map { it.id }

    @Test
    fun indexOf_findsLayer() {
        val s = scene("a", "b", "c")
        assertEquals(0, LayerOps.indexOf(s, "a"))
        assertEquals(2, LayerOps.indexOf(s, "c"))
        assertEquals(-1, LayerOps.indexOf(s, "z"))
    }

    @Test
    fun moveUp_movesTowardTopOfStack() {
        // index 0 = bottom; moveUp = toward end of list.
        val s = LayerOps.moveUp(scene("a", "b", "c"), "a")
        assertEquals(listOf("b", "a", "c"), ids(s))
    }

    @Test
    fun moveDown_movesTowardBottom() {
        val s = LayerOps.moveDown(scene("a", "b", "c"), "c")
        assertEquals(listOf("a", "c", "b"), ids(s))
    }

    @Test
    fun moveUp_atTopIsNoop() {
        val s = scene("a", "b", "c")
        assertSame(s, LayerOps.moveUp(s, "c"))
    }

    @Test
    fun moveDown_atBottomIsNoop() {
        val s = scene("a", "b", "c")
        assertSame(s, LayerOps.moveDown(s, "a"))
    }

    @Test
    fun moveTo_repositionsAndClamps() {
        assertEquals(listOf("b", "c", "a"), ids(LayerOps.moveTo(scene("a", "b", "c"), "a", 2)))
        assertEquals(listOf("c", "a", "b"), ids(LayerOps.moveTo(scene("a", "b", "c"), "c", 0)))
        // Clamp beyond range.
        assertEquals(listOf("b", "c", "a"), ids(LayerOps.moveTo(scene("a", "b", "c"), "a", 99)))
    }

    @Test
    fun moveTo_sameIndexIsNoop() {
        val s = scene("a", "b", "c")
        assertSame(s, LayerOps.moveTo(s, "b", 1))
    }

    @Test
    fun rename_trimsAndCaps() {
        val s = LayerOps.rename(scene("a"), "a", "  Ink Lines  ")
        assertEquals("Ink Lines", s.layers[0].name)
    }

    @Test
    fun rename_blankFallsBack() {
        val s = LayerOps.rename(scene("a"), "a", "   ")
        assertEquals("Layer", s.layers[0].name)
    }

    @Test
    fun delete_removesLayer() {
        val s = LayerOps.delete(scene("a", "b", "c"), "b")
        assertEquals(listOf("a", "c"), ids(s))
    }

    @Test
    fun delete_lastRemainingIsNoop() {
        val s = scene("only")
        assertSame(s, LayerOps.delete(s, "only"))
    }

    @Test
    fun delete_unknownIdIsNoop() {
        val s = scene("a", "b")
        assertSame(s, LayerOps.delete(s, "z"))
    }

    @Test
    fun activeAfterDelete_picksReplacementWhenActiveDeleted() {
        val s = scene("a", "b", "c")
        // delete active "b" (index 1) -> remaining [a,c]; slot 1 now holds "c".
        assertEquals("c", LayerOps.activeAfterDelete(s, "b", "b"))
    }

    @Test
    fun activeAfterDelete_deletingLastIndexFallsToNewLast() {
        val s = scene("a", "b", "c")
        // delete active "c" (index 2) -> remaining [a,b]; index 2 absent -> last = "b".
        assertEquals("b", LayerOps.activeAfterDelete(s, "c", "c"))
    }

    @Test
    fun activeAfterDelete_unchangedWhenNonActiveDeleted() {
        val s = scene("a", "b", "c")
        assertEquals("a", LayerOps.activeAfterDelete(s, "b", "a"))
    }

    @Test
    fun toggleVisible_andLock() {
        var s = scene("a")
        assertTrue(s.layers[0].visible)
        s = LayerOps.toggleVisible(s, "a")
        assertTrue(!s.layers[0].visible)
        s = LayerOps.toggleLocked(s, "a")
        assertTrue(s.layers[0].locked)
    }

    @Test
    fun setOpacity_clamps() {
        assertEquals(1f, LayerOps.setOpacity(scene("a"), "a", 5f).layers[0].opacity, 0f)
        assertEquals(0f, LayerOps.setOpacity(scene("a"), "a", -1f).layers[0].opacity, 0f)
        assertEquals(0.4f, LayerOps.setOpacity(scene("a"), "a", 0.4f).layers[0].opacity, 1e-6f)
    }

    @Test
    fun setBlendMode_updates() {
        val s = LayerOps.setBlendMode(scene("a"), "a", BlendMode.MULTIPLY)
        assertEquals(BlendMode.MULTIPLY, s.layers[0].blendMode)
    }

    @Test
    fun blendMode_displayNamesAreTitleCase() {
        assertEquals("Normal", BlendMode.NORMAL.displayName)
        assertEquals("Multiply", BlendMode.MULTIPLY.displayName)
        assertEquals("Difference", BlendMode.DIFFERENCE.displayName)
        // Every mode has a non-blank, capitalised label.
        for (m in BlendMode.entries) {
            assertTrue(m.displayName.isNotBlank())
            assertTrue(m.displayName[0].isUpperCase())
        }
    }

    @Test
    fun operations_preserveOtherLayersAndCels() {
        val withCel = Layer(id = "a", name = "A", cels = mapOf(0 to Cel(surfaceId = 7L)))
        val scene = Scene(id = "s", name = "S", frameCount = 4, layers = listOf(withCel, layer("b")))
        val moved = LayerOps.moveUp(scene, "a")
        // The cel data rides along with the layer through the reorder.
        assertEquals(7L, moved.layers[1].cels[0]!!.surfaceId)
    }
}
