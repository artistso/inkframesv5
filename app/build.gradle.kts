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
val releaseStorePassword = signingValue("storePassword", "INKFRAME_KEYSTORE_PASSWORD")
val releaseKeyAlias = signingValue("keyAlias", "INKFRAME_KEY_ALIAS")
val releaseKeyPassword = signingValue("keyPassword", "INKFRAME_KEY_PASSWORD")
val releaseStoreFile = releaseStorePath?.let { file(it) }
val hasReleaseSigning =
    releaseStoreFile?.isFile == true &&
        !releaseStorePassword.isNullOrBlank() &&
        !releaseKeyAlias.isNullOrBlank() &&
        !releaseKeyPassword.isNullOrBlank()

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
                storeFile = releaseStoreFile
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            // The WebView shell has no meaningful Kotlin surface to shrink, and
            // R8 can break JavaScript bridge reachability. Keep release explicit.
            isMinifyEnabled = false
            isShrinkResources = false
            if (hasReleaseSigning) signingConfig = signingConfigs.getByName("release")
        }
        debug {
            isMinifyEnabled = false
            // Debug keeps the canonical package name so RC APKs replace earlier
            // test builds cleanly on the tablet.
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // Debug and release receive independently generated web asset roots. This
    // prevents a release build from reusing a debug index containing telemetry.
    sourceSets {
        getByName("debug") {
            assets.srcDir(layout.buildDirectory.dir("generated/webAssets/debug"))
        }
        getByName("release") {
            assets.srcDir(layout.buildDirectory.dir("generated/webAssets/release"))
        }
    }

    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }
}

fun registerWebAssetPipeline(
    variantName: String,
    diagnostics: Boolean,
    defaultEngine: String,
) {
    val capitalized = variantName.replaceFirstChar { character ->
        if (character.isLowerCase()) character.titlecase() else character.toString()
    }
    val outputDir = layout.buildDirectory.dir("generated/webAssets/$variantName")
    val stageTask = tasks.register<Copy>("stage${capitalized}WebAssets") {
        val webDir = rootProject.file("web")
        from(webDir) {
            include(
                "index.html",
                "**/*.js", "**/*.css",
                "**/*.png", "**/*.jpg", "**/*.jpeg", "**/*.gif", "**/*.webp", "**/*.svg",
                "**/*.mp3", "**/*.wav", "**/*.mp4",
                "**/*.woff", "**/*.woff2", "**/*.ttf", "**/*.otf",
                "**/*.webmanifest", "manifest.json", "metadata.json", "sw.js",
            )
            exclude(
                "package.json", "package-lock.json", "yarn.lock",
                "vite.config.js",
                "node_modules/**", "dist/**",
            )
            if (!diagnostics) {
                exclude("brush-engine-v2/native.js")
            }
        }
        into(outputDir)
    }

    val injectTask = tasks.register<Exec>("injectBrushV2${capitalized}Index") {
        dependsOn(stageTask)
        val injector = rootProject.file("tools/inject-brush-v2-index.mjs")
        val sourceIndex = rootProject.file("web/index.html")
        val targetIndex = outputDir.map { it.file("index.html") }
        inputs.files(injector, sourceIndex)
        inputs.property("variantName", variantName)
        inputs.property("diagnostics", diagnostics)
        inputs.property("defaultEngine", defaultEngine)
        outputs.file(targetIndex)
        workingDir(rootProject.projectDir)
        commandLine(
            "node",
            injector.absolutePath,
            sourceIndex.absolutePath,
            targetIndex.get().asFile.absolutePath,
            "--variant=$variantName",
            "--diagnostics=$diagnostics",
            "--default-engine=$defaultEngine",
        )
    }

    tasks.matching {
        val name = it.name
        name == "pre${capitalized}Build" ||
            name == "merge${capitalized}Assets" ||
            name == "package${capitalized}Assets" ||
            name == "generate${capitalized}Assets"
    }.configureEach { dependsOn(injectTask) }
}

registerWebAssetPipeline(
    variantName = "debug",
    diagnostics = true,
    defaultEngine = "v2",
)
registerWebAssetPipeline(
    variantName = "release",
    diagnostics = false,
    defaultEngine = "v2",
)

// Never silently produce a release artifact with the Android debug certificate.
// Debug builds and JVM tests remain secret-free; packaging release APK/AAB files
// requires a complete keystore configuration.
gradle.taskGraph.whenReady {
    val releasePackagingRequested = allTasks.any { task ->
        task.project == project && task.name.matches(
            Regex("(assembleRelease|bundleRelease|packageRelease|signReleaseBundle|publishRelease.*)")
        )
    }
    if (releasePackagingRequested && !hasReleaseSigning) {
        throw GradleException(
            "Release signing is required. Configure INKFRAME_KEYSTORE, " +
                "INKFRAME_KEYSTORE_PASSWORD, INKFRAME_KEY_ALIAS, and " +
                "INKFRAME_KEY_PASSWORD (or keystore.properties)."
        )
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.0")
    implementation("androidx.webkit:webkit:1.11.0")

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
}

// --- Google Play publishing (Triple-T Gradle Play Publisher) --------------
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
