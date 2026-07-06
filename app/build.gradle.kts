import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.play.publisher)
}

val webMetadataFile = rootProject.file("web/metadata.json")
fun webMetadataString(key: String): String? =
    Regex("\\\"$key\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"")
        .find(webMetadataFile.takeIf { it.exists() }?.readText() ?: "")
        ?.groupValues?.getOrNull(1)
fun webMetadataInt(key: String): Int? =
    Regex("\\\"$key\\\"\\s*:\\s*(\\d+)")
        .find(webMetadataFile.takeIf { it.exists() }?.readText() ?: "")
        ?.groupValues?.getOrNull(1)?.toIntOrNull()

val baseVersionName = webMetadataString("version") ?: "0.1.0"
val metadataTargetSdk = webMetadataInt("targetSdk") ?: 35
val metadataMinSdk = webMetadataInt("minSdk") ?: 26
val versionCodeBase = 1
val resolvedVersionCode: Int = run {
    System.getenv("INKFRAME_VERSION_CODE")?.toIntOrNull()?.let { return@run it }
    val ci = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull()
    if (ci != null) versionCodeBase + ci else versionCodeBase
}

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
            applicationIdSuffix = ".debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // Kotlin 1.9.x enables Compose via the compiler extension
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    buildFeatures { compose = true }

    sourceSets {
        getByName("main") {
            assets.srcDir(layout.buildDirectory.dir("generated/webAssets"))
        }
    }

    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }
}

val stageWebAssets by tasks.registering(Copy::class) {
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
    }
    into(layout.buildDirectory.dir("generated/webAssets"))
}

tasks.matching {
    val n = it.name
    n.startsWith("merge") && n.endsWith("Assets") ||
    n.startsWith("package") && n.endsWith("Assets") ||
    n.startsWith("generate") && n.endsWith("Assets") ||
    n == "preBuild"
}.configureEach { dependsOn(stageWebAssets) }

dependencies {
    implementation(project(":feature-canvas"))
    implementation(project(":engine-gl"))
    implementation(project(":core-model"))
    implementation(project(":core-common"))

    implementation(libs.androidx.core.ktx)
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.0")

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.androidx.activity.compose)

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
}

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
