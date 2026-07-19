package com.inkframe.feature.canvas

import com.inkframe.core.model.NativeProjectTemplates
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StudioStateProjectReplacementTest {

    @Test
    fun replaceProjectClearsEngineBackedClipboard() {
        val state = StudioState()
        state.ensureActiveCel()
        state.copyCel()
        assertTrue(state.canPaste)

        state.replaceProject(
            NativeProjectTemplates.create(
                NativeProjectTemplates.byId("square")!!,
            ),
        )

        assertFalse(state.canPaste)
    }
}
