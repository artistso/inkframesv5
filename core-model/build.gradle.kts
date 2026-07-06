// Pure-Kotlin domain model (brushes, layers, timeline, scenes, project codec).
// Exposes core-common types through its public API, so core-common is an `api`
// dependency rather than `implementation`.
plugins {
    alias(libs.plugins.kotlin.jvm)
}

// Target JVM 17 bytecode to match the Android modules (and the CI JDK).
tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    kotlinOptions.jvmTarget = "17"
}

dependencies {
    api(project(":core-common"))
    implementation(libs.kotlin.stdlib)
    testImplementation(libs.junit)
}
