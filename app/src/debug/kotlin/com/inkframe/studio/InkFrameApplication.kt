package com.inkframe.studio

/**
 * Debug process host for native-only diagnostics.
 *
 * Detailed S Pen experiments remain available through the non-exported NativeInkLabActivity; the
 * application object intentionally performs no view-tree search and installs no JavaScript bridge.
 */
class DebugInkFrameApplication : InkFrameStudioApplication()
