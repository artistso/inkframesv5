import java.security.MessageDigest
import java.util.Base64
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.play.publisher)
}

// --- Shared app metadata ---------------------------------------------------
val webMetadataFile = rootProject.file("web/metadata.json")
fun webMetadataString(key: String): String? =
    Regex("\"$key\"[ ]*:[ ]*\"([^\"]+)\"")
        .find(webMetadataFile.takeIf { it.exists() }?.readText() ?: "")
        ?.groupValues?.getOrNull(1)
fun webMetadataInt(key: String): Int? =
    Regex("\"$key\"[ ]*:[ ]*([0-9]+)")
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

            val encoded = source.readText(Charsets.US_ASCII)
                .filterNot { character -> character.isWhitespace() }
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
            logger.lifecycle("Generated InkFrame branding resource: ${target.relativeTo(outputRoot)}")
        }
    }
}

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

    sourceSets {
        getByName("main") {
            res.srcDir(generatedBrandingResDir)
        }
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

// Resource merging must never race the branding decoder.
tasks.matching {
    val name = it.name
    name == "preBuild" ||
        (name.startsWith("pre") && name.endsWith("Build")) ||
        (name.startsWith("merge") && name.endsWith("Resources"))
}.configureEach { dependsOn(generateBrandingResources) }

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
        val indexInjectorInputs = files(
            injector,
            rootProject.file("tools/inject-canvas-shape.mjs"),
            rootProject.file("tools/inject-onion-skin-studio.mjs"),
        )
        val sourceIndex = rootProject.file("web/index.html")
        val targetIndex = outputDir.map { it.file("index.html") }
        inputs.files(indexInjectorInputs, sourceIndex)
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
