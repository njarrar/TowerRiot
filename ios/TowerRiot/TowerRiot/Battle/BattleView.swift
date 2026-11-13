import SwiftUI
import SpriteKit
import TowerRiotKit

/// The battle screen: the map, the HUD, build menus, hero controls, shop and the result card.
/// Wide screens put the HUD in columns beside the map; narrower ones put a band under it. The map keeps 16:9.
/// A phone held upright gets a strip on top, the map at full height in the middle and a deep band below;
/// the map is wider than the screen there, and a drag slides it left and right.
struct BattleView: View {
    @EnvironmentObject var app: AppModel
    @StateObject private var ctl: BattleController

    init(stageId: Int, variant: StageVariant = .standard, oaths: [OathId] = []) {
        // The controller needs the app; it is handed over in onAppear-free form via a holder.
        _ctl = StateObject(wrappedValue: BattleController(stageId: stageId, variant: variant, oaths: oaths, app: AppHolder.shared!))
    }

    var body: some View {
        // The outer reader keeps the safe area, so it can say how big the island, notch and home bar are.
        // The inner one ignores it and spans the whole screen. A reader that ignores the safe area reports zero insets.
        GeometryReader { outer in
            let safe = outer.safeAreaInsets
            GeometryReader { geo in
                screen(safe: safe, w: geo.size.width, h: geo.size.height)
            }
            .ignoresSafeArea()
        }
        .statusBarHidden(true)
    }

    @ViewBuilder private func screen(safe: EdgeInsets, w: CGFloat, h: CGFloat) -> some View {
        let upright = h > w * 1.15 && w < 760
        let sideRoom = (w - safe.leading - safe.trailing - h * 16 / 9) / 2
        let side = !upright && sideRoom >= 64
        let band: CGFloat = h < 480 ? 74 : 92
        let top: CGFloat = upright ? safe.top + 56 : 0
        // The part of the screen the map shows in.
        let map: CGRect = {
            if upright {
                // At least about two fifths of the map in view, so towers and foes stay big enough to tap.
                let mh = max(180, min(h - top - 210 - safe.bottom, w / (World.width * 0.42) * World.height))
                return CGRect(x: 0, y: top, width: w, height: mh)
            }
            if side { let mw = h * 16 / 9; return CGRect(x: (w - mw) / 2, y: 0, width: mw, height: h) }
            let mh = min(h - band - safe.bottom, w * 9 / 16), mw = mh * 16 / 9
            return CGRect(x: (w - mw) / 2, y: 0, width: mw, height: mh)
        }()
        // The whole map, which runs past the screen's sides when upright.
        let scale = map.height / World.height
        let _ = ctl.setView(scale: scale, halfWidth: min(World.width / 2, Double(map.width / scale / 2)))
        let full: CGRect = upright
            ? CGRect(x: map.midX - CGFloat(ctl.centre()) * scale, y: map.minY, width: World.width * scale, height: map.height)
            : map
        ZStack(alignment: .topLeading) {
            Ink.paper3
            SpriteView(scene: ctl.scene, preferredFramesPerSecond: 60, options: [.ignoresSiblingOrder])
                .frame(width: full.width, height: full.height)
                .offset(x: full.minX - map.minX)
                .frame(width: map.width, height: map.height, alignment: .topLeading)
                .clipped()
                .offset(x: map.minX, y: map.minY)
            HudLayer(ctl: ctl, map: map, full: full, side: side, upright: upright, safe: safe, size: CGSize(width: w, height: h), band: band)
        }
        .frame(width: w, height: h)
    }
}

/// The app model, for views built before the environment is in place (the battle's StateObject).
enum AppHolder { static weak var shared: AppModel? }

private struct HudLayer: View {
    @ObservedObject var ctl: BattleController
    /// The part of the screen the map shows in, and the whole map (wider than the screen on an upright phone).
    let map: CGRect
    let full: CGRect
    let side: Bool
    let upright: Bool
    let safe: EdgeInsets
    let size: CGSize
    let band: CGFloat

