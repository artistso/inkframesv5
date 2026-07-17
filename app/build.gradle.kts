import java.security.MessageDigest
import java.util.Base64
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.play.publisher)
}

// --- Native Android application metadata -----------------------------------
val appMetadataFile = rootProject.file("gradle/inkframe-app.properties")
val appMetadata = Properties().apply {
    require(appMetadataFile.isFile) {
        "Missing native Android metadata: ${appMetadataFile.absolutePath}"
    }
    appMetadataFile.inputStream().use(::load)
}

fun appMetadataString(key: String): String =
    appMetadata.getProperty(key)?.trim()?.takeIf(String::isNotEmpty)
        ?: error("Missing '$key' in ${appMetadataFile.path}")

fun appMetadataInt(key: String): Int =
    appMetadataString(key).toIntOrNull()
        ?: error("'$key' must be an integer in ${appMetadataFile.path}")

val resolvedVersionCode =
    System.getenv("INKFRAME_VERSION_CODE")?.toIntOrNull()
        ?: appMetadataInt("versionCode")

// --- Release signing -------------------------------------------------------
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use(::load)
}

fun signingValue(propKey: String, envKey: String): String? =
    (keystoreProps.getProperty(propKey) ?: System.getenv(envKey))?.takeIf { it.isNotBlank() }

val releaseStorePath = signingValue("storeFile", "INKFRAME_KEYSTORE")
val releaseStorePassword = signingValue("storePassword", "INKFRAME_KEYSTORE_PASSWORD")
val releaseKeyAlias = signingValue("keyAlias", "INKFRAME_KEY_ALIAS")
val releaseKeyPassword = signingValue("keyPassword", "INKFRAME_KEY_PASSWORD")
val releaseStoreFile = releaseStorePath?.let(::file)
val hasReleaseSigning =
    releaseStoreFile?.isFile == true &&
        !releaseStorePassword.isNullOrBlank() &&
        !releaseKeyAlias.isNullOrBlank() &&
        !releaseKeyPassword.isNullOrBlank()

// --- Glass Horizon generated branding ------------------------------------
val brandingSourceDir = rootProject.file("app/src/main/branding")
val generatedBrandingResDir = layout.buildDirectory.dir("generated/brandingRes")
val brandingAssets = listOf(
    listOf(
        "glass_horizon_icon.webp.b64",
        "mipmap-xxxhdpi/ic_launcher_glass_horizon.webp",
        "265ec40a596d912a4372c75690e1d2911fa5513c916022119569f4986c789ad4",
    ),
    listOf(
        "glass_horizon_splash.webp.b64",
        "drawable-nodpi/inkframe_splash.webp",
        "15fe71cfac141bcd1b8121c3aa257f11f3d527dc55027bef3f2ba35b58655327",
    ),
)

val generateBrandingResources = tasks.register("generateBrandingResources") {
    val sourceFiles = brandingAssets.map { asset -> brandingSourceDir.resolve(asset[0]) }
    inputs.files(sourceFiles)
    outputs.dir(generatedBrandingResDir)

    doLast {
        val outputRoot = generatedBrandingResDir.get().asFile
        outputRoot.deleteRecursively()

        brandingAssets.forEach { asset ->
            val (sourceName, outputPath, expectedSha256) = asset
            val source = brandingSourceDir.resolve(sourceName)
            require(source.isFile) { "Missing branding source: ${source.absolutePath}" }

            val encoded = source.readText(Charsets.US_ASCII).filterNot(Char::isWhitespace)
            val bytes = Base64.getDecoder().decode(encoded)
            require(bytes.size >= 12) { "Branding asset is too small: $sourceName" }
            require(String(bytes, 0, 4, Charsets.US_ASCII) == "RIFF") {
                "Branding asset is not a RIFF container: $sourceName"
            }
            require(String(bytes, 8, 4, Charsets.US_ASCII) == "WEBP") {
                "Branding asset is not WebP: $sourceName"
            }

            val actualSha256 = MessageDigest.getInstance("SHA-256")
                .digest(bytes)
                .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
            require(actualSha256 == expectedSha256) {
                "Branding digest mismatch for $sourceName: $actualSha256"
            }

            val target = outputRoot.resolve(outputPath)
            target.parentFile.mkdirs()
            target.writeBytes(bytes)
        }
    }
}

android {
    namespace = "com.inkframe.studio"
    compileSdk = appMetadataInt("targetSdk")

    defaultConfig {
        applicationId = appMetadataString("applicationId")
        minSdk = appMetadataInt("minSdk")
        targetSdk = appMetadataInt("targetSdk")
        versionCode = resolvedVersionCode
        versionName = appMetadataString("versionName")
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
            isMinifyEnabled = false
            isShrinkResources = false
            if (hasReleaseSigning) signingConfig = signingConfigs.getByName("release")
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    buildFeatures { compose = true }
    composeOptions { kotlinCompilerExtensionVersion = "1.5.14" }

    sourceSets {
        getByName("main") {
            res.srcDir(generatedBrandingResDir)
        }
    }

    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }
}

tasks.matching {
    val name = it.name
    name == "preBuild" ||
        (name.startsWith("pre") && name.endsWith("Build")) ||
        (name.startsWith("merge") && name.endsWith("Resources"))
}.configureEach { dependsOn(generateBrandingResources) }

// Release artifacts must always use the permanent InkFrame signing lineage.
gradle.taskGraph.whenReady {
    val releasePackagingRequested = allTasks.any { task ->
        task.project == project && task.name.matches(
            Regex("(assembleRelease|bundleRelease|packageRelease|signReleaseBundle|publishRelease.*)"),
        )
    }
    if (releasePackagingRequested && !hasReleaseSigning) {
        throw GradleException(
            "Release signing is required. Configure INKFRAME_KEYSTORE, " +
                "INKFRAME_KEYSTORE_PASSWORD, INKFRAME_KEY_ALIAS, and " +
                "INKFRAME_KEY_PASSWORD (or keystore.properties).",
        )
    }
}

dependencies {
    implementation(project(":feature-canvas"))
    implementation(project(":core-model"))

    implementation(libs.androidx.core.ktx)
    implementation("androidx.activity:activity-ktx:1.9.0")
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    debugImplementation(libs.compose.ui.tooling)

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
