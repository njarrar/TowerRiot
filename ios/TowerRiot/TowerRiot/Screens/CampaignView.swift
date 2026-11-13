import SwiftUI
import TowerRiotKit

private let OATH_DEFS: [(id: OathId, name: String, desc: String)] = [
    (.twinRifts, "Twin Rifts", "Every road is live from wave 1, and every foe is 15% tougher."),
    (.shiftingEarth, "Shifting Earth", "Two plots sink mid-battle and their towers refund only half. Tides, lava and steam hold roads shut for 40% less time."),
    (.longNight, "Long Night", "Night never lifts. Hidden foes only show in light."),
]

private let RELIC_DEFS: [(stage: Int, name: String, bonus: String)] = [
    (5, "Mire Crown", "+10% tower damage"),
    (10, "Tide Pearl", "+15% tower range near water"),
    (15, "Brass Heart", "+1 Wren starting skill point"),
    (20, "Ash Sigil", "+10% tower damage"),
]

/// The campaign: each region is a strip of its own ground with a road through it; the stages are stops on the road.
struct CampaignView: View {
    @EnvironmentObject var app: AppModel
    @Environment(\.upright) private var upright
    let focus: Int?
    @State private var sel = 1
    @State private var showGuide = false

    var body: some View {
        let s = app.save
        VStack(spacing: 0) {
            if upright {
                // Back, the title and sound on one row; the two links share the row under it in equal halves.
                VStack(spacing: 8) {
                    HStack(spacing: 8) {
                        Button("Back") { app.screen = .title }.buttonStyle(PaperButton(tall: true))
                        Text("The campaign").font(Face.title(20)).foregroundStyle(Ink.ink).lineLimit(1).minimumScaleFactor(0.6)
                            .frame(maxWidth: .infinity)
                        SoundCorner()
                    }
                    HStack(spacing: 8) {
                        Button("Field guide") { showGuide = true }.buttonStyle(PaperButton(tall: true, fill: true))
                        Button("Skill trees: \(s.embers.free) Embers") { app.screen = .trees }.buttonStyle(PaperButton(tall: true, fill: true))
                    }
                }
                .padding(.bottom, 10)
            } else {
                TopBar(title: "The campaign", back: { app.screen = .title }) {
                    HStack(spacing: 8) {
                        Button("Field guide") { showGuide = true }.buttonStyle(PaperButton(tall: true))
                        Button("Skill trees: \(s.embers.free) Embers") { app.screen = .trees }.buttonStyle(PaperButton(tall: true))
                        SoundCorner()
                    }
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    Text("Boss Relics:").font(Face.body(12, .bold)).foregroundStyle(Ink.inkDim)
                    ForEach(RELIC_DEFS, id: \.stage) { rl in
                        let has = (s.stars[rl.stage] ?? 0) > 0
                        Text("\(rl.name)\(has ? " (\(rl.bonus))" : " (Locked)")")
                            .font(Face.body(11, has ? .bold : .medium))
                            .foregroundStyle(has ? Ink.ink : Ink.inkFaint)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(Capsule().fill(has ? Ink.paper : Ink.paper2))
                            .overlay(Capsule().strokeBorder(has ? Ink.inkDim : Ink.rule, lineWidth: 1))
                            .opacity(has ? 1 : 0.72)
                    }
                }
                .padding(.vertical, 4)
            }
            .padding(.bottom, 8)
            // Upright, the chosen stage sits under the stops; sideways, beside them. Either way its Start is always in view.
            if upright {
                VStack(spacing: 10) {
                    regions
                    StageCard(id: sel, compact: true)
                }
            } else {
                HStack(alignment: .top, spacing: 16) {
                    regions
                    StageCard(id: sel, compact: false)
                        .frame(width: 320)
                }
            }
        }
        .padding(16)
        .sheet(isPresented: $showGuide) { FieldGuideSheet() }
        .onAppear { sel = focus ?? app.nextStage }
    }