    var body: some View {
        let _ = ctl.tick
        let b = ctl.battle
        ZStack(alignment: .topLeading) {
            if upright {
                // Top strip, under the island: lives, gold, wave, speed and pause. Auto sits with the skills and
                // sound in the pause strip, so the strip fits a 375 point phone.
                // Band below the map: Wren and the call button, then the skills.
                HStack(alignment: .center, spacing: 6) {
                    if ctl.leftHandHud {
                        ControlsView(ctl: ctl, compact: true)
                        Spacer(minLength: 0)
                        StatsView(ctl: ctl, vertical: false, part: .core)
                    } else {
                        StatsView(ctl: ctl, vertical: false, part: .core)
                        Spacer(minLength: 0)
                        ControlsView(ctl: ctl, compact: true)
                    }
                }
                .padding(.leading, 8 + safe.leading).padding(.trailing, 8 + safe.trailing).padding(.bottom, 6)
                .frame(width: size.width, height: map.minY, alignment: .bottom)
                .background(Ink.paper)
                .overlay(Rectangle().fill(Ink.rule).frame(height: 1), alignment: .bottom)
                VStack(spacing: 10) {
                    HStack(alignment: .top, spacing: 8) {
                        if ctl.leftHandHud {
                            CallView(ctl: ctl, compact: true)
                            Spacer(minLength: 0)
                            HeroCard(ctl: ctl)
                        } else {
                            HeroCard(ctl: ctl)
                            Spacer(minLength: 0)
                            CallView(ctl: ctl, compact: true)
                        }
                    }
                    HStack(spacing: 6) {
                        SkillsView(ctl: ctl, columns: false)
                        AutoTile(ctl: ctl)
                    }
                }
                .padding(.horizontal, 10).padding(.top, 10).padding(.bottom, 10 + safe.bottom)
                .frame(width: size.width, height: size.height - map.maxY, alignment: .top)
                .background(Ink.paper)
                .overlay(Rectangle().fill(Ink.rule).frame(height: 1), alignment: .top)
                .offset(y: map.maxY)
                EdgeMarks(battle: b, map: map, full: full)
                // The Hollow's adapt and resist pills, only while they matter, on the map's foot so the strip never grows.
                StatsView(ctl: ctl, vertical: false, part: .extras)
                    .frame(width: size.width - 16, alignment: ctl.leftHandHud ? .trailing : .leading)
                    .offset(x: 8, y: map.maxY - 36)
                    .allowsHitTesting(false)
            } else if side {
                let leftW = max(0, map.minX - safe.leading)
                let rightW = max(0, size.width - map.maxX - safe.trailing)
                if ctl.leftHandHud {
                    VStack(alignment: .leading, spacing: 8) {
                        ControlsView(ctl: ctl)
                        SkillsView(ctl: ctl, columns: true)
                        Spacer(minLength: 0)
                        CallView(ctl: ctl, compact: true)
                    }
                    .padding(.vertical, 10).padding(.horizontal, 8)
                    .frame(width: leftW, height: size.height, alignment: .topLeading)
                    .offset(x: safe.leading)
                    VStack(alignment: .trailing, spacing: 8) {
                        StatsView(ctl: ctl, vertical: true)
                        Spacer(minLength: 0)
                        HeroCard(ctl: ctl)
                    }
                    .padding(.vertical, 10).padding(.horizontal, 8)
                    .frame(width: rightW, height: size.height, alignment: .topTrailing)
                    .offset(x: map.maxX)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        StatsView(ctl: ctl, vertical: true)
                        Spacer(minLength: 0)
                        HeroCard(ctl: ctl)
                    }
                    .padding(.vertical, 10).padding(.horizontal, 8)
                    .frame(width: leftW, height: size.height, alignment: .topLeading)
                    .offset(x: safe.leading)
                    VStack(alignment: .trailing, spacing: 8) {
                        ControlsView(ctl: ctl)
                        SkillsView(ctl: ctl, columns: true)
                        Spacer(minLength: 0)
                        CallView(ctl: ctl, compact: true)
                    }
                    .padding(.vertical, 10).padding(.horizontal, 8)
                    .frame(width: rightW, height: size.height, alignment: .topTrailing)
                    .offset(x: map.maxX)
                }
            } else {
                HStack(alignment: .center, spacing: 12) {
                    if ctl.leftHandHud {
                        CallView(ctl: ctl, compact: false)
                        Spacer(minLength: 0)
                        SkillsView(ctl: ctl, columns: false)
                        HeroCard(ctl: ctl)
                    } else {
                        HeroCard(ctl: ctl)
                        SkillsView(ctl: ctl, columns: false)
                        Spacer(minLength: 0)
                        CallView(ctl: ctl, compact: false)
                    }
                }
                .padding(.leading, 10 + safe.leading).padding(.trailing, 10 + safe.trailing).padding(.vertical, 6)
                .frame(width: size.width, height: size.height - map.maxY, alignment: .leading)
                .background(Ink.paper)
                .overlay(Rectangle().fill(Ink.rule).frame(height: 1), alignment: .top)
                .offset(y: map.maxY)
                // Over the map's top edge: lives and gold on one side, the controls on the other. Left-handed play swaps them.
                let padL = max(0, safe.leading - map.minX), padR = max(0, safe.trailing - (size.width - map.maxX))
                let rowW = max(0, map.width - 16 - padL - padR)
                StatsView(ctl: ctl, vertical: false)
                    .frame(width: rowW, alignment: ctl.leftHandHud ? .trailing : .leading)
                    .offset(x: map.minX + 8 + padL, y: map.minY + 8)
                ControlsView(ctl: ctl)
                    .frame(width: rowW, alignment: ctl.leftHandHud ? .leading : .trailing)
                    .offset(x: map.minX + 8 + padL, y: map.minY + 8)
            }

            if let hp = ctl.hintPlot, ctl.menu == nil, hp < b.plots.count {
                let p = b.plots[hp], pt = toView(p.x, p.y - 24)
                Text("Build here").font(Face.body(14, .heavy)).foregroundStyle(Ink.accentInk)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Capsule().fill(Ink.accent))
                    .fixedSize()
                    .position(x: pt.x, y: pt.y - 16)
                    .allowsHitTesting(false)
            }
            if let banner = ctl.banner {
                BannerView(item: banner)
                    .frame(width: map.width)
                    .offset(x: map.minX, y: banner.low ? map.maxY - 86 : map.minY + 56)
                    .allowsHitTesting(false)
                    .transition(.opacity)
                    .id(banner.id)
            }
            if let m = ctl.menu {
                MenuCard(ctl: ctl, menu: m, toView: toView, map: map, size: size)
            }
            if ctl.shopOpen {
                let shopW = min(340, map.width - 16)
                ShopView(ctl: ctl)
                    .frame(width: shopW)
                    .frame(maxHeight: map.height - 16, alignment: .top)
                    .offset(x: ctl.leftHandHud ? map.minX + 8 : map.maxX - shopW - 8, y: map.minY + 8)
            }
            if b.paused && !ctl.exitAsk && ctl.result == nil {
                // Under the controls when they sit over the map, so pausing never covers them.
                PauseStrip(ctl: ctl)
                    .frame(width: map.width)
                    .offset(x: map.minX, y: map.minY + (upright || side ? 10 : 60))
            }
            if ctl.exitAsk { ExitCard(ctl: ctl).frame(width: size.width, height: size.height) }
            if let r = ctl.result { ResultCard(ctl: ctl, r: r).frame(width: size.width, height: size.height) }
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
    }

    func toView(_ x: Double, _ y: Double) -> CGPoint {
        CGPoint(x: full.minX + x / World.width * full.width, y: full.minY + y / World.height * full.height)
    }
}

/// When the map runs past the screen's sides: a soft shade at an edge with more map beyond it,
/// and a dark notch on that edge for each foe out of view, at its height on the map.
private struct EdgeMarks: View {
    let battle: Battle
    let map: CGRect
    let full: CGRect

