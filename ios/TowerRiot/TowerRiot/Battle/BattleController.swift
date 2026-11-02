import SwiftUI
import SpriteKit
import TowerRiotKit

/// Runs one fight: steps the battle each frame, turns events into sound and banners, and holds what the HUD shows.
/// A port of the logic in src/ui/battle.ts. The HUD reads the battle directly; `tick` tells SwiftUI when to look again.
final class BattleController: ObservableObject {
    let battle: Battle
    let scene: BattleScene
    private unowned let app: AppModel
    let autoSkills: Bool

    /// Bumped a few times a second so the HUD redraws without redrawing every frame.
    @Published private(set) var tick = 0
    @Published private(set) var menu: Menu?
    @Published private(set) var banner: BannerItem?
    @Published var shopOpen = false
    @Published private(set) var aimingW = false
    @Published private(set) var hintPlot: Int?
    /// A finger cannot hover: the first tap on a build button shows the range, the second pays.
    @Published private(set) var armed: TowerKind?
    @Published private(set) var exitAsk = false
    @Published private(set) var result: ResultInfo?
    @Published private(set) var levelFlash = false
    /// Upright phones: the world x at the middle of the screen. The map is wider than the screen and slides under a drag.
    @Published private(set) var viewCentre = World.width / 2
    /// Set by the view on each layout: points per world unit, and half the world width in view.
    private var panScale: CGFloat = 1
    private var panHalf = World.width / 2

    enum Menu: Equatable { case plot(Int), tower(Int) }
    struct BannerItem: Equatable { let id: Int; let title: String; let sub: String; let secs: Double; let low: Bool }
    struct ResultInfo {
        let won: Bool, stars: Int, embers: Int
        let text: String, nextStar: String?
        let cause: (kind: EnemyKind, lives: Int)?
    }

    private var frames = 0
    private var bannerT = 0.0
    private var bannerQ: [(String, String, Double)] = []
    private var bannerId = 0
    private var lvlT = 0.0
    private var leakBy: [EnemyKind: Int] = [:]
    private var exitWasPaused = false
    private var ended = false

    init(stageId: Int, app: AppModel) {
        self.app = app
        let st = app.data.stage(stageId)
        battle = Battle(stage: st, mods: app.save.mods, seed: Int(Date().timeIntervalSince1970 * 1000) & 0xffff)
        scene = BattleScene(battle: battle)
        autoSkills = app.autoSkills(for: stageId)
        scene.look.reduceMotion = app.save.settings.reduceMotion
        scene.look.dmgNumbers = app.save.settings.dmgNumbers
        scene.onFrame = { [weak self] dt in self?.frame(dt) ?? [] }
        scene.onTap = { [weak self] x, y in self?.tap(x, y) }
        scene.onAim = { [weak self] x, y in self?.scene.look.aimW = Vec(x, y) }
        scene.onPan = { [weak self] dx in self?.pan(by: dx) }
        start()
        // Open on the marked plot, or on Wren, when only part of the map shows.
        viewCentre = hintPlot.map { battle.plots[$0].x } ?? battle.hero.x
    }

    var data: GameData { battle.data }
    var sound: Sound { app.sound }
    var soundOn: Bool { app.save.settings.sound }

    private func start() {
        let st = battle.stage
        // Stage 1 opens on the build prompt alone: the name card would sit over the marked plot.
        if st.id != 1 { showBanner(st.name, st.twist, 4) }
        if st.id == 1 {
            // One skill works right away. Building comes first; how to move Wren follows the first tower.
            if battle.canLearn(.q) { _ = battle.learn(.q) }
            let hx = battle.hero.x, hy = battle.hero.y
            var best = 0
            for (i, p) in battle.plots.enumerated() where hypot(p.x - hx, p.y - hy) < hypot(battle.plots[best].x - hx, battle.plots[best].y - hy) { best = i }
            hintPlot = best
            scene.look.hintPlot = best
            showBanner("Build your first tower", "Tap the marked plot. Towers do most of the work.", 5)
        }
        if autoSkills { battle.autoLearn() }
    }

