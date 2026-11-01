import SwiftUI
import TowerRiotKit

struct SettingsView: View {
    @EnvironmentObject var app: AppModel
    @State private var askErase = false

    var body: some View {
        let st = app.save.settings
        VStack(spacing: 0) {
            TopBar(title: "Settings", back: { app.screen = .title }) { EmptyView() }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Toggle2(label: "Sound", note: "Tower fire, hits and Wren. Mute it any time with the speaker button.", on: st.sound) { v in app.setSetting { $0.sound = v } }
                    Toggle2(label: "Calm motion", note: "No screen shake, crows or drifting light.", on: st.reduceMotion) { v in app.setSetting { $0.reduceMotion = v } }
                    // Auto skills starts unset: on for the first region, then off. Showing it ticked matches what a new player gets first.
                    Toggle2(label: "Auto skill points", note: "Spend Wren's points for you as she levels. On by default in Mosslight Vale.", on: st.autoSkills ?? true) { v in app.setSetting { $0.autoSkills = v } }
                    Toggle2(label: "Damage numbers", note: "Show the damage of big hits over foes.", on: st.dmgNumbers) { v in app.setSetting { $0.dmgNumbers = v } }
                    Text("How to play").font(Face.body(17, .heavy)).foregroundStyle(Ink.ink).padding(.top, 18).padding(.bottom, 6)
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach([
                            "Tap a stone plot to build. Tap a tower to upgrade, split, aim or sell it.",
                            "Tap the ground to move Wren. She holds that spot and blocks up to two foes. Tap a foe to send her after it.",
                            "Wren gains levels inside each stage. Spend points on Q, W, E and R. Landing the killing blow pays 50% more gold.",
                            "Walk her to the gate to shop. Grab runes when they glow on the map.",
                        ], id: \.self) { line in
                            HStack(alignment: .top, spacing: 8) {
                                Text("•").foregroundStyle(Ink.inkDim)
                                Text(line).foregroundStyle(Ink.inkDim).fixedSize(horizontal: false, vertical: true)
                            }
                            .font(Face.body(14))
                        }
                    }
                    // Two steps on the page itself, not a system dialog.
                    VStack(alignment: .leading, spacing: 10) {
                        if askErase {
                            Text("Erase all stars and tree picks? This cannot be undone.").font(Face.body(14, .semibold)).foregroundStyle(Ink.ink)
                            HStack(spacing: 10) {
                                Button("Erase") { app.eraseProgress() }.buttonStyle(PaperButton(kind: .dangerSolid))
                                Button("Cancel") { askErase = false }.buttonStyle(PaperButton())
                            }
                        } else {
                            Button("Erase progress") { askErase = true }.buttonStyle(PaperButton(kind: .danger))
                        }
                    }
                    .padding(.top, 18)
                }
                .padding(18)
                .frame(maxWidth: 620)
                .paperCard(radius: 9)
                .frame(maxWidth: .infinity)
            }
        }
        .padding(16)
    }
}

/// A setting with a short note under it, ticked with the rust accent.
private struct Toggle2: View {
    let label: String
    let note: String
    let on: Bool
    let set: (Bool) -> Void
    var body: some View {
        Button { set(!on) } label: {
            HStack(alignment: .top, spacing: 12) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(on ? Ink.accent : Ink.paper)
                    .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(on ? Ink.accentLo : Ink.ruleStrong, lineWidth: 1.5))
                    .overlay(Image(systemName: "checkmark").font(.system(size: 12, weight: .heavy)).foregroundStyle(Ink.accentInk).opacity(on ? 1 : 0))
                    .frame(width: 22, height: 22)
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(Face.body(15, .heavy)).foregroundStyle(Ink.ink)
                    Text(note).font(Face.body(13)).foregroundStyle(Ink.inkFaint).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 10)
            .overlay(Rectangle().fill(Ink.rule).frame(height: 1), alignment: .bottom)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
