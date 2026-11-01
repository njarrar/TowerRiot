import SwiftUI
import TowerRiotKit

/// The campaign: each region is a strip of its own ground with a road through it; the stages are stops on the road.
struct CampaignView: View {
    @EnvironmentObject var app: AppModel
    let focus: Int?
    @State private var sel = 1

    var body: some View {
        let s = app.save
        VStack(spacing: 0) {
            TopBar(title: "The campaign", back: { app.screen = .title }) {
                HStack(spacing: 8) {
                    Button("Skill trees: \(s.embers.free) Embers") { app.screen = .trees }.buttonStyle(PaperButton())
                    SoundCorner()
                }
            }
            HStack(alignment: .top, spacing: 16) {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(spacing: 14) {
                            ForEach(Array(app.data.regions.enumerated()), id: \.offset) { ri, r in
                                RegionStrip(region: r, index: ri, sel: $sel).id(ri)
                            }
                        }
                    }
                    .onAppear {
                        // Open on the stage you came for: on a phone the cleared regions above would push it off screen.
                        proxy.scrollTo(app.data.stage(focus ?? app.nextStage).region, anchor: .center)
                    }
                }
                StageCard(id: sel)
                    .frame(width: 300)
            }
        }
        .padding(16)
        .onAppear { sel = focus ?? app.nextStage }
    }
}

private struct RegionStrip: View {
    @EnvironmentObject var app: AppModel
    let region: RegionDef
    let index: Int
    @Binding var sel: Int

    /// Ground, road and road edge colours per region, as the web campaign paints them.
    static let looks: [(g1: Color, g2: Color, road: Color, edge: Color)] = [
        (Color(hex: 0x7f9e58), Color(hex: 0x95b06a), Color(hex: 0xe1d3b0), Color(hex: 0xb9a77f)),
        (Color(hex: 0xcdbd8f), Color(hex: 0xdccea4), Color(hex: 0x9d8862), Color(hex: 0x85714f)),
        (Color(hex: 0x8c8d86), Color(hex: 0xa3a39b), Color(hex: 0xd2c6aa), Color(hex: 0xa89c82)),
        (Color(hex: 0x4f3a33), Color(hex: 0x67463a), Color(hex: 0x2a2220), Color(hex: 0xc8572a)),
    ]

    var body: some View {
        let own = app.data.stages.filter { $0.region == index }
        let sealed = !(own.first.map { app.save.isUnlocked($0.id) } ?? false)
        let look = Self.looks[min(index, Self.looks.count - 1)]
        let ys: [CGFloat] = [0.66, 0.34, 0.62, 0.30, 0.52]
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(region.name).font(Face.title(17)).foregroundStyle(sealed ? Ink.inkDim : Ink.ink)
                Text(sealed ? "Stages \(own.first?.id ?? 0) to \(own.last?.id ?? 0). Opens after stage \((own.first?.id ?? 1) - 1)." : region.rule)
                    .font(Face.body(13)).foregroundStyle(Ink.inkFaint).lineLimit(2)
            }
            .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 8)
            GeometryReader { g in
                let W = g.size.width, H = g.size.height
                let stops = own.indices.map { i in CGPoint(x: (0.09 + Double(i) * (0.82 / Double(max(1, own.count - 1)))) * W, y: ys[i % 5] * H) }
                ZStack(alignment: .topLeading) {
                    LinearGradient(colors: [look.g2, look.g1], startPoint: .topLeading, endPoint: .bottomTrailing)
                    road(stops, W: W, H: H).stroke(look.edge, style: StrokeStyle(lineWidth: 15, lineCap: .round))
                    road(stops, W: W, H: H).stroke(look.road, style: StrokeStyle(lineWidth: 11, lineCap: .round))
                    ForEach(Array(own.enumerated()), id: \.element.id) { i, st in
                        StageNode(stage: st, selected: sel == st.id) { sel = st.id }
                            .position(stops[i])
                    }
                }
            }
            .frame(height: 138)
            .saturation(sealed ? 0.35 : 1)
            .opacity(sealed ? 0.6 : 1)
        }
        .background(Ink.paper)
        .clipShape(RoundedRectangle(cornerRadius: 5))
        .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(Ink.rule, lineWidth: 1))
    }

    private func road(_ stops: [CGPoint], W: CGFloat, H: CGFloat) -> SwiftUI.Path {
        SwiftUI.Path { p in
            guard let first = stops.first, let last = stops.last else { return }
            p.move(to: CGPoint(x: -0.2 * W, y: first.y + 0.06 * H))
            p.addCurve(to: first, control1: CGPoint(x: 0, y: first.y + 0.06 * H), control2: CGPoint(x: first.x - 0.04 * W, y: first.y))
            for i in 1..<stops.count {
                let q = stops[i - 1], s = stops[i], mx = (q.x + s.x) / 2
                p.addCurve(to: s, control1: CGPoint(x: mx, y: q.y), control2: CGPoint(x: mx, y: s.y))
            }
            p.addCurve(to: CGPoint(x: 1.2 * W, y: last.y), control1: CGPoint(x: 1.04 * W, y: last.y), control2: CGPoint(x: 1.04 * W, y: last.y))
        }
    }
}

