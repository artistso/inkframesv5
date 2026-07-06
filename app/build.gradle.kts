import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.play.publisher)
}

// --- Versioning ------------------------------------------------------------
// Base marketing version. The integer versionCode that Play requires to increase on
// every upload is derived automatically: in CI it uses the build/run number (offset by
// a base so it always climbs), and locally it stays at 1 for convenience. Override the
// CI number with INKFRAME_VERSION_CODE if you ever need an explicit value.
val baseVersionName = "0.1.0"
val versionCodeBase = 1            // bump only for intentional baseline resets
val resolvedVersionCode: Int = run {
    System.getenv("INKFRAME_VERSION_CODE")?.toIntOrNull()?.let { return@run it }
    val ci = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull()
    if (ci != null) versionCodeBase + ci else versionCodeBase
}

// --- Release signing -------------------------------------------------------
// Credentials come from one of two places, in priority order:
//   1. A local `keystore.properties` (git-ignored) next to the project root.
//   2. Environment variables (used by CI):
//        INKFRAME_KEYSTORE       absolute path to the .jks
//        INKFRAME_KEYSTORE_PASSWORD, INKFRAME_KEY_ALIAS, INKFRAME_KEY_PASSWORD
// If neither is configured, release builds fall back to the debug signing key so
// they still assemble (handy for unsigned CI artifacts / local smoke tests).
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
    compileSdk = 34

    defaultConfig {
        applicationId = "com.inkframe.studio"
        minSdk = 26          // Android 8.0 — tablet/stylus-first
        targetSdk = 34
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
            isMinifyEnabled = true
            isShrinkResources = true      // drop unused resources for a smaller APK
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Use the real release key when configured; otherwise fall back to debug so
            // the build still produces an installable (debug-signed) artifact.
            signingConfig = if (hasReleaseSigning) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
        debug {
            isMinifyEnabled = false       // fast iteration; no shrinking on debug
            applicationIdSuffix = ".debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    buildFeatures { compose = true }

    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }
}

dependencies {
    implementation(project(":core-common"))
    implementation(project(":core-model"))
    implementation(project(":engine-gl"))
    implementation(project(":feature-canvas"))
    implementation(project(":feature-layers"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.coroutines.android)
    debugImplementation(libs.compose.ui.tooling)

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
}

// --- Google Play publishing (Triple-T Gradle Play Publisher) ----------------
// Uploads the signed .aab to a Play track via the `publishReleaseBundle` task. The
// service-account JSON is supplied by CI through PLAY_SERVICE_ACCOUNT_JSON_FILE (a path
// written by the workflow) or a local `play-service-account.json` (git-ignored). When
// neither is present the plugin is disabled so ordinary builds are unaffected.
run {
    val saJson = System.getenv("PLAY_SERVICE_ACCOUNT_JSON_FILE")
        ?: rootProject.file("play-service-account.json").takeIf { it.exists() }?.absolutePath
    play {
        if (saJson != null) {
            serviceAccountCredentials.set(file(saJson))
        } else {
            // No credentials -> don't wire publishing into this build.
            enabled.set(false)
        }
        // Default to the internal testing track for fast on-device iteration.
        track.set(System.getenv("PLAY_TRACK") ?: "internal")
        // Treat uploads as completed releases (use a fraction for staged rollouts).
        releaseStatus.set(com.github.triplet.gradle.androidpublisher.ReleaseStatus.COMPLETED)
    }
}
