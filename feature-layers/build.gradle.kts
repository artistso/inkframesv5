// Layers feature module. Currently a reserved placeholder (the layer panel lives
// inline in :feature-canvas). Kept as a pure-Kotlin module so it stays cheap and
// testable; promote to an Android library once it gains Compose/resource needs.
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