    var body: some View {
        let k = full.width / World.width
        let x0 = Double((map.minX - full.minX) / k), x1 = Double((map.maxX - full.minX) / k)
        ZStack(alignment: .topLeading) {
            ForEach([-1, 1], id: \.self) { side in
                let more = side < 0 ? full.minX < map.minX - 1 : full.maxX > map.maxX + 1
                if more {
                    let ex = side < 0 ? map.minX : map.maxX
                    LinearGradient(colors: [Ink.ink.opacity(0.28), Ink.ink.opacity(0)], startPoint: side < 0 ? .leading : .trailing, endPoint: side < 0 ? .trailing : .leading)
                        .frame(width: 18, height: map.height)
                        .offset(x: side < 0 ? ex : ex - 18, y: map.minY)
                    ForEach(battle.foes.filter { !$0.dead && (side < 0 ? $0.x < x0 : $0.x > x1) }, id: \.id) { f in
                        let y = map.minY + max(8, min(map.height - 8, CGFloat(f.y) * k))
                        Notch(left: side < 0).fill(Ink.life)
                            .frame(width: 10, height: 14)
                            .offset(x: side < 0 ? ex + 2 : ex - 12, y: y - 7)
                    }
                }
            }
        }
        .allowsHitTesting(false)
    }
}

/// A small arrow head pointing off the screen.
private struct Notch: Shape {
    let left: Bool
    func path(in r: CGRect) -> SwiftUI.Path {
        SwiftUI.Path { p in
            if left { p.move(to: CGPoint(x: r.maxX, y: r.minY)); p.addLine(to: CGPoint(x: r.minX, y: r.midY)); p.addLine(to: CGPoint(x: r.maxX, y: r.maxY)) }
            else { p.move(to: CGPoint(x: r.minX, y: r.minY)); p.addLine(to: CGPoint(x: r.maxX, y: r.midY)); p.addLine(to: CGPoint(x: r.minX, y: r.maxY)) }
            p.closeSubpath()
        }
    }
}

/* ------------------------------------------------------------------ stats and controls */

private struct StatsView: View {
    enum Part { case all, core, extras }
    @ObservedObject var ctl: BattleController
    let vertical: Bool
    /// Core is lives, gold and wave; extras are the Hollow's adapt and resist pills.
    var part: Part = .all

    var body: some View {
        let b = ctl.battle
        let share = Double(b.lives) / Double(b.startLives), held = share >= 0.9 ? 3 : share >= 0.5 ? 2 : 1
        let adapt = b.adaptationShare()
        let res = Element.allCases.compactMap { e -> (Element, Double)? in let v = b.resist[e] ?? 0; return v > 0 && e != .hero ? (e, v) : nil }
        let layout = vertical ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6)) : AnyLayout(HStackLayout(spacing: 6))
        layout {
            if part != .extras {
                Pill {
                    Image(systemName: "heart.fill").font(.system(size: 13)).foregroundStyle(Ink.life)
                    Text("\(b.lives)").font(Face.body(16, .heavy))
                    HStack(spacing: 0) { ForEach(0..<3, id: \.self) { i in Text("★").font(.system(size: 11)).foregroundStyle(i < held ? Ink.gold : Ink.ruleStrong) } }
                }
                .accessibilityLabel("Lives \(b.lives). Keep \(starLives(b.startLives).three) for 3 stars.")
                Pill { Price(n: b.gold, size: 16) }
                Pill {
                    Image(systemName: "flag.fill").font(.system(size: 12)).foregroundStyle(Ink.inkDim)
                    Text("\(max(1, b.wave))/\(b.totalWaves)").font(Face.body(16, .heavy))
                }
            }
            if part != .core {
                // Shown as on the web: only on stages where the Hollow can adapt, and only once one element leads.
                if let el = adapt.top, adapt.share >= 0.28, b.stage.region > 0 || b.stage.adaptEvery != nil {
                    let hot = adapt.share > adapt.threshold
                    Pill {
                        ArtIcon(name: "el-\(el.rawValue)", size: 14).foregroundStyle(hot ? Ink.hollow : Ink.inkDim)
                        Text("\(Int(jsRound(adapt.share * 100)))%/42%").font(Face.body(12, .heavy))
                            .foregroundStyle(hot ? Ink.hollow : Ink.inkDim)
                    }
                    .accessibilityLabel("Hollow Adaptation meter: \(Int(jsRound(adapt.share * 100)))% \(Words.element[el] ?? "") damage, threshold 42%")
                }
                ForEach(res, id: \.0) { e, v in
                    Pill {
                        ArtIcon(name: "el-\(e.rawValue)", size: 14).foregroundStyle(Ink.hollow)
                        if vertical { Text(Words.elementTitle[e] ?? "").font(Face.body(12, .bold)).foregroundStyle(Ink.inkDim) }
                        Text("\(Int((v * 100).rounded()))%").font(Face.body(13, .heavy)).foregroundStyle(Ink.hollow)
                    }
                    .accessibilityLabel("The Hollow takes \(Int((v * 100).rounded()))% less \(Words.element[e] ?? "") damage")
                }
            }
        }
        .foregroundStyle(Ink.ink)
    }
}

private struct Pill<Content: View>: View {
    @Environment(\.upright) private var upright
    @ViewBuilder let content: Content
    var body: some View {
        HStack(spacing: 5) { content }
            .padding(.horizontal, upright ? 7 : 9).padding(.vertical, 5)
            .background(Capsule().fill(Ink.paperGlass))
            .overlay(Capsule().strokeBorder(Ink.rule, lineWidth: 1))
            .fixedSize()
    }
}

private struct ControlsView: View {
    @ObservedObject var ctl: BattleController
    /// Only speed and pause, for the upright strip.
    var compact = false
    var body: some View {
        let b = ctl.battle
        HStack(spacing: 6) {
            if !compact {
                Button { ctl.toggleAutoNext() } label: {
                    Text("Auto").font(Face.body(12, .heavy)).lineLimit(1).minimumScaleFactor(0.6)
                        .foregroundStyle(ctl.autoNext ? Ink.accentInk : Ink.inkDim)
                        .frame(width: 44, height: 44)
                        .background(RoundedRectangle(cornerRadius: 5).fill(ctl.autoNext ? Ink.accent : Ink.paperGlass))
                        .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(ctl.autoNext ? Ink.accentLo : Ink.ruleStrong, lineWidth: 1))
                }.buttonStyle(.plain).accessibilityLabel("Auto-call next wave").accessibilityAddTraits(ctl.autoNext ? .isSelected : [])
                IconButton(icon: ctl.soundOn ? "sound" : "mute", label: ctl.soundOn ? "Mute sound" : "Turn sound on", dim: !ctl.soundOn) { ctl.toggleSound() }
            }
            Button { ctl.cycleSpeed() } label: {
                Text("\(Int(b.speed))x").font(Face.body(16, .heavy)).foregroundStyle(Ink.ink)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: 5).fill(Ink.paperGlass))
                    .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(Ink.ruleStrong, lineWidth: 1))
            }.buttonStyle(.plain).accessibilityLabel("Game speed")
            IconButton(icon: b.paused ? "play" : "pause", label: b.paused ? "Resume" : "Pause", active: b.paused) { ctl.togglePause() }
        }
    }
}

