package com.inkframe.studio.nativeink

import com.inkframe.core.model.StudioArtistCanvasStatus
import java.util.concurrent.atomic.AtomicReference

internal object StudioArtistCanvasStatusStore {
    private val currentLabel = AtomicReference("")

    fun update(status: StudioArtistCanvasStatus?) {
        currentLabel.set(status?.displayText().orEmpty())
    }

    fun label(): String = currentLabel.get()

    fun clear() {
        currentLabel.set("")
    }
}