private struct StageNode: View {
    @EnvironmentObject var app: AppModel
    let stage: StageDef
    let selected: Bool
    let tap: () -> Void

    var body: some View {
        let open = app.save.isUnlocked(stage.id), best = app.save.stars[stage.id] ?? 0
        let isNext = open && best == 0, boss = stage.id % 5 == 0
        let fill: Color = !open ? Ink.paper2 : best > 0 ? Ink.ink : isNext ? Ink.accent : Ink.paper
        let fg: Color = best > 0 || isNext ? Ink.paper : Ink.ink
        Button(action: tap) {
            VStack(spacing: 2) {
                ZStack {
                    let shape = RoundedRectangle(cornerRadius: boss ? 6 : 16)
                    shape.fill(fill).frame(width: 32, height: 32)
                    shape.strokeBorder(best > 0 ? Ink.ink : isNext ? Ink.accentLo : open ? Ink.inkDim : Ink.ruleStrong, lineWidth: 2).frame(width: 32, height: 32)
                    if open { Text("\(stage.id)").font(Face.body(15, .heavy)).foregroundStyle(fg) }
                    else { ArtIcon(name: "lock", size: 14).foregroundStyle(Ink.inkFaint) }
                }
                .padding(3)
                .overlay(RoundedRectangle(cornerRadius: boss ? 8 : 19).strokeBorder(selected ? Ink.ink : .clear, lineWidth: 2))
                Text(stage.name).font(Face.body(12, .bold)).lineLimit(1).fixedSize()
                    .foregroundStyle(selected ? Ink.paper : open ? Ink.ink : Ink.inkFaint)
                    .padding(.horizontal, 8).padding(.vertical, 1)
                    .background(Capsule().fill(selected ? Ink.ink : Ink.paperGlass))
                if best > 0 {
                    Text(String(repeating: "★", count: best)).font(.system(size: 11)).foregroundStyle(Ink.gold)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Stage \(stage.id), \(stage.name)\(open ? "" : ", locked")")
    }
}

private struct StageCard: View {
    @EnvironmentObject var app: AppModel
    let id: Int

    var body: some View {
        let st = app.data.stage(id), open = app.save.isUnlocked(id), best = app.save.stars[id] ?? 0
        let newFoe = app.data.enemies.values.first { $0.name.lowercased() == st.newFoe.lowercased() }
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text(st.name).font(Face.title(26)).foregroundStyle(Ink.ink).fixedSize(horizontal: false, vertical: true)
                Text("Stage \(st.id), \(app.data.regions[st.region].name)").font(Face.body(14, .semibold)).foregroundStyle(Ink.inkDim)
                Stars(n: best, size: 20)
                Text(st.twist).font(Face.body(14)).foregroundStyle(Ink.inkDim).fixedSize(horizontal: false, vertical: true)
                Divider().overlay(Ink.rule)
                Fact("New foe", newFoe.map { "\($0.name): \($0.blurb)" } ?? st.newFoe)
                Fact("Unlocks", st.unlocks)
                HStack(alignment: .top) {
                    Text("Towers").font(Face.body(13)).foregroundStyle(Ink.inkFaint).frame(width: 64, alignment: .leading)
                    HStack(spacing: 2) { ForEach(st.towers, id: \.self) { k in ArtPicture(name: "icon-tower-\(k.rawValue)", size: 32).accessibilityLabel(app.data.tower(k).name) } }
                }
                Fact("Waves", "\(st.waves.count), starting gold \(st.startGold)")
                Fact("Stars", starRule(st.lives + app.save.mods.lives))
                if open {
                    Button(best > 0 ? "Play again" : "Start") { app.play(id) }
                        .buttonStyle(PaperButton(kind: .primary, big: true))
                        .frame(maxWidth: .infinity)
                        .padding(.top, 6)
                } else {
                    Text("Clear the stage before it to open this one.").font(Face.body(13)).foregroundStyle(Ink.inkFaint)
                }
            }
            .padding(16)
        }
        .background(RoundedRectangle(cornerRadius: 9).fill(Ink.paper2))
        .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(Ink.rule, lineWidth: 1))
    }
}

private struct Fact: View {
    let label: String, value: String
    init(_ label: String, _ value: String) { self.label = label; self.value = value }
    var body: some View {
        HStack(alignment: .top) {
            Text(label).font(Face.body(13)).foregroundStyle(Ink.inkFaint).frame(width: 64, alignment: .leading)
            Text(value).font(Face.body(13)).foregroundStyle(Ink.ink).fixedSize(horizontal: false, vertical: true)
        }
    }
}
