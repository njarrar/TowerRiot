import SwiftUI
import SpriteKit
import TowerRiotKit

/// Title: a still frame of a real fight on the next stage fills the screen; the menu sits on paper over its left side.
struct TitleView: View {
    @EnvironmentObject var app: AppModel
    @Environment(\.upright) private var upright
    @State private var scene: BattleScene?
    @State private var showGuide = false

    var body: some View {
        let c = app.save.cleared, next = app.nextStage
        let altTotal = app.save.totalAltStars
        ZStack(alignment: .topTrailing) {
            LinearGradient(colors: [Ink.skyTop, Ink.skyLow], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            if let scene {
                SpriteView(scene: scene, isPaused: true, options: [.ignoresSiblingOrder])
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }
            HStack {
                VStack(alignment: .leading, spacing: 0) {
                    Text("TowerRiot").font(Face.title(54, heavy: true)).foregroundStyle(Ink.ink).lineLimit(1).minimumScaleFactor(0.6)
                    Rectangle().fill(Ink.accent).frame(width: 48, height: 4).padding(.top, 4)
                    Text("Hold the Lantern Keep. Build towers, raise Wren from level 1 to 16 in every fight, and outthink a Hollow that learns.")
                        .font(Face.body(16)).foregroundStyle(Ink.inkDim).lineSpacing(3)
                        .frame(maxWidth: 340, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.vertical, 14)
                    if upright {
                        // Too narrow for three buttons in a row: Continue takes the width, two share the next row,
                        // and Settings is the gear in the corner.
                        VStack(spacing: 10) {
                            Button(c > 0 ? "Continue: stage \(next)" : "Play") { app.screen = .campaign(focus: nil) }
                                .buttonStyle(PaperButton(kind: .primary, big: true, fill: true))
                            HStack(spacing: 10) {
                                Button("Skill trees") { app.screen = .trees }.buttonStyle(PaperButton(big: true, fill: true))
                                Button("Field guide") { showGuide = true }.buttonStyle(PaperButton(big: true, fill: true))
                            }
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 10) {
                            Button(c > 0 ? "Continue: stage \(next)" : "Play") { app.screen = .campaign(focus: nil) }
                                .buttonStyle(PaperButton(kind: .primary, big: true))
                            HStack(spacing: 10) {
                                Button("Skill trees") { app.screen = .trees }.buttonStyle(PaperButton(big: true))
                                Button("Field guide") { showGuide = true }.buttonStyle(PaperButton(big: true))
                                Button("Settings") { app.screen = .settings }.buttonStyle(PaperButton(big: true))
                            }
                        }
                    }
                    Text("\(app.save.totalStars) of 60 stars won\(altTotal > 0 ? " · \(altTotal) Variant B" : "")").font(Face.body(13)).foregroundStyle(Ink.inkFaint).padding(.top, 12)
                }
                .padding(24)
                .background(Ink.paper)
                .overlay(Rectangle().fill(Ink.ink).frame(height: 3), alignment: .top)
                .overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(Ink.ruleStrong, lineWidth: 1))
                .shadow(color: Ink.shadow, radius: 20, y: 10)
                .padding(.leading, upright ? 16 : 40)
                .padding(.trailing, upright ? 16 : 0)
                Spacer(minLength: 0)
            }
            .frame(maxHeight: .infinity)
            HStack(spacing: 8) {
                if upright { SettingsCorner() }
                SoundCorner()
            }
            .padding(12)
        }
        .sheet(isPresented: $showGuide) { FieldGuideSheet() }
        .task { if scene == nil { await paintMap() } }
    }

    /// A still frame of a real fight: a few towers, Wren and the first foes on the road.
    @MainActor private func paintMap() async {
        try? await Task.sleep(nanoseconds: 30_000_000)
        var st = app.data.stage(app.nextStage)
        // Rain, night and lava stages make a murky backdrop; show the first stage of that region instead.
        if st.weather != nil || st.night == true || st.isLava { st = app.data.stages.first { $0.region == st.region } ?? st }
        let b = Battle(stage: st, mods: app.save.mods, seed: 7)
        b.setGold(99999)
        for i in 0..<min(4, b.plots.count) { _ = b.build(plot: i, kind: st.towers[i % st.towers.count]) }
        b.setGold(0)
        _ = b.callWave()
        for _ in 0..<260 where !b.over { b.step(0.05) }
        let s = BattleScene(battle: b)
        s.scaleMode = .aspectFill
        s.look.still = true
        s.look.reduceMotion = true
        s.renderStill()
        withAnimation(.easeOut(duration: 0.4)) { scene = s }
    }
}

/// The speaker in a menu corner: struck through when muted.
struct SoundCorner: View {
    @EnvironmentObject var app: AppModel
    var body: some View {
        let on = app.save.settings.sound
        IconButton(icon: on ? "sound" : "mute", label: on ? "Mute sound" : "Turn sound on", dim: !on) { app.toggleSound() }
    }
}

/// The gear in a menu corner: opens Settings when the menu has no room for a Settings button.
struct SettingsCorner: View {
    @EnvironmentObject var app: AppModel
    var body: some View {
        Button { app.screen = .settings } label: {
            Image(systemName: "gearshape").font(.system(size: 19, weight: .semibold)).foregroundStyle(Ink.ink)
                .frame(width: 44, height: 44)
                .background(RoundedRectangle(cornerRadius: 5).fill(Ink.paperGlass))
                .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(Ink.ruleStrong, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Settings")
    }
}

/// The bar across the top of the menu screens: back, a title, and what sits on the right.
struct TopBar<Trailing: View>: View {
    @Environment(\.upright) private var upright
    let title: String
    let back: () -> Void
    @ViewBuilder var trailing: Trailing
    var body: some View {
        if upright {
            // Too narrow for three parts on one line: the title drops to its own.
            VStack(spacing: 8) {
                HStack {
                    Button("Back", action: back).buttonStyle(PaperButton())
                    Spacer()
                    trailing
                }
                Text(title).font(Face.title(20)).foregroundStyle(Ink.ink).lineLimit(1).minimumScaleFactor(0.6)
            }
            .padding(.bottom, 10)
        } else {
            ZStack {
                Text(title).font(Face.title(24)).foregroundStyle(Ink.ink).lineLimit(1).minimumScaleFactor(0.6)
                HStack {
                    Button("Back", action: back).buttonStyle(PaperButton())
                    Spacer()
                    trailing
                }
            }
            .padding(.bottom, 12)
        }
    }
}