/// Auto-call as a tile beside the skills, for the upright band.
private struct AutoTile: View {
    @ObservedObject var ctl: BattleController
    var body: some View {
        Button { ctl.toggleAutoNext() } label: {
            VStack(spacing: 2) {
                Text("Auto").font(Face.body(13, .heavy))
                Text(ctl.autoNext ? "on" : "off").font(Face.body(10, .bold)).opacity(0.85)
            }
            .foregroundStyle(ctl.autoNext ? Ink.accentInk : Ink.inkDim)
            .frame(width: 58, height: 58)
            .background(RoundedRectangle(cornerRadius: 7).fill(ctl.autoNext ? Ink.accent : Ink.paperGlass))
            .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(ctl.autoNext ? Ink.accentLo : Ink.ruleStrong, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Auto-call next wave")
        .accessibilityAddTraits(ctl.autoNext ? .isSelected : [])
    }
}

/* ------------------------------------------------------------------ Wren */

private struct HeroCard: View {
    @ObservedObject var ctl: BattleController
    var body: some View {
        let b = ctl.battle, h = b.hero
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Button { ctl.toggleLeash() } label: {
                    ZStack(alignment: .bottomTrailing) {
                        ArtPicture(name: "icon-hero", size: 34)
                            .background(Circle().fill(ctl.showLeash ? Ink.accent : Ink.ink)).clipShape(Circle())
                        Text("\(h.level)").font(Face.body(11, .heavy)).foregroundStyle(Ink.paper)
                            .frame(width: 18, height: 18).background(Circle().fill(ctl.levelFlash ? Ink.accent : Ink.ink))
                            .offset(x: 4, y: 4)
                    }
                    // A 44 point target around the 34 point portrait; the card's own padding gives it the room.
                    .frame(width: 44, height: 44).contentShape(Rectangle()).padding(-5)
                }.buttonStyle(.plain).accessibilityLabel("Toggle Wren leash ring").accessibilityAddTraits(ctl.showLeash ? .isSelected : [])
                Text("Wren").font(Face.body(15, .heavy)).foregroundStyle(Ink.ink)
                if h.points > 0 {
                    Text("\(h.points) pt\(h.points > 1 ? "s" : "")").font(Face.body(12, .heavy)).foregroundStyle(Ink.accent).lineLimit(1).minimumScaleFactor(0.7)
                } else if h.dead {
                    Text("Back in \(Int(h.respawnT.rounded(.up)))").font(Face.body(12, .bold)).foregroundStyle(Ink.inkDim)
                }
            }
            Meter(value: h.hp / b.heroMaxHp(), color: Ink.good, height: 5)
            Meter(value: h.level >= 16 ? 1 : h.xp / b.xpNeeded(), color: Ink.gold.opacity(0.85), height: 3)
            HStack(spacing: 4) {
                ForEach(0..<ctl.data.itemSlots, id: \.self) { i in
                    let id = i < h.items.count ? h.items[i] : nil
                    Text(id.map { ctl.data.item($0).name.split(separator: " ").map { String($0.prefix(1)) }.joined() } ?? "")
                        .font(Face.body(10, .heavy)).foregroundStyle(Ink.ink)
                        .frame(width: 22, height: 22)
                        .background(RoundedRectangle(cornerRadius: 3).fill(id == nil ? Ink.paper2 : Ink.paper))
                        .overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(id == nil ? Ink.rule : Ink.inkDim, lineWidth: 1))
                }
                Button("Shop") { ctl.shopOpen.toggle() }
                    .buttonStyle(PaperButton(kind: b.nearGate() ? .primary : .plain))
                    .controlSize(.small)
            }
        }
        .padding(8)
        .frame(width: 196, alignment: .leading)
        .paperCard(Ink.paperGlass)
        .opacity(h.dead ? 0.7 : 1)
    }
}

private struct Meter: View {
    let value: Double
    let color: Color
    var height: CGFloat = 5
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Ink.paper3)
                Capsule().fill(color).frame(width: g.size.width * max(0, min(1, value)))
            }
        }
        .frame(height: height)
    }
}

/* ------------------------------------------------------------------ skills */

private struct SkillsView: View {
    @ObservedObject var ctl: BattleController
    let columns: Bool
    var body: some View {
        let keys: [SkillKey] = [.q, .w, .e, .r]
        let grid = columns ? [GridItem(.fixed(58)), GridItem(.fixed(58))] : Array(repeating: GridItem(.fixed(58)), count: 4)
        LazyVGrid(columns: grid, spacing: 6) {
            ForEach(keys, id: \.self) { k in SkillButton(ctl: ctl, key: k) }
        }
        .fixedSize()
    }
}

