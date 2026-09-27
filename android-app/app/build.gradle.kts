import java.util.Properties

plugins {
    id("com.android.application")
}

val localSettings = Properties()
val localSettingsFile = rootProject.file("local.properties")
if (localSettingsFile.exists()) {
    localSettingsFile.inputStream().use { localSettings.load(it) }
}
val publicBuild = providers.gradleProperty("xiaolu.publicBuild").orNull == "true"
val defaultBaseUrl = if (publicBuild) "" else localSettings.getProperty("xiaolu.baseUrl", "")
val programmingUrl = if (publicBuild) "" else localSettings.getProperty("xiaolu.programmingUrl", "")
require(programmingUrl.isEmpty() || programmingUrl.matches(Regex("https://antigravity\\.google\\.com/r/[A-Za-z0-9-]+"))) {
    "xiaolu.programmingUrl must be an Antigravity HTTPS remote page"
}
require(defaultBaseUrl.isEmpty() || defaultBaseUrl.matches(Regex("https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?"))) {
    "xiaolu.baseUrl in local.properties must be a Tailscale HTTPS address"
}

android {
    namespace = "dev.xiaolu.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.xiaolu.mobile"
        minSdk = 26
        targetSdk = 36
        versionCode = 100
        versionName = "1.0.0"
        buildConfigField("String", "DEFAULT_BASE_URL", "\"$defaultBaseUrl\"")
        buildConfigField("String", "PROGRAMMING_URL", "\"$programmingUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
