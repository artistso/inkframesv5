# Preserve line numbers so Play Console / crash reports map back to source.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Keep the domain model and core-common types intact. They are serialized to/from the
# project JSON and exposed through the public API, so don't let R8 prune or rename them.
-keep class com.inkframe.core.model.** { *; }
-keep class com.inkframe.core.common.** { *; }

# Compose and coroutines ship their own consumer R8 rules via AndroidX; nothing extra
# is required here, so the default optimization runs unimpeded.