private struct SkillButton: View {
    @ObservedObject var ctl: BattleController
    let key: SkillKey
    var body: some View {
        let b = ctl.battle, h = b.hero, s = ctl.data.skill(key), r = h.rank(key)
        let locked = (key == .w && !b.mods.skillW) || (key == .r && !b.mods.skillR)
        let req = locked ? "Clear stage \(key == .w ? 1 : 7)" : r == 0 && h.level < s.needLevel[0] ? "Level \(s.needLevel[0])" : ""
        let ready = b.skillReady(key), canLearn = b.canLearn(key)
        let cd = r > 0 && key != .e ? max(0, min(1, h.cooldown(key) / s.cd[r - 1])) : 0
        let aiming = key == .w && ctl.aimingW
        Button { ctl.skillPress(key) } label: {
            VStack(spacing: 1) {
                ZStack {
                    ArtIcon(name: locked ? "lock" : "skill-\(key.rawValue)", size: 22)
                        .foregroundStyle(r == 0 ? Ink.inkFaint : ready ? Ink.ink : Ink.inkDim)
                }
                .frame(height: 24)
                Text(s.name.split(separator: " ").last.map(String.init) ?? s.name)
                    .font(Face.body(11, .bold)).foregroundStyle(Ink.ink).lineLimit(1).minimumScaleFactor(0.7)
                if !req.isEmpty {
                    Text(req).font(Face.body(9, .bold)).foregroundStyle(Ink.inkFaint).lineLimit(1).minimumScaleFactor(0.6)
                } else {
                    HStack(spacing: 2) {
                        ForEach(0..<s.maxRank, id: \.self) { i in Capsule().fill(i < r ? Ink.ink : Ink.rule).frame(width: 6, height: 3) }
                    }.frame(height: 9)
                }
            }
            .frame(width: 58, height: 58)
            .background(RoundedRectangle(cornerRadius: 7).fill(aiming ? Ink.paper2 : Ink.paperGlass))
            .overlay(alignment: .bottom) {
                // The cooldown drains from the top as a shade.
                GeometryReader { g in Rectangle().fill(Ink.ink.opacity(0.22)).frame(height: g.size.height * cd).frame(maxHeight: .infinity, alignment: .bottom) }
                    .clipShape(RoundedRectangle(cornerRadius: 7)).allowsHitTesting(false)
            }
            .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(canLearn ? Ink.accent : aiming ? Ink.ink : Ink.ruleStrong, lineWidth: canLearn || aiming ? 2 : 1))
            .opacity(locked ? 0.55 : 1)
        }
        .buttonStyle(.plain)
        .overlay(alignment: .topTrailing) {
            if canLearn {
                // Dedicated learn pill so tapping + upgrades even when skill is off cooldown. The disc is 24 points; its target is 44.
                Button { ctl.learnSkill(key) } label: {
                    Text("+").font(Face.body(13, .heavy)).foregroundStyle(Ink.accentInk)
                        .frame(width: 24, height: 24).background(Circle().fill(Ink.accent))
                        .frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .offset(x: 16, y: -16)
                .accessibilityLabel("Learn \(s.name)")
            }
        }
        .accessibilityLabel("\(s.name). \(s.desc)")
    }
}

/* ------------------------------------------------------------------ next wave and the call button */

private struct CallView: View {
    @ObservedObject var ctl: BattleController
    let compact: Bool
    var body: some View {
        let b = ctl.battle
        let canCall = !b.over && (b.status == .prep || (b.nextIn != nil && b.wave < b.totalWaves))
        VStack(alignment: .trailing, spacing: 6) {
            if let nw = b.over ? nil : b.nextWave(), b.status == .prep || b.nextIn != nil {
                let lean = b.adaptLean(), adapts = b.adaptsAt(nw.n)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Next: wave \(nw.n) of \(b.totalWaves)").font(Face.body(12, .heavy)).foregroundStyle(Ink.inkDim)
                    HStack(spacing: 6) {
                        ForEach(Array(nw.foes.enumerated()), id: \.offset) { _, f in
                            HStack(spacing: 2) {
                                ArtPicture(name: "icon-foe-\(f.kind.rawValue)", size: 22)
                                Text("\(f.count)").font(Face.body(13, .heavy)).foregroundStyle(Ink.ink)
                                if ctl.data.enemy(f.kind).isFlying { ArtIcon(name: "wing", size: 12).foregroundStyle(Ink.inkDim) }
                            }
                        }
                    }
                    if !nw.openingRoads.isEmpty {
                        let opening = nw.openingRoads.count
                        Text(opening == 1 ? "A new road opens next wave" : "\(opening) new roads open next wave")
                            .font(Face.body(11, .heavy)).foregroundStyle(Ink.accent).lineLimit(1).minimumScaleFactor(0.7)
                    }
                    if adapts {
                        Text(compact ? (lean.map { "Adapts: \(Words.element[$0] ?? "")" } ?? "Adapts")
                             : (lean.map { "The Hollow adapts this wave, against your \(Words.element[$0] ?? "")." } ?? "The Hollow adapts this wave."))
                            .font(Face.body(11, .bold)).foregroundStyle(Ink.hollow).lineLimit(1).minimumScaleFactor(0.7)
                    }
                }
                .padding(8)
                .paperCard(Ink.paperGlass)
            }
            if canCall {
                Button { ctl.callWave() } label: {
                    VStack(spacing: 0) {
                        Text(b.status == .prep ? "Start" : "Wave \(b.wave + 1) in \(Int((b.nextIn ?? 0).rounded(.up)))s")
                            .font(Face.body(16, .heavy))
                        Text(b.status == .prep ? "Call the first wave" : "Call now: +\(b.earlyBonus) gold")
                            .font(Face.body(11, .semibold)).opacity(0.9)
                    }
                    .frame(minWidth: 130)
                }
                .buttonStyle(PaperButton(kind: .primary))
            }
        }
    }
}

/* ------------------------------------------------------------------ banners and cards */

