// swift-tools-version:5.9
import PackageDescription

// The rules of TowerRiot: game data, the battle engine, saves and the ground painter.
// Pure Swift with Foundation only, so it builds and tests on macOS and Linux alike.
let package = Package(
    name: "TowerRiotKit",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [.library(name: "TowerRiotKit", targets: ["TowerRiotKit"])],
    targets: [
        .target(name: "TowerRiotKit", resources: [.copy("Resources/game-data.json")]),
        .testTarget(name: "TowerRiotKitTests", dependencies: ["TowerRiotKit"], resources: [.copy("Resources/bot-results.json")]),
    ]
)