    /* ------------------------------------------------------------------ sliding map */

    /// The view tells the controller how the map is shown; a map that fits leaves nothing to slide.
    func setView(scale: CGFloat, halfWidth: Double) {
        panScale = scale; panHalf = halfWidth
        scene.canPan = halfWidth < World.width / 2 - 1
    }

    /// The world x at the middle of the screen, kept so the map never slides past its edges.
    func centre() -> Double { min(max(viewCentre, panHalf), World.width - panHalf) }

    private func pan(by dx: CGFloat) {
        if menu != nil { closeMenu() }
        viewCentre = min(max(centre() - Double(dx / max(0.01, panScale)), panHalf), World.width - panHalf)
    }

    /* ------------------------------------------------------------------ loop */

    private func frame(_ dt: Double) -> [BattleEvent] {
        let simDt = aimingW ? dt * 0.25 : dt
        battle.step(simDt)
        let events = battle.drain()
        react(events)
        if bannerT > 0 {
            bannerT -= dt
            if bannerT <= 0 { if bannerQ.isEmpty { banner = nil } else { let n = bannerQ.removeFirst(); putBanner(n.0, n.1, n.2) } }
        }
        if lvlT > 0 { lvlT -= dt; if lvlT <= 0 { levelFlash = false } }
        if let hp = hintPlot, battle.towers.count > 0 {
            _ = hp
            hintPlot = nil; scene.look.hintPlot = nil
            showBanner("Tap the road to send Wren", "She fights there and grows stronger with every kill.", 4)
        }
        frames += 1
        if frames % 4 == 0 || !events.isEmpty && frames % 2 == 0 { tick &+= 1 }
        return events
    }

    private func react(_ events: [BattleEvent]) {
        let b = battle
        for e in events {
            switch e {
            case let .shot(_, kind): sound.play(kind == .bolt ? .bolt : .boom)
            case .pulse: sound.play(.bell)
            case .arc: sound.play(.zap)
            case .root: sound.play(.root)
            case .kill: sound.play(.coin)
            case .heroHit: sound.play(.hero)
            case let .leak(_, _, lives, kind, _): sound.play(.leak); leakBy[kind, default: 0] += lives
            case .build, .upgrade: sound.play(.build)
            case .level: sound.play(.level); lvlT = 0.9; levelFlash = true; if autoSkills { b.autoLearn() }
            case let .wave(n, hint): sound.play(.wave); showBanner("Wave \(n) of \(b.totalWaves)", hint, 2)
            case let .adapt(el, resist): showBanner("The Hollow adapts", "It hardens against \(Words.element[el] ?? el.rawValue): \(Int((resist * 100).rounded()))% less damage. Mix your towers.", 3.4)
            case let .shift(label, on): showBanner(on ? label : "The way is open again", on ? "Foes on that road wait at the edge. Others go round." : "", 2.6)
            case .barrier: showBanner("The wreck gives way", "The beach road is open. Foes will use it now.", 3)
            case let .boss(kind): sound.play(.boss); let d = data.enemy(kind); showBanner(d.name, d.blurb, 4, now: true)
            case let .phase(n, _, _): sound.play(.boss); showBanner("The Queen breaks: phase \(n + 1)", "The lava moves. Shades pour out.", 3)
            case let .night(on): showBanner(on ? "Night falls" : "Morning", on ? "Towers outside a Beacon's light see less. Shades walk." : "Full sight again.", 2.4)
            case let .gear(up): if b.wave > 1 { showBanner(up == .a ? "Gold gears rise" : "Iron gears rise", "Towers on the lowered plots sleep this wave.", 2.4) }
            case .sink: showBanner("The ground gives way", "A plot sinks. Any tower on it was refunded in full.", 2.6)
            case let .skill(key, _, _):
                sound.play(key == .q ? .sweep : key == .w ? .snare : .sunrise)
                if key == .r { showBanner("Sunrise", "Every tower fires twice as fast. Nothing hides.", 2) }
            case let .rune(kind, picked): sound.play(.rune); if !picked { showBanner("\(data.rune(kind).name) rune", "Send Wren to pick it up.", 2.2) }
            case .heroDown: showBanner("Wren falls", "She returns at the gate in \(Int(b.hero.respawnT.rounded(.up))) s.", 2.4)
            case .revive: showBanner("Second dawn", "Wren stands back up.", 2)
            case let .early(gold): showBanner("Called early", "+\(gold) gold", 1.6)
            case let .won(stars): sound.play(.win); end(won: true, stars: stars)
            case .lost: sound.play(.lose); end(won: false, stars: 0)
            default: break
            }
        }
    }