private struct BannerView: View {
    let item: BattleController.BannerItem
    var body: some View {
        VStack(spacing: 2) {
            Text(item.title).font(Face.title(18)).foregroundStyle(Ink.ink).lineLimit(1).minimumScaleFactor(0.7)
            if !item.sub.isEmpty {
                Text(item.sub).font(Face.body(13, .semibold)).foregroundStyle(Ink.inkDim).multilineTextAlignment(.center).lineLimit(2)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .frame(maxWidth: 440)
        .paperCard(Ink.paperGlass)
        .overlay(Rectangle().fill(Ink.ink).frame(height: 2), alignment: .top)
        .frame(maxWidth: .infinity)
    }
}

/// The build menu on a plot, or the tower menu: upgrade, split, aim, rounds and sell.
private struct MenuCard: View {
    @ObservedObject var ctl: BattleController
    let menu: BattleController.Menu
    let toView: (Double, Double) -> CGPoint
    let map: CGRect
    let size: CGSize
    @State private var cardSize = CGSize(width: 300, height: 200)

    var body: some View {
        let b = ctl.battle
        let anchor: CGPoint = {
            switch menu {
            case let .plot(i): return toView(b.plots[i].x, b.plots[i].y)
            case let .tower(id): let t = b.tower(id); return toView(t?.x ?? 0, (t?.y ?? 0) - 90)
            }
        }()
        // Keep to the map when it fits, above the spot, or below it when there is no room.
        let w = cardSize.width, h = cardSize.height
        let minL = w <= map.width - 16 ? map.minX + 8 : 8, maxL = w <= map.width - 16 ? map.maxX - w - 8 : size.width - w - 8
        var top = anchor.y - h - 40
        if top < map.minY + 52 { top = anchor.y + 34 }
        top = min(top, max(map.minY + 52, min(size.height, map.maxY) - h - 8))
        let left = max(minL, min(maxL, anchor.x - w / 2))
        return content
            .fixedSize()
            .background(GeometryReader { g in Color.clear.preference(key: SizeKey.self, value: g.size) })
            .onPreferenceChange(SizeKey.self) { cardSize = $0 }
            .offset(x: left, y: max(4, top))
    }

    @ViewBuilder var content: some View {
        let b = ctl.battle
        VStack(alignment: .leading, spacing: 8) {
            switch menu {
            case let .plot(pi): plotMenu(pi)
            case let .tower(id): if let t = b.tower(id) { towerMenu(t) }
            }
        }
        .padding(12)
        .frame(maxWidth: min(520, map.width - 16))
        .paperCard()
        .shadow(color: Ink.shadow, radius: 10, y: 6)
    }

    @ViewBuilder func plotMenu(_ pi: Int) -> some View {
        let b = ctl.battle, p = b.plots[pi]
        if !p.unlocked {
            Text("Submerged plot").font(Face.body(15, .heavy)).foregroundStyle(Ink.ink)
            Text("Opens cleanly on Wave \(b.stage.plots[pi].openAtWave ?? 5) once terrain shifts.")
                .font(Face.body(12, .medium)).foregroundStyle(Ink.inkDim)
                .fixedSize(horizontal: false, vertical: true).frame(maxWidth: 320, alignment: .leading)
        } else if let rb = p.rubble {
            Text("\(rb.kind.rawValue.capitalized) obstacle").font(Face.body(15, .heavy)).foregroundStyle(Ink.ink)
            let note = rb.holdSec != nil
                ? "Clear now for \(rb.cost)g, or stand Wren beside it for \(Int(rb.holdSec!))s once the first wave is called to salvage it free."
                : "Pay \(rb.cost)g to clear this plot."
            Text(note).font(Face.body(12, .medium)).foregroundStyle(Ink.inkDim)
                .fixedSize(horizontal: false, vertical: true).frame(maxWidth: 320, alignment: .leading)
            Button { ctl.act { if b.clearPlot(pi) { ctl.closeMenu() } } } label: {
                HStack(spacing: 6) { Text("Clear plot"); Price(n: rb.cost, size: 13) }
            }
            .buttonStyle(PaperButton(kind: .primary, poor: !b.canClearPlot(pi), tall: true))
            .disabled(!b.canClearPlot(pi))
        } else {
            let perks = [p.high ? "+20% high ground" : nil, (b.mods.tidePearl && p.nearWater) ? "+15% Tide-pearl" : nil].compactMap { $0 }.joined(separator: ", ")
            let plotTitle = p.gear != nil
                ? "Build on a \(p.gear == .a ? "gold" : "iron") gear plot\(perks.isEmpty ? "" : " (\(perks))")"
                : (perks.isEmpty ? "Build a tower" : "Build a tower (\(perks) range)")
            Text(plotTitle)
                .font(Face.body(15, .heavy)).foregroundStyle(Ink.ink)
            let cols = Array(repeating: GridItem(.fixed(96), spacing: 6), count: 3)
            LazyVGrid(columns: cols, spacing: 6) {
                ForEach(b.stage.towers, id: \.self) { k in
                    let def = ctl.data.tower(k), cost = b.costOf(k), ok = b.canBuild(plot: pi, kind: k), armed = ctl.armed == k
                    Button { ctl.pickBuild(k) } label: {
                        VStack(spacing: 2) {
                            ArtPicture(name: "icon-tower-\(k.rawValue)", size: 40)
                            Text(def.name).font(Face.body(12, .heavy)).foregroundStyle(Ink.ink).lineLimit(1).minimumScaleFactor(0.7)
                            Text(Words.role[k] ?? "").font(Face.body(9, .semibold)).foregroundStyle(Ink.inkDim).lineLimit(2).minimumScaleFactor(0.7).multilineTextAlignment(.center).frame(height: 22)
                            if armed { Text("Tap again to build").font(Face.body(10, .heavy)).foregroundStyle(Ink.accent).lineLimit(1).minimumScaleFactor(0.6) }
                            else { Price(n: cost, size: 13).foregroundStyle(Ink.ink) }
                        }
                        .frame(width: 92)
                        .padding(.vertical, 6)
                        .background(RoundedRectangle(cornerRadius: 5).fill(armed ? Ink.paper2 : Ink.paper))
                        .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(armed ? Ink.accent : Ink.rule, lineWidth: armed ? 2 : 1))
                        .opacity(ok ? 1 : 0.5)
                    }
                    .buttonStyle(.plain)
                }
            }
            if let k = ctl.armed {
                let d = ctl.data.tower(k)
                Text("\(d.name): \(d.blurb)\(d.hitsFlying ? "" : " Cannot hit fliers.")").font(Face.body(12, .medium)).foregroundStyle(Ink.inkDim)
                    .fixedSize(horizontal: false, vertical: true).frame(maxWidth: 320, alignment: .leading)
            }
        }
    }

    @ViewBuilder func towerMenu(_ t: Tower) -> some View {
        let b = ctl.battle, def = ctl.data.tower(t.kind), s = b.stats(t)
        let spDef = t.split.flatMap { sp in def.splits.first { $0.id == sp } }
        let title: String = {
            if let spDef {
                return t.lv >= b.data.maxTowerLevel ? "\(spDef.masteryName) · Mastery (Lv \(t.lv))" : spDef.name
            }
            return "\(def.name) · Lv \(t.lv)"
        }()
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(Face.body(15, .heavy)).foregroundStyle(Ink.ink)
            Spacer(minLength: 8)
            Text("\(Int(t.dmgDealt.rounded())) dmg · \(t.kills) kills")
                .font(Face.body(11, .bold)).foregroundStyle(Ink.inkFaint)
        }
        let facts = t.kind == .beacon
            ? "Range \(Int(s.range.rounded())). Lights hidden foes and boosts towers in its light."
            : t.kind == .bell
            ? "Slows all foes in range. Range \(Int(s.range.rounded()))."
            : "Damage \(Int(s.dmg.rounded())), \(String(format: "%.1f", 1 / s.rate))/s, range \(Int(s.range.rounded()))."
        Text(t.down ? "This gear plot is lowered: the tower sleeps this wave." : facts).font(Face.body(12, .medium)).foregroundStyle(Ink.inkDim)
            .fixedSize(horizontal: false, vertical: true).frame(maxWidth: 360, alignment: .leading)
        if !s.buffs.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(s.buffs, id: \.self) { bf in
                        Text(bf).font(Face.body(10, .bold)).foregroundStyle(Ink.ink)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Capsule().fill(Ink.paper2))
                            .overlay(Capsule().strokeBorder(Ink.rule, lineWidth: 1))
                    }
                }
            }
            .frame(maxWidth: 360)
        }
        if let rs = b.resist[def.element], rs > 0 {
            HStack(spacing: 6) {
                ArtIcon(name: "el-\(def.element.rawValue)", size: 14)
                Text("The Hollow takes \(Int((rs * 100).rounded()))% less \(Words.element[def.element] ?? "") damage right now. Mix in other towers.")
                    .font(Face.body(12, .bold)).fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(Ink.hollow).frame(maxWidth: 360, alignment: .leading)
        }
        HStack(spacing: 6) {
            if let up = b.upgradeCost(t) {
                let n = b.stats(t, lv: t.lv + 1)
                let isMastery = t.split != nil && t.lv == 4
                let upLabel = isMastery ? (spDef?.masteryName ?? "Split Mastery") : "Level \(t.lv + 1)"
                let gain = isMastery ? (spDef?.masteryDesc ?? "Split Mastery")
                    : (t.kind == .beacon || t.kind == .bell ? "Range \(Int(s.range.rounded())) to \(Int(n.range.rounded()))"
                       : "Damage \(Int(s.dmg.rounded())) to \(Int(n.dmg.rounded())), range \(Int(s.range.rounded())) to \(Int(n.range.rounded()))")
                Button { ctl.act { _ = b.upgrade(t.id) } } label: {
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 6) { Text(upLabel); Price(n: up, size: 14) }
                        Text(gain).font(Face.body(10, .semibold)).opacity(0.9).lineLimit(2)
                    }
                }
                .buttonStyle(PaperButton(kind: .primary, poor: b.gold < up))
            }
            if t.lv == 3 && b.mods.splits {
                ForEach(def.splits, id: \.id) { sp in
                    let c = b.splitCost(t.kind, sp.id)
                    Button { ctl.act { _ = b.splitTower(t.id, sp.id) } } label: {
                        VStack(alignment: .leading, spacing: 1) {
                            HStack(spacing: 6) { Text(sp.name); Price(n: c, size: 13) }
                            Text(sp.desc).font(Face.body(10, .semibold)).foregroundStyle(Ink.inkDim).lineLimit(2).frame(maxWidth: 150, alignment: .leading)
                        }
                    }
                    .buttonStyle(PaperButton(poor: b.gold < c))
                }
            } else if t.lv == 3 {
                Text("Level 4 splits open after Storm Shelf.").font(Face.body(12, .medium)).foregroundStyle(Ink.inkDim)
            }
        }
        if t.kind != .beacon && t.kind != .bell {
            Text("Target").font(Face.body(11, .bold)).foregroundStyle(Ink.inkFaint)
            Segments(items: Words.mode, selected: t.mode) { md in ctl.act { b.setMode(t.id, md) } }
            if !b.mods.rounds.isEmpty {
                Text("Rounds").font(Face.body(11, .bold)).foregroundStyle(Ink.inkFaint)
                let items: [(String, String)] = [("", "Plain")] + b.mods.rounds.map { ($0.rawValue, Words.round[$0] ?? $0.rawValue) }
                Segments(items: items, selected: t.round?.rawValue ?? "") { v in ctl.act { b.setRound(t.id, Rounds(rawValue: v)) } }
            }
        }
        // 2-tap sell guard prevents accidental scrapping in fast combat.
        let sellArmed = ctl.sellArmedId == t.id
        Button { ctl.sellOrArm(t.id) } label: {
            HStack(spacing: 4) {
                Text(sellArmed ? "Tap again to sell for" : "Sell for").font(Face.body(13, .bold))
                Price(n: b.sellValue(t), size: 13)
            }
            .foregroundStyle(sellArmed ? Ink.accent : Ink.inkDim)
            .underline()
            .frame(minHeight: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct SizeKey: PreferenceKey {
    static var defaultValue = CGSize(width: 300, height: 200)
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) { value = nextValue() }
}

private struct ShopView: View {
    @ObservedObject var ctl: BattleController
    var body: some View {
        let b = ctl.battle, near = b.nearGate(), canShop = b.canShop()
        let freeCourier = near || b.status == .prep || (b.nextIn != nil && b.foes.isEmpty)
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("The gate shop").font(Face.body(16, .heavy)).foregroundStyle(Ink.ink)
                Spacer()
                Button { ctl.shopOpen = false } label: { Image(systemName: "xmark").font(.system(size: 14, weight: .bold)).foregroundStyle(Ink.ink).frame(width: 44, height: 44) }
                    .buttonStyle(.plain).accessibilityLabel("Close")
            }
            if canShop {
                let whereText = freeCourier ? "Gate / between-wave rate (base price)." : "Field courier delivery (+20% away from Gate)."
                Text("\(whereText) \(b.hero.items.count) of \(ctl.data.itemSlots) bag slots used.")
                    .font(Face.body(12, .medium)).foregroundStyle(Ink.inkDim).fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Wren must be alive to equip gear.").font(Face.body(12, .medium)).foregroundStyle(Ink.inkDim)
            }
            ScrollView {
                VStack(spacing: 6) {
                    ForEach(ctl.data.itemOrder.filter { ctl.data.item($0).after <= b.mods.shopAfter }, id: \.self) { id in
                        let it = ctl.data.item(id), owned = b.hero.items.contains(id), price = b.itemCost(id)
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(it.name).font(Face.body(14, .heavy)).foregroundStyle(Ink.ink)
                                Text(it.desc).font(Face.body(11, .medium)).foregroundStyle(Ink.inkDim).fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 6)
                            if owned {
                                Button { ctl.act { _ = b.sellItem(id) } } label: { HStack(spacing: 3) { Text("Sell"); Price(n: Int(it.cost) / 2, size: 12) } }
                                    .buttonStyle(PaperButton(poor: !canShop))
                                    .disabled(!canShop)
                            } else {
                                Button { ctl.act { _ = b.buy(id) } } label: { Price(n: price, size: 13) }
                                    .buttonStyle(PaperButton(kind: b.canBuy(id) ? .primary : .plain, poor: !b.canBuy(id)))
                                    .disabled(!canShop)
                            }
                        }
                        .padding(8)
                        .background(RoundedRectangle(cornerRadius: 5).fill(owned ? Ink.paper2 : Ink.paper))
                        .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(Ink.rule, lineWidth: 1))
                    }
                }
            }
        }
        .padding(12)
        .paperCard()
        .shadow(color: Ink.shadow, radius: 10, y: 6)
    }
}

