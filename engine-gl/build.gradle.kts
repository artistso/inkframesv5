// OpenGL ES 3.0 paint engine. Android library (depends on the framework Context for
// surface/asset access) but contains no Compose. GLSL shaders live under
// src/main/assets/shaders and are merged into the APK automatically; they are loaded
// at runtime via Context.readAsset("shaders/...").
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.inkframe.engine.gl"
    compileSdk = 34

    defaultConfig {
        minSdk = 26
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    buildFeatures { compose = false }

    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }
}

dependencies {
    implementation(project(":core-common"))
    implementation(project(":core-model"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.kotlin.stdlib)
    testImplementation(libs.junit)   // engine unit tests are plain JVM (no device)
}
