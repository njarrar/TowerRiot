import SwiftUI

@main
struct TowerRiotApp: App {
    @StateObject private var app = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .preferredColorScheme(.light)
                .persistentSystemOverlays(.hidden)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var app: AppModel

    var body: some View {
        GeometryReader { g in
            ZStack {
                Ink.paper.ignoresSafeArea()
                switch app.screen {
                case .title: TitleView()
                case .campaign(let focus): CampaignView(focus: focus)
                case .trees: TreesView()
                case .settings: SettingsView()
                case let .battle(id, variant, oaths): BattleView(stageId: id, variant: variant, oaths: oaths).id(app.battleRun)
                }
            }
            .environment(\.upright, g.size.height > g.size.width * 1.15 && g.size.width < 760)
        }
        .tint(Ink.accent)
    }
}

/// A phone held upright: menus stack instead of sitting side by side, and the battle map slides sideways.
private struct UprightKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    var upright: Bool {
        get { self[UprightKey.self] }
        set { self[UprightKey.self] = newValue }
    }
}
