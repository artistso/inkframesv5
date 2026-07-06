pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "InkFrame"

include(":app")
include(":core-common")
include(":core-model")
include(":engine-gl")
include(":feature-canvas")
include(":feature-timeline")
include(":feature-layers")