private struct Veil<Content: View>: View {
    var tapOut: (() -> Void)?
    @ViewBuilder let content: Content
    var body: some View {
        ZStack {
            Ink.scrim.onTapGesture { tapOut?() }
            content
                .padding(20)
                .frame(maxWidth: 440)
                .paperCard(radius: 9)
                .overlay(Rectangle().fill(Ink.ink).frame(height: 3).clipShape(RoundedRectangle(cornerRadius: 2)), alignment: .top)
                .shadow(color: Ink.shadow, radius: 20, y: 10)
                .padding(16)
        }
    }
}

/// Top pause strip: lets players pan, inspect towers, switches and rubble unobstructed.
private struct PauseStrip: View {
    @ObservedObject var ctl: BattleController
    @Environment(\.upright) private var upright
    var body: some View {
        HStack(spacing: 10) {
            // The hint drops away when the strip would not fit, as on an upright phone.
            ViewThatFits(in: .horizontal) {
                Text("Paused. Inspect towers & lanes")
                Text("Paused")
            }
            .font(Face.body(13, .heavy)).foregroundStyle(Ink.ink).lineLimit(1)
            Button("Resume") { ctl.togglePause() }.buttonStyle(PaperButton(kind: .primary, tall: true))
            Button { ctl.requestExit() } label: { HStack(spacing: 5) { ArtIcon(name: "leave", size: 15); Text("Leave") } }
                .buttonStyle(PaperButton(tall: true))
            // Upright, sound lives here: the strip on top has no room for it.
            if upright {
                IconButton(icon: ctl.soundOn ? "sound" : "mute", label: ctl.soundOn ? "Mute sound" : "Turn sound on", dim: !ctl.soundOn) { ctl.toggleSound() }
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
        .paperCard(Ink.paperGlass, radius: 7)
        .shadow(color: Ink.shadow, radius: 12, y: 4)
    }
}

/// An in-game card rather than a system dialog.
private struct ExitCard: View {
    @ObservedObject var ctl: BattleController
    var body: some View {
        Veil(tapOut: { ctl.keepFighting() }) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Leave this battle?").font(Face.title(22)).foregroundStyle(Ink.ink)
                Text("You lose your progress in this stage. Stars you already hold stay.").font(Face.body(15)).foregroundStyle(Ink.inkDim)
                HStack(spacing: 10) {
                    Button("Keep fighting") { ctl.keepFighting() }.buttonStyle(PaperButton(kind: .primary))
                    Button("Leave") { ctl.exit() }.buttonStyle(PaperButton())
                }
            }
        }
    }
}

