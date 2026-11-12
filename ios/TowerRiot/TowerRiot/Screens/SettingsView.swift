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
                    Toggle2(label: "Calm motion", note: "No screen shake, screen flash, rain or crows. The lighthouse beam and breach warnings hold still.", on: st.reduceMotion) { v in app.setSetting { $0.reduceMotion = v } }
                    // Auto skills starts unset: on for the first region, then off. Showing it ticked matches what a new player gets first.
                    Toggle2(label: "Auto skill points", note: "Automatically spend Wren skill points on level up (default in Mosslight Vale).", on: st.autoSkills ?? true) { v in app.setSetting { $0.autoSkills = v } }
                    Toggle2(label: "Damage numbers", note: "Show the damage of big hits over foes.", on: st.dmgNumbers) { v in app.setSetting { $0.dmgNumbers = v } }
                    Toggle2(label: "Tap ground moves Wren (touch)", note: "Allow single ground taps to pin Wren (dragging Wren always works).", on: st.tapGroundMove) { v in app.setSetting { $0.tapGroundMove = v } }
                    Toggle2(label: "Tap-to-aim W (accessibility)", note: "Aim Lantern Snare with two taps instead of touch drag-and-release.", on: st.tapAimW) { v in app.setSetting { $0.tapAimW = v } }
                    Toggle2(label: "Auto-call next wave", note: "Start the next wave automatically when the field is clear.", on: st.autoNext) { v in app.setSetting { $0.autoNext = v } }
                    Toggle2(label: "Left-handed HUD", note: "Mirror the battle HUD controls to the left side for left-thumb reach.", on: st.leftHandHud) { v in app.setSetting { $0.leftHandHud = v } }
                    Text("How to play").font(Face.body(17, .heavy)).foregroundStyle(Ink.ink).padding(.top, 18).padding(.bottom, 6)
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach([
                            "Tap a stone plot to build (3x2 tower deck), clear rubble, or tap a switch lever to redirect roads/brakes.",
                            "Holding the phone upright? Drag the map left and right. Red notches at its edges point to foes out of view.",
                            "Drag Wren to pin her anywhere along the road (she fights inside a 90 px leash while holding 2 foes).",
                            "Wren gains XP and gold (+50% on last hits). Clear adjacent rubble free by standing Wren beside it.",
                            "Shop free at the Gate or between waves, or via +20% field courier during combat. Grab runes before they fade.",
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
