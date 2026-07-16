// Layers feature module. Currently a reserved placeholder (the layer panel lives
// inline in :feature-canvas). Kept as a pure-Kotlin module so it stays cheap and
// testable; promote to an Android library once it gains Compose/resource needs.
plugins {
    alias(libs.plugins.kotlin.jvm)
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        freeCompilerArgs.add("-Xjspecify-annotations=strict")
    }
}

dependencies {
    implementation(libs.kotlin.stdlib)
    testImplementation(libs.junit)
}
