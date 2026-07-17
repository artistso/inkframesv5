package com.inkframe.studio

import android.app.Application

/**
 * Process-level application object for the Kotlin-only InkFrame runtime.
 *
 * Startup no longer searches for a WebView, injects JavaScript interfaces, mirrors DOM state, or
 * replays completed native strokes into a browser engine. Native input, document state, rendering,
 * persistence, and export are owned by Kotlin modules.
 */
open class InkFrameStudioApplication : Application()
