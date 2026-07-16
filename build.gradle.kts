// Root project configuration shared by every module.
//
// Each module owns its own build.gradle.kts. This root file only establishes
// which plugins are *available* (via `apply false`) so the per-module files can
// opt in with a single `alias(...)`. Repositories are declared centrally in
// settings.gradle.kts through dependencyResolutionManagement (FAIL_ON_PROJECT_REPOS),
// so they are intentionally NOT repeated here.

plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