    private var regions: some View {
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

    /// Distinct per-region route curves matching src/ui/app.ts so the four regions don't look rubber-stamped.
    static let regionYs: [[CGFloat]] = [
        [0.68, 0.36, 0.62, 0.30, 0.50],
        [0.34, 0.66, 0.38, 0.68, 0.44],
        [0.64, 0.62, 0.30, 0.32, 0.54],
        [0.70, 0.48, 0.28, 0.58, 0.34],
    ]

    var body: some View {
        let own = app.data.stages.filter { $0.region == index }
        let sealed = !(own.first.map { app.save.isUnlocked($0.id) } ?? false)
        let look = Self.looks[min(index, Self.looks.count - 1)]
        let ys = Self.regionYs[min(index, Self.regionYs.count - 1)]
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
        let altBest = app.save.altStars[stage.id] ?? 0
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
                if best > 0 || altBest > 0 {
                    Text("\(String(repeating: "★", count: best))\(altBest > 0 ? " +\(altBest)B" : "")")
                        .font(.system(size: 11)).foregroundStyle(Ink.gold)
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
    /// Upright phones: name, stars and the twist only, so the map of stops keeps most of the screen.
    let compact: Bool

    var body: some View {
        let raw = app.data.stage(id), open = app.save.isUnlocked(id)
        let stdBest = app.save.stars[id] ?? 0, altBest = app.save.altStars[id] ?? 0
        let variant: StageVariant = raw.alt != nil && stdBest > 0 ? (app.variantByStage[id] ?? .standard) : .standard
        let st = raw.resolved(variant: variant)
        let best = variant == .alt ? altBest : stdBest
        let newFoe = app.data.enemies.values.first { $0.name.lowercased() == raw.newFoe.lowercased() }
        VStack(alignment: .leading, spacing: 0) {
            if compact {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(st.name).font(Face.title(20)).foregroundStyle(Ink.ink).lineLimit(1).minimumScaleFactor(0.7)
                        Spacer(minLength: 8)
                        Stars(n: best, size: 16)
                    }
                    Text("Stage \(st.id), \(app.data.regions[st.region].name) · \(st.waves.count) waves · \(st.startGold)g")
                        .font(Face.body(13, .semibold)).foregroundStyle(Ink.inkDim)
                    Text(st.twist).font(Face.body(13)).foregroundStyle(Ink.inkDim).lineLimit(3).fixedSize(horizontal: false, vertical: true)
                    if stdBest > 0 && raw.alt != nil {
                        Segments(items: [(StageVariant.standard, "Standard"), (.alt, "Variant B")], selected: variant, tall: true) { v in
                            app.variantByStage[id] = v
                        }
                        .padding(.top, 4)
                    }
                    // Oaths chosen here apply to the fight, so they are always in view when they can be picked.
                    if stdBest > 0 { OathPicker() }
                }
            } else {
                // The facts scroll if they must; Start stays pinned below them, never under the fold.
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(st.name).font(Face.title(26)).foregroundStyle(Ink.ink).fixedSize(horizontal: false, vertical: true)
                        Text("Stage \(st.id), \(app.data.regions[st.region].name)").font(Face.body(14, .semibold)).foregroundStyle(Ink.inkDim)
                        Stars(n: best, size: 20)
                        if stdBest > 0 && raw.alt != nil {
                            Segments(items: [(StageVariant.standard, "Standard"), (.alt, "Variant B")], selected: variant, tall: true) { v in
                                app.variantByStage[id] = v
                            }
                        }
                        Text(st.twist).font(Face.body(14)).foregroundStyle(Ink.inkDim).fixedSize(horizontal: false, vertical: true)
                        if stdBest > 0 { OathPicker() }
                        Divider().overlay(Ink.rule)
                        // Grouped so the column never holds more than ten views in a row.
                        Group {
                            Fact("New foe", newFoe.map { "\($0.name): \($0.blurb)" } ?? st.newFoe)
                            Fact("Unlocks", st.unlocks)
                            HStack(alignment: .top) {
                                Text("Towers").font(Face.body(13)).foregroundStyle(Ink.inkFaint).frame(width: 64, alignment: .leading)
                                HStack(spacing: 2) { ForEach(st.towers, id: \.self) { k in ArtPicture(name: "icon-tower-\(k.rawValue)", size: 32).accessibilityLabel(app.data.tower(k).name) } }
                            }
                            Fact("Waves", "\(st.waves.count), starting gold \(st.startGold)")
                            Fact("Stars", starRule(st.lives + app.save.mods.lives))
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            if open {
                let oaths = stdBest > 0 ? Array(app.selectedOaths) : []
                Button(best > 0 ? (variant == .alt ? "Play Variant B" : "Play again") : "Start") { app.play(id, variant: variant, oaths: oaths) }
                    .buttonStyle(PaperButton(kind: .primary, big: true))
                    .frame(maxWidth: .infinity)
                    .padding(.top, 10)
            } else {
                Text("Clear the stage before it to open this one.").font(Face.body(13)).foregroundStyle(Ink.inkFaint).padding(.top, 10)
            }
        }
        .padding(compact ? 14 : 16)
        .fixedSize(horizontal: false, vertical: compact)
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

/// Challenge Oaths: optional rules that make a cleared stage harder. A finger cannot hover, so a picked Oath spells out what it does.
private struct OathPicker: View {
    @EnvironmentObject var app: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Challenge Oaths").font(Face.body(12, .bold)).foregroundStyle(Ink.inkFaint)
            HStack(spacing: 4) {
                ForEach(OATH_DEFS, id: \.id) { o in
                    let on = app.selectedOaths.contains(o.id)
                    Button {
                        if on { app.selectedOaths.remove(o.id) } else { app.selectedOaths.insert(o.id) }
                    } label: {
                        Text(o.name).font(Face.body(11, .bold)).lineLimit(1).minimumScaleFactor(0.7)
                            .foregroundStyle(on ? Ink.accentInk : Ink.ink)
                            .padding(.horizontal, 7).padding(.vertical, 4)
                            .background(RoundedRectangle(cornerRadius: 4).fill(on ? Ink.accent : Ink.paper))
                            .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(on ? Ink.accentLo : Ink.ruleStrong, lineWidth: 1))
                            .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(o.name): \(o.desc)")
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            ForEach(OATH_DEFS, id: \.id) { o in
                if app.selectedOaths.contains(o.id) {
                    Text("\(o.name): \(o.desc)").font(Face.body(12)).foregroundStyle(Ink.inkDim).fixedSize(horizontal: false, vertical: true)
                }
            }
            Text("Clear a stage with any Oath active for +1 Ember, once per stage.")
                .font(Face.body(12)).foregroundStyle(Ink.inkFaint).fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Keep Field Guide: browsable reference sheet for all 16 Foes, 6 Towers (w/ Lv 4 & Lv 5 splits), Shop Items, and Wren skills.
struct FieldGuideSheet: View {
    @EnvironmentObject var app: AppModel
    @Environment(\.dismiss) private var dismiss
    enum Tab: Hashable { case foes, towers, items, hero }
    @State private var tab: Tab = .foes

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Text("Keep Field Guide").font(Face.title(22)).foregroundStyle(Ink.ink)
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 14, weight: .bold)).foregroundStyle(Ink.ink)
                        .frame(width: 44, height: 44)
                }.buttonStyle(.plain).accessibilityLabel("Close")
            }
            Segments(items: [(Tab.foes, "16 Foes"), (.towers, "6 Towers"), (.items, "\(app.data.itemOrder.count) Items"), (.hero, "Wren & Skills")], selected: tab, tall: true) { tab = $0 }
            ScrollView {
                VStack(spacing: 8) {
                    switch tab {
                    case .foes:
                        ForEach(EnemyKind.allCases, id: \.self) { k in
                            let f = app.data.enemy(k)
                            let tags: [String?] = [f.isFlying ? "Flying" : "Ground", f.isBoss ? "Boss" : nil,
                                                   f.traits?.armor.map { "Armor \(Int($0))" }, f.traits?.stealth == true ? "Stealth" : nil,
                                                   f.traits?.heal != nil ? "Healer" : nil]
                            let tagLine = tags.compactMap { $0 }.joined(separator: " · ")
                            GuideRow(icon: "icon-foe-\(k.rawValue)", title: f.name, sub: "\(tagLine) · \(Int(f.hp)) HP · \(Int(f.gold))g · \(f.leak) life", desc: f.blurb)
                        }
                    case .towers:
                        ForEach(app.data.towerOrder, id: \.self) { k in
                            let d = app.data.tower(k)
                            let costs = d.cost.map { "\(Int($0))" }.joined(separator: "/")
                            let splits = d.splits.map { "\($0.name) -> \($0.masteryName)" }.joined(separator: " | ")
                            GuideRow(icon: "icon-tower-\(k.rawValue)", title: d.name, sub: "Costs: \(costs)g · Lv 4-5: \(splits)", desc: d.blurb)
                        }
                    case .items:
                        ForEach(app.data.itemOrder, id: \.self) { id in
                            let it = app.data.item(id)
                            GuideRow(icon: nil, title: "\(it.name) (\(Int(it.cost))g base, +20% courier away from Gate)", sub: it.after > 0 ? "Opens after stage \(it.after)" : "Open from stage 1", desc: it.desc)
                        }
                    case .hero:
                        let h = app.data.hero
                        GuideRow(icon: "icon-hero", title: "Wren: Pin & \(Int(h.leash)) px Leash (\(h.blocks) blocks, \(Int(h.gateRadius)) px Gate)",
                                 sub: "Levels 1..\(h.maxLevel) per fight · +\(Int(h.lastHit * 100))% gold on last hits",
                                 desc: "Auto-attacks engage foes inside a 90 px leash without dropping road hold. Stand beside rubble plots to salvage free.")
                        ForEach([SkillKey.q, .w, .e, .r], id: \.self) { k in
                            let s = app.data.skill(k)
                            let lvls = s.needLevel.map(String.init).joined(separator: "/")
                            let cds = s.cd.map { "\(Int($0))s" }.joined(separator: "/")
                            GuideRow(icon: "ui-skill-\(k.rawValue)", title: "\(k.rawValue.uppercased()): \(s.name)", sub: "Unlocks Lv \(lvls) · CD \(cds)", desc: s.desc)
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(Ink.paper.ignoresSafeArea())
    }
}

private struct GuideRow: View {
    let icon: String?, title: String, sub: String, desc: String
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if let icon {
                if icon.hasPrefix("ui-") { ArtIcon(name: String(icon.dropFirst(3)), size: 32).foregroundStyle(Ink.ink) }
                else { ArtPicture(name: icon, size: 48) }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Face.body(14, .heavy)).foregroundStyle(Ink.ink)
                Text(sub).font(Face.body(11, .bold)).foregroundStyle(Ink.inkFaint)
                Text(desc).font(Face.body(13)).foregroundStyle(Ink.inkDim).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .paperCard(Ink.paper2)
    }
}
