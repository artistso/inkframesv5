import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.play.publisher)
}

// --- Shared app metadata ---------------------------------------------------
// web/metadata.json still carries the shared version/package metadata while the
// Android runtime moves native. Keep parsing dependency-free so Gradle
// configuration stays fast and works before any app dependencies exist.
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
            // Keep shrinking off for the first native milestone while the Compose/GL
            // app is being reconnected and parity-tested.
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
            // Debug remains the primary sideload artifact during the native Android
            // switchover. Keep the canonical package name.
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    buildFeatures { compose = true }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }
}

dependencies {
    implementation(project(":feature-canvas"))

    implementation(libs.androidx.core.ktx)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.androidx.activity.compose)

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
