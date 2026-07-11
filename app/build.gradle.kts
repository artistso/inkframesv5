import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.play.publisher)
}

// --- Shared app metadata ---------------------------------------------------
// web/metadata.json is the single source for the human version and Android SDK
// surface that both the Web UI and APK build expose. Keep parsing dependency-free
// so Gradle configuration stays fast and works before any app dependencies exist.
val webMetadataFile = rootProject.file("web/metadata.json")
fun webMetadataString(key: String): String? =
    Regex("\\\"$key\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"")
        .find(webMetadataFile.takeIf { it.exists() }?.readText() ?: "")
        ?.groupValues?.getOrNull(1)
fun webMetadataInt(key: String): Int? =
    Regex("\\\"$key\\\"\\s*:\\s*(\\d+)")
        .find(webMetadataFile.takeIf { it.exists() }?.readText() ?: "")
        ?.groupValues?.getOrNull(1)?.toIntOrNull()

// --- Versioning ------------------------------------------------------------
val baseVersionName = webMetadataString("version") ?: "0.1.0"
val metadataTargetSdk = webMetadataInt("targetSdk") ?: 35
val metadataMinSdk = webMetadataInt("minSdk") ?: 26
val versionCodeBase = 1
val resolvedVersionCode: Int = run {
    System.getenv("INKFRAME_VERSION_CODE")?.toIntOrNull()?.let { return@run it }
    val ci = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull()
    if (ci != null) versionCodeBase + ci else versionCodeBase
}

// --- Release signing -------------------------------------------------------
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { load(it) }
}

fun signingValue(propKey: String, envKey: String): String? =
    (keystoreProps.getProperty(propKey) ?: System.getenv(envKey))?.takeIf { it.isNotBlank() }

val releaseStorePath = signingValue("storeFile", "INKFRAME_KEYSTORE")
val hasReleaseSigning = releaseStorePath != null

android {
    namespace = "com.inkframe.studio"
    compileSdk = metadataTargetSdk

    defaultConfig {
        applicationId = webMetadataString("packageName") ?: "com.inkframe.studio"
        minSdk = metadataMinSdk
        targetSdk = metadataTargetSdk
        versionCode = resolvedVersionCode
        versionName = baseVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseStorePath!!)
                storePassword = signingValue("storePassword", "INKFRAME_KEYSTORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "INKFRAME_KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "INKFRAME_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            // The WebView shell has no meaningful Kotlin surface to shrink, and
            // R8 would strip nothing but risk breaking the JS bridge — keep it off.
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = if (hasReleaseSigning) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
        debug {
            isMinifyEnabled = false
            // Debug is the primary release artifact for InkFrame (the WebView shell
            // ships the same web/index.html for both variants). Keep the canonical
            // package name so the released APK is com.inkframe.studio.
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // The web app lives at /web in the repo. We stage just the runtime files
    // (HTML + any bundled assets) into build/generated/webAssets and add that
    // to `assets` — so no build-time cruft (package.json, vite config, …)
    // ends up in the APK.
    sourceSets {
        getByName("main") {
            assets.srcDir(layout.buildDirectory.dir("generated/webAssets"))
        }
    }

    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }
}

// Stage the web build into a clean directory that becomes the APK's asset root.
// Only runtime files are included — the Vite/npm scaffolding stays behind.
val stageWebAssets by tasks.registering(Copy::class) {
    val webDir = rootProject.file("web")
    from(webDir) {
        // Everything that the running app actually needs at runtime.
        include(
            "index.html",
            "**/*.js", "**/*.css",
            "**/*.png", "**/*.jpg", "**/*.jpeg", "**/*.gif", "**/*.webp", "**/*.svg",
            "**/*.mp3", "**/*.wav", "**/*.mp4",
            "**/*.woff", "**/*.woff2", "**/*.ttf", "**/*.otf",
            // PWA + service-worker files (no-ops inside the WebView, but harmless)
            "**/*.webmanifest", "manifest.json", "metadata.json", "sw.js",
        )
        // Explicitly skip build scaffolding that isn't served to the WebView.
        exclude(
            "package.json", "package-lock.json", "yarn.lock",
            "vite.config.js",
            "node_modules/**", "dist/**",
        )
    }
    into(layout.buildDirectory.dir("generated/webAssets"))
}

// The checked-in web/index.html is the known-good v0.1.1 browser fallback. For
// this tablet A/B branch, generate an Android-only copy that loads Brush Engine
// V2 and adds three explicit handoff hooks. The injector fails hard if any source
// marker moves, preventing a partially patched APK from being assembled.
val injectBrushV2Index by tasks.registering(Exec::class) {
    dependsOn(stageWebAssets)
    val injector = rootProject.file("tools/inject-brush-v2-index.mjs")
    val sourceIndex = rootProject.file("web/index.html")
    val targetIndex = layout.buildDirectory.file("generated/webAssets/index.html")
    inputs.files(injector, sourceIndex)
    outputs.file(targetIndex)
    workingDir(rootProject.projectDir)
    commandLine(
        "node",
        injector.absolutePath,
        sourceIndex.absolutePath,
        targetIndex.get().asFile.absolutePath,
    )
}

// Belt-and-braces: hook the generated index in front of any asset-touching task,
// regardless of variant name, so the APK can never package the uninstrumented
// file on this A/B branch.
tasks.matching {
    val n = it.name
    n.startsWith("merge") && n.endsWith("Assets") ||
    n.startsWith("package") && n.endsWith("Assets") ||
    n.startsWith("generate") && n.endsWith("Assets") ||
    n == "preBuild"
}.configureEach { dependsOn(injectBrushV2Index) }

dependencies {
    // Minimal AndroidX surface — just what the WebView shell needs.
    implementation(libs.androidx.core.ktx)
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.0")
    implementation("androidx.webkit:webkit:1.11.0")

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
}

// --- Google Play publishing (Triple-T Gradle Play Publisher) ----------------
run {
    val saJson = System.getenv("PLAY_SERVICE_ACCOUNT_JSON_FILE")
        ?: rootProject.file("play-service-account.json").takeIf { it.exists() }?.absolutePath
    play {
        if (saJson != null) {
            serviceAccountCredentials.set(file(saJson))
        } else {
            enabled.set(false)
        }
        track.set(System.getenv("PLAY_TRACK") ?: "internal")
        releaseStatus.set(com.github.triplet.gradle.androidpublisher.ReleaseStatus.COMPLETED)
    }
}
