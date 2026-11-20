// The rules of TowerRiot: game data, the battle engine and saves. Plain Kotlin, no Android,
// so the same code runs in the app and in tests on any machine.
plugins {
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.kotlin.plugin.serialization")
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    testImplementation(kotlin("test"))
    testImplementation("junit:junit:4.13.2")
}

tasks.test {
    useJUnit()
    testLogging { events("failed"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}

// One copy of the game data for every app: `npm run native:data` writes it next to the iOS engine,
// and the Kotlin engine reads the same files.
sourceSets {
    main { resources.srcDir("../../ios/TowerRiotKit/Sources/TowerRiotKit/Resources") }
    test { resources.srcDir("../../ios/TowerRiotKit/Tests/TowerRiotKitTests/Resources") }
}
