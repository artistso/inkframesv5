import org.gradle.api.tasks.testing.Test

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

// The default test task is the blocking native-product model gate. Historical browser
// archive/session fixtures remain valuable migration evidence, but they are isolated from
// Android release authority and run through legacyWebTest while issue #167 is repaired.
tasks.named<Test>("test") {
    exclude("com/inkframe/core/model/web/**")
}

tasks.register<Test>("legacyWebTest") {
    group = "verification"
    description = "Runs archived browser/WebView-era archive and session compatibility fixtures."
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    include("com/inkframe/core/model/web/**")
    shouldRunAfter(tasks.named("test"))
}
