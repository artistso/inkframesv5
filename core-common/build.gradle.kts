// Pure-Kotlin, platform-agnostic utilities (JSON, GIF/LZW encoder, YUV converter,
// math, undo stack, dirty regions). No Android dependency, so it builds and tests
// on the plain JVM — no SDK required.
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