    /* ------------------------------------------------------------------ banners */

    /// Banners wait their turn instead of replacing each other. `now` cuts in line.
    func showBanner(_ title: String, _ sub: String, _ secs: Double, now: Bool = false) {
        if now { bannerQ = []; putBanner(title, sub, secs); return }
        if bannerT > 0 {
            bannerQ.append((title, sub, secs))
            if bannerQ.count > 3 { bannerQ.removeFirst() }
            return
        }
        putBanner(title, sub, secs)
    }

    private func putBanner(_ title: String, _ sub: String, _ secs: Double) {
        bannerId += 1
        // While stage 1 marks a plot, prompts sit at the foot of the map so they never hide it.
        banner = BannerItem(id: bannerId, title: title, sub: sub, secs: secs, low: hintPlot != nil)
        bannerT = secs
    }

    /* ------------------------------------------------------------------ input */

    func tap(_ x: Double, _ y: Double) {
        let b = battle
        if aimingW { _ = b.castW(x: x, y: y); aimingW = false; scene.look.aimW = nil; return }
        shopOpen = false
        if let t = b.towers.first(where: { abs($0.x - x) < 34 && y > $0.y - 110 && y < $0.y + 22 }) { openTower(t.id); return }
        if let pi = b.plots.indices.first(where: { i in let p = b.plots[i]; return !p.sunk && ell(p.x - x, p.y - y) < 44 && !b.towers.contains { $0.plot == i } }) {
            openPlot(pi); return
        }
        if menu != nil { closeMenu(); return }
        if let foe = b.foes.first(where: { !$0.dead && hypot($0.x - x, $0.y - $0.def.bar * 0.4 - y) < 26 + $0.def.size * 8 }), !b.hero.dead {
            b.attackFoe(foe.id); scene.markMove(foe.x, foe.y); return
        }
        if !b.hero.dead { b.moveHero(x: x, y: y); scene.markMove(x, y) }
    }

    func openPlot(_ i: Int) {
        menu = .plot(i); armed = nil
        scene.look.selPlot = i; scene.look.selTower = nil; scene.look.preview = nil
    }

    func openTower(_ id: Int) {
        menu = .tower(id); armed = nil
        scene.look.selTower = id; scene.look.selPlot = nil; scene.look.preview = nil
    }

    func closeMenu() {
        menu = nil; armed = nil
        scene.look.selPlot = nil; scene.look.selTower = nil; scene.look.preview = nil
    }

    /// First tap shows the range and what the tower does; the second tap builds.
    func pickBuild(_ kind: TowerKind) {
        guard case let .plot(pi) = menu else { return }
        if armed != kind { armed = kind; scene.look.preview = kind; return }
        if battle.build(plot: pi, kind: kind) != nil { closeMenu() }
        tick &+= 1
    }

    func act(_ f: () -> Void) { f(); tick &+= 1 }

