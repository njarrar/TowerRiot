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
        ZStack {
            Ink.paper.ignoresSafeArea()
            switch app.screen {
            case .title: TitleView()
            case .campaign(let focus): CampaignView(focus: focus)
            case .trees: TreesView()
            case .settings: SettingsView()
            case .battle(let id): BattleView(stageId: id).id(app.battleRun)
            }
        }
        .tint(Ink.accent)
    }
}
