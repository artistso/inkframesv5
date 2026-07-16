// Pure-Kotlin domain model (brushes, layers, timeline, scenes, project codec).
// Exposes core-common types through its public API, so core-common is an `api`
// dependency rather than `implementation`.
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
    api(project(":core-common"))
    implementation(libs.kotlin.stdlib)
    testImplementation(libs.junit)
}
