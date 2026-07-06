# Keep GLSL-driven classes that are reflected over by name (none currently), and
# keep model data classes intact for future serialization.
-keep class com.inkframe.core.model.** { *; }

# Compose already ships consumer rules via AndroidX; nothing extra required here.