private struct ResultCard: View {
    @ObservedObject var ctl: BattleController
    let r: BattleController.ResultInfo
    @State private var shown = 0
    var body: some View {
        let st = ctl.battle.stage, b = ctl.battle
        Veil {
            VStack(spacing: 12) {
                Text(r.won ? "The Keep holds" : "The gate falls").font(Face.title(28, heavy: true)).foregroundStyle(Ink.ink)
                if r.won { Stars(n: shown, size: 40) }
                Text(r.text).font(Face.body(15)).foregroundStyle(Ink.inkDim).multilineTextAlignment(.center)
                if let ns = r.nextStar { Text(ns).font(Face.body(13, .semibold)).foregroundStyle(Ink.inkFaint).multilineTextAlignment(.center) }
                if let c = r.cause {
                    let d = ctl.data.enemy(c.kind)
                    HStack(spacing: 10) {
                        ArtPicture(name: "icon-foe-\(c.kind.rawValue)", size: 48)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(d.name)\(c.lives > 1 && !d.isBoss ? "s" : "") took \(c.lives) of your \(b.startLives) lives").font(Face.body(14, .heavy)).foregroundStyle(Ink.ink)
                            Text(d.blurb).font(Face.body(12)).foregroundStyle(Ink.inkDim).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(10).background(RoundedRectangle(cornerRadius: 5).fill(Ink.paper2))
                }
                VStack(spacing: 4) {
                    GeometryReader { g in
                        HStack(spacing: 1) {
                            Rectangle().fill(Ink.accent).frame(width: g.size.width * CGFloat(r.bdTowersPct) / 100)
                            Rectangle().fill(Ink.good).frame(width: g.size.width * CGFloat(r.bdHeroPct) / 100)
                            Rectangle().fill(Ink.gold).frame(maxWidth: .infinity)
                        }
                    }
                    .frame(height: 6).clipShape(Capsule())
                    Text("Towers \(r.bdTowersPct)% · Wren \(r.bdHeroPct)%\(r.mvpText.map { " · \($0)" } ?? "")")
                        .font(Face.body(11, .bold)).foregroundStyle(Ink.inkDim)
                }
                if r.won && r.embers > 0 { Text("+\(r.embers) Embers for the skill trees").font(Face.body(14, .heavy)).foregroundStyle(Ink.accent) }
                HStack(spacing: 10) {
                    Button(r.won ? "Play again" : "Try again") { ctl.retry() }.buttonStyle(PaperButton(kind: r.won ? .plain : .primary))
                    if r.won && st.id < 20 && ctl.variant != .alt { Button("Next stage") { ctl.next() }.buttonStyle(PaperButton(kind: .primary)) }
                    Button("Map") { ctl.exit() }.buttonStyle(PaperButton())
                }
            }
        }
        .task {
            // Stars come in one at a time, once.
            for i in 0..<r.stars { try? await Task.sleep(nanoseconds: 260_000_000); withAnimation(.easeOut(duration: 0.25)) { shown = i + 1 } }
        }
    }
}
