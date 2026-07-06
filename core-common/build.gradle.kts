// Pure-Kotlin, platform-agnostic utilities (JSON, GIF/LZW encoder, YUV converter,
// math, undo stack, dirty regions). No Android dependency, so it builds and tests
// on the plain JVM — no SDK required.
plugins {
    alias(libs.plugins.kotlin.jvm)
}

// Target JVM 17 bytecode to match the Android modules (and the CI JDK).
tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    kotlinOptions.jvmTarget = "17"
}

dependencies {
    implementation(libs.kotlin.stdlib)
    testImplementation(libs.junit)
}
