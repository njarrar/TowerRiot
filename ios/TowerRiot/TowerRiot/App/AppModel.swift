import SwiftUI
import TowerRiotKit

/// Screens and flow: title, campaign map, skill trees, settings and the battle. A port of src/ui/app.ts.
final class AppModel: ObservableObject {
    enum Screen: Equatable { case title, campaign(focus: Int?), trees, settings, battle(Int) }

    @Published var screen: Screen = .title
    @Published private(set) var save: Save
    @Published var treeTab = 0
    /// Bumped for every new fight, so Try again on the same stage starts fresh.
    @Published private(set) var battleRun = 0
    let sound = Sound()
    let data = GameData.shared
    private let store: SaveStore = FileSaveStore.standard()

    init() {
        save = Save.load(from: store)
        sound.enabled = save.settings.sound
        AppHolder.shared = self
    }

    private func persist() { save.write(to: store) }

    /// Sound on or off, from any screen. The choice lives in the save, so it holds next time.
    @discardableResult
    func toggleSound() -> Bool {
        save.settings.sound.toggle()
        applySettings()
        if save.settings.sound { sound.play(.click) }
        return save.settings.sound
    }

    func setSetting(_ change: (inout Save.Settings) -> Void) {
        change(&save.settings)
        applySettings()
    }

    private func applySettings() {
        sound.enabled = save.settings.sound
        persist()
    }

    func buyNode(_ id: String) {
        if save.buyNode(id) { persist(); sound.play(.level) }
    }

    func resetTrees() { save.resetTrees(); persist() }

    func eraseProgress() { save = Save(); persist(); sound.enabled = save.settings.sound; screen = .title }

    /// Record a win. Returns the Embers it earned.
    func record(stage: Int, stars: Int) -> Int {
        let got = save.record(stage: stage, stars: stars)
        save.seenIntro = true
        persist()
        return got
    }

    func play(_ id: Int) { battleRun += 1; screen = .battle(id) }

    /// The stage after the last one cleared, for Continue.
    var nextStage: Int { min(20, save.cleared + 1) }

    /// Auto skill points start unset: on in the first region, off after it.
    func autoSkills(for stage: Int) -> Bool { save.settings.autoSkills ?? (data.stage(stage).region == 0) }
}

/// How stars are won, in words: lives kept out of the lives you start with.
func starRule(_ start: Int) -> String {
    let n = starLives(start), lose = start - n.three
    return "3 if you lose \(lose) \(lose == 1 ? "life" : "lives") or fewer, 2 if you keep \(n.two) of \(start)."
}