    /// A skill button: learn it if there is a point to spend and it is not ready, else cast.
    func skillPress(_ k: SkillKey) {
        let b = battle
        if b.canLearn(k) && (b.hero.rank(k) == 0 || !b.skillReady(k)) { _ = b.learn(k); sound.play(.click); tick &+= 1; return }
        switch k {
        case .q: _ = b.castQ()
        case .r: _ = b.castR()
        case .w where b.skillReady(.w):
            aimingW.toggle()
            scene.look.aimW = aimingW ? Vec(b.hero.x + data.snare.range * 0.5 * b.hero.face, b.hero.y) : nil
            if aimingW { showBanner("Lantern Snare", "Time slows. Tap where to throw it.", 1.8, now: true) }
        default: if b.canLearn(k) { _ = b.learn(k) }
        }
        tick &+= 1
    }

    func callWave() { if battle.callWave() { sound.play(.click) }; tick &+= 1 }

    func cycleSpeed() { battle.speed = battle.speed == 1 ? 2 : battle.speed == 2 ? 3 : 1; tick &+= 1 }

    func togglePause() { battle.paused.toggle(); tick &+= 1 }

    func toggleSound() { app.toggleSound(); tick &+= 1 }

    func sendToGate() {
        guard let g = battle.gate.first else { return }
        battle.moveHero(x: g.x - 60, y: g.y); scene.markMove(g.x - 60, g.y)
    }

    /* ------------------------------------------------------------------ leaving and the end */

    /// Leave, asking first if a fight is under way.
    func requestExit() {
        if ended || battle.status == .prep { exit(); return }
        exitWasPaused = battle.paused
        battle.paused = true
        exitAsk = true
    }

    func keepFighting() {
        exitAsk = false
        if !exitWasPaused { battle.paused = false }
        tick &+= 1
    }

    func exit() { app.screen = .campaign(focus: battle.stage.id) }
    func retry() { app.play(battle.stage.id) }
    func next() { app.play(battle.stage.id + 1) }

    private func end(won: Bool, stars: Int) {
        guard !ended else { return }
        ended = true
        let b = battle, st = b.stage
        let gained = won ? app.record(stage: st.id, stars: stars) : 0
        let need = starLives(b.startLives), lost = b.startLives - b.lives
        let nextStar = won && stars < 3 ? "Lose \(b.startLives - need.three) lives or fewer for 3 stars. You lost \(lost)." : nil
        let worst = leakBy.max { $0.value < $1.value }
        result = ResultInfo(
            won: won, stars: stars, embers: gained,
            text: won ? "\(st.name) cleared with \(b.lives) lives left. Wren reached level \(b.hero.level)." : "You held until wave \(b.wave) of \(b.totalWaves).",
            nextStar: nextStar,
            cause: !won && worst != nil ? (worst!.key, worst!.value) : nil)
        closeMenu()
        shopOpen = false
    }
}

/// Words the HUD shares with the web game.
enum Words {
    static let element: [Element: String] = [.pierce: "bolts", .fire: "fire", .frost: "frost", .storm: "lightning", .nature: "roots"]
    static let elementTitle: [Element: String] = [.pierce: "Bolts", .fire: "Fire", .frost: "Frost", .storm: "Lightning", .nature: "Roots"]
    static let mode: [(TargetMode, String)] = [(.first, "First"), (.strong, "Strongest"), (.armored, "Armored"), (.close, "Closest")]
    static let round: [Rounds: String] = [.ember: "Ember", .frost: "Frost", .storm: "Storm"]
    /// What each tower is for, in a few words: shown on the build buttons, since a finger cannot hover.
    static let role: [TowerKind: String] = [
        .watch: "One target, hits fliers", .cannon: "Blasts groups, ground only", .bell: "Slows all around it",
        .pylon: "Jumps foe to foe, hits fliers", .roots: "Holds a foe, ground only", .beacon: "Boosts towers, shows Shades",
    ]
    /// The most the Hollow can harden against one element.
    static let resistCap = 0.6
}
