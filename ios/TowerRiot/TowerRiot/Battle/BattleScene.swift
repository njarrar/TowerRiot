import SpriteKit
import UIKit
import TowerRiotKit

/// What the player has open, for range rings and marks. The same as the web scene's View.
struct SceneView {
    var selPlot: Int?
    var selTower: Int?
    var preview: TowerKind?
    /// W is being aimed: time runs slow and touches steer the mark until it is thrown or called off.
    var aiming = false
    /// Where the snare would land. Nil while not aiming, and while the finger sits in the call-off zone.
    var aimW: Vec?
    var showLeash = false
    var reduceMotion = false
    var dmgNumbers = false
    var hintPlot: Int?
    /// A still frame (title screen): no health bars or shells in flight.
    var still = false
}

/// World space is 1280 by 720 with y down, as in the web game. SpriteKit is y up.
@inline(__always) func P(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x, y: World.height - y) }

/// Draws a Battle with the baked art: ground, depth-sorted units, morning light and effects.
/// Reads battle state; never changes it. A port of src/render/scene.ts.
final class BattleScene: SKScene {
    private(set) var battle: Battle
    var look = SceneView()
    /// Called once a frame before drawing: step the battle and hand back its events.
    var onFrame: ((Double) -> [BattleEvent])?
    var onTap: ((Double, Double) -> Void)?
    var onAim: ((Double, Double) -> Void)?
    var onAimEnd: ((Double, Double, Bool) -> Void)?
    var onHeroDrag: ((Double, Double) -> Void)?
    var onHeroDragEnd: ((Double, Double) -> Void)?
    var onHeroDragCancel: (() -> Void)?
    /// True when something else owns a touch at this world point, so it must not pick Wren up.
    var grabBlocked: ((Double, Double) -> Bool)?
    /// A drag across the map, in points, when the map is wider than the screen.
    var onPan: ((CGFloat) -> Void)?
    var canPan = false
    var tapAimW = false

    private let art = Art.shared
    private let world = SKNode()
    private let overlay = SKNode()
    private var T = 0.0
    private var lastTime: TimeInterval?
    private var rng = Rng(seed: 99)
    private func R() -> Double { rng.next() }

    // Depth: ground, map marks, units sorted by y, darkness, then the lit pass and effects.
    private enum Z {
        static let ground: CGFloat = 0, water: CGFloat = 1, rules: CGFloat = 2, plots: CGFloat = 3, rune: CGFloat = 4
        static func unit(_ y: Double) -> CGFloat { 10 + CGFloat(y) / 100 }
        static let smoke: CGFloat = 20, clouds: CGFloat = 21, dark: CGFloat = 30, sun: CGFloat = 31
        static func emit(_ y: Double) -> CGFloat { 40 + CGFloat(y) / 100 }
        static let shots: CGFloat = 50, fx: CGFloat = 51, ranges: CGFloat = 52, crows: CGFloat = 53
        static let vignette: CGFloat = 60, flash: CGFloat = 61, coins: CGFloat = 62, floats: CGFloat = 63
    }

    init(battle: Battle) {
        self.battle = battle
        super.init(size: CGSize(width: World.width, height: World.height))
        scaleMode = .aspectFit
        backgroundColor = UIColor(0xe4, 0xdc, 0xcb)
        anchorPoint = .zero
        addChild(world)
        addChild(overlay)
        load()
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    /* ------------------------------------------------------------------ setup */

    private var posts: [Vec] = []
    private var waters: [(path: CGPath, w: Double)] = []
    private var waterNodes: [(glint: SKShapeNode, lava: SKShapeNode?, path: CGPath)] = []
    private var drainWaterNodes: [(idx: Int, wet: SKShapeNode, glint: SKShapeNode, dry: SKShapeNode, path: CGPath)] = []
    private var dynRoadNodes: [(road: RoadRt, fill: SKShapeNode, dash: SKShapeNode)] = []
    private var riftWarnNodes: [(road: RoadRt, line: SKShapeNode, badge: SKNode)] = []
    private var portalNodes: [(arc: SKShapeNode, fromDot: SKShapeNode, toDot: SKShapeNode, glowA: SKSpriteNode, glowB: SKSpriteNode)] = []
    private var switchNodes: [(ring: SKShapeNode, lever: SKShapeNode, knob: SKShapeNode, arc: SKShapeNode, boost: SKShapeNode, gateBar: SKShapeNode, gateDash: SKShapeNode)] = []
    /// The state each lever was last drawn in, so its path is rebuilt only when it flips.
    private var leverState: [Int] = []
    private var sanctuaryNodes: [SKShapeNode] = []
    private var rainNodes: [SKShapeNode] = []
    private var lighthouseBeam: SKShapeNode?
    private var plotNodes: [PlotNode] = []
    private var shiftNodes: [SKNode] = []
    private var barrierNodes: [String: (whole: SKSpriteNode, down: SKSpriteNode, bar: Bar)] = [:]
    private var beltNodes: [(dash: SKShapeNode, path: CGPath)] = []
    private var ventNodes: [(SKShapeNode, SKSpriteNode)] = []
    private var postFlames: [(SKSpriteNode, SKSpriteNode, Double)] = []
    private let runeNode = SKNode()
    private let runeHex = SKShapeNode()
    private let runeGlow = SKSpriteNode()
    private let dark = SKSpriteNode()
    private let sunWash = SKSpriteNode()
    private let vignette = SKSpriteNode()
    private let flashNode = SKSpriteNode(color: .white, size: CGSize(width: World.width, height: World.height))
    private var hero: HeroNode!
    private var ranges: [SKShapeNode] = []
    private var rangeKey = ""

    private func load() {
        let st = battle.stage
        // The ground, painted once by the web painters with the plots and rifts set into it.
        let ground = SKSpriteNode()
        if let u = ArtFiles.url(String(format: "ground-%02d", st.id), "jpg"), let img = UIImage(contentsOfFile: u.path) {
            ground.texture = SKTexture(image: img)
        }
        ground.size = size
        ground.anchorPoint = .zero
        ground.zPosition = Z.ground
        world.addChild(ground)

        let meta = ArtFiles.maps[st.id]
        posts = (meta?.posts ?? []).map { Vec($0[0], $0[1]) }
        // Baked water lines are used only while they still match the stage; after a stale bake the engine's own paths stand in.
        let baked = meta?.waters ?? []
        let bakedFits = baked.count == st.waters.count && zip(baked, st.waters).allSatisfy { m, w in
            guard let p = m.pts.first, p.count >= 2, let c = w.ctrl.first else { return false }
            return abs(p[0] - c.x) < 1 && abs(p[1] - c.y) < 1 && abs(m.w - w.w) < 0.5
        }
        // Waters that can drain or flood: on a set wave, or named by a terraform.
        let shifting = Set((st.terraforms ?? []).flatMap { $0.waters ?? [] })
        for (idx, w) in battle.waters.enumerated() {
            let pts: [CGPoint] = bakedFits
                ? baked[idx].pts.filter { $0.count >= 2 }.map { P($0[0], $0[1]) }
                : w.path.pts.map { P($0.x, $0.y) }
            let path = CGMutablePath()
            path.addLines(between: pts)
            waters.append((path, w.w))
            let byWave = idx < st.waters.count && st.waters[idx].drainAtWave != nil
            let byTerraform = w.id.map { shifting.contains($0) } ?? false
            if byWave || byTerraform {
                let wet = SKShapeNode(path: path); wet.lineCap = .round; wet.lineJoin = .round; wet.lineWidth = w.w
                wet.strokeColor = st.isLava ? UIColor(110, 40, 18, 0.92) : UIColor(56, 112, 138, 0.86); wet.zPosition = Z.water
                let glint = SKShapeNode(); glint.lineCap = .round; glint.lineJoin = .round; glint.blendMode = .add; glint.lineWidth = 1.8
                glint.strokeColor = st.isLava ? UIColor(255, 140, 60, 0.4) : UIColor(220, 235, 245, 0.32); glint.zPosition = Z.water + 0.01
                let dry = SKShapeNode(path: path); dry.lineCap = .round; dry.lineJoin = .round; dry.lineWidth = w.w * 0.92
                dry.strokeColor = st.isLava ? UIColor(66, 54, 48, 0.88) : UIColor(154, 142, 118, 0.84); dry.zPosition = Z.water; dry.isHidden = true
                world.addChild(wet); world.addChild(glint); world.addChild(dry)
                drainWaterNodes.append((idx, wet, glint, dry, path))
            } else {
                let glint = SKShapeNode()
                glint.lineCap = .round; glint.lineJoin = .round; glint.blendMode = .add; glint.zPosition = Z.water
                var lava: SKShapeNode?
                if st.isLava {
                    let l = SKShapeNode(path: path)
                    l.lineWidth = w.w * 0.55; l.lineCap = .round; l.lineJoin = .round; l.blendMode = .add; l.zPosition = Z.water
                    world.addChild(l); lava = l
                    glint.strokeColor = UIColor(255, 220, 140, 0.35); glint.lineWidth = 2
                } else {
                    glint.strokeColor = UIColor(220, 235, 245, 0.3); glint.lineWidth = 1.6
                }
                world.addChild(glint)
                waterNodes.append((glint, lava, path))
            }
        }
        // Dynamically awakened roads (openAtWave or openOnPhase once activated).
        for r in battle.roads where r.def.openAtWave != nil || r.def.openOnPhase != nil {
            let p = CGMutablePath()
            for (i, pt) in r.path.pts.enumerated() { i == 0 ? p.move(to: P(pt.x, pt.y)) : p.addLine(to: P(pt.x, pt.y)) }
            let fill = SKShapeNode(path: p); fill.lineCap = .round; fill.lineJoin = .round; fill.lineWidth = r.def.w
            fill.strokeColor = st.isLava ? UIColor(46, 38, 34, 0.92) : UIColor(192, 172, 138, 0.9); fill.zPosition = Z.water + 0.02
            let dash = SKShapeNode(path: p.copy(dashingWithPhase: 0, lengths: [6, 12])); dash.lineCap = .round; dash.lineWidth = 2
            dash.strokeColor = UIColor(24, 20, 16, 0.24); dash.zPosition = Z.water + 0.03
            fill.isHidden = !r.active; dash.isHidden = !r.active
            world.addChild(fill); world.addChild(dash)
            dynRoadNodes.append((r, fill, dash))
        }

        buildMapRules()
        for (i, p) in battle.plots.enumerated() { let n = PlotNode(plot: p, index: i, lava: st.isLava); world.addChild(n.root); plotNodes.append(n) }

        // Sanctuary perimeter arc around each Keep Gate.
        for g in battle.gate {
            let r = battle.data.hero.gateRadius
            let el = CGPath(ellipseIn: CGRect(x: -r, y: -r / World.ySquash, width: r * 2, height: r * 2 / World.ySquash), transform: nil)
            let ring = SKShapeNode(path: el.copy(dashingWithPhase: 0, lengths: [6, 8]))
            ring.position = P(g.x, g.y); ring.lineWidth = 1.6; ring.zPosition = Z.rules + 0.02; ring.isHidden = true
            world.addChild(ring)
            sanctuaryNodes.append(ring)
        }

        // Rune.
        runeNode.zPosition = Z.rune
        let rs = SKSpriteNode(texture: art.shadow); rs.size = CGSize(width: 32, height: 10); rs.position = CGPoint(x: 0, y: -4); rs.alpha = 0.5
        runeNode.addChild(rs)
        let hex = CGMutablePath()
        for k in 0..<6 { let a = Double(k) / 6 * .pi * 2; let p = CGPoint(x: cos(a) * 13, y: sin(a) * 13); k == 0 ? hex.move(to: p) : hex.addLine(to: p) }
        hex.closeSubpath()
        runeHex.path = hex; runeHex.fillColor = UIColor(hex: 0x1a1c20); runeHex.lineWidth = 2.5
        runeNode.addChild(runeHex)
        runeGlow.texture = art.glow; runeGlow.blendMode = .add; runeGlow.colorBlendFactor = 1; runeGlow.size = CGSize(width: 68, height: 68); runeGlow.alpha = 0.55
        runeNode.addChild(runeGlow)
        runeNode.isHidden = true
        world.addChild(runeNode)

        // Gates and lantern posts.
        for g in battle.gate {
            let s = art.sprite("gate"); s.position = P(g.x, g.y); s.zPosition = Z.unit(g.y); world.addChild(s)
            let e = art.sprite("gate-e"); e.position = P(g.x, g.y); e.zPosition = Z.emit(g.y); e.blendMode = .add; world.addChild(e)
        }
        for p in posts {
            let s = art.sprite("post"); s.position = P(p.x, p.y); s.zPosition = Z.unit(p.y); world.addChild(s)
            let glow = glowSprite(color: UIColor(hex: 0xff9a3a), r: 10, a: 0.25); glow.position = P(p.x, p.y - 34); glow.zPosition = Z.emit(p.y); world.addChild(glow)
            let flame = SKSpriteNode(color: UIColor(hex: 0xffd08a), size: CGSize(width: 4, height: 6)); flame.anchorPoint = CGPoint(x: 0.5, y: 1)
            flame.position = P(p.x, p.y - 37); flame.zPosition = Z.emit(p.y) + 0.001; world.addChild(flame)
            postFlames.append((glow, flame, p.x))
        }
        if let lh = st.lighthouse {
            let beamPath = CGMutablePath()
            beamPath.move(to: CGPoint(x: 0, y: -10)); beamPath.addLine(to: CGPoint(x: 380, y: -76))
            beamPath.addLine(to: CGPoint(x: 380, y: 76)); beamPath.addLine(to: CGPoint(x: 0, y: 10)); beamPath.closeSubpath()
            let beam = SKShapeNode(path: beamPath); beam.fillColor = UIColor(255, 230, 175, 0.16); beam.strokeColor = .clear
            beam.blendMode = .add; beam.position = P(lh.x, lh.y - 110); beam.zPosition = Z.emit(lh.y) - 0.001
            world.addChild(beam); lighthouseBeam = beam
            let g = glowSprite(color: UIColor(hex: 0xffe6b0), r: 62, a: 0.55); g.position = P(lh.x, lh.y - 110); g.zPosition = Z.emit(lh.y); world.addChild(g)
        }
        if st.weather == "rain" {
            for _ in 0..<65 {
                let path = CGMutablePath(); path.move(to: .zero); path.addLine(to: CGPoint(x: -14, y: -28))
                let s = SKShapeNode(path: path); s.strokeColor = UIColor(195, 222, 245, 0.24); s.lineWidth = 1.1; s.lineCap = .round; s.zPosition = Z.fx
                world.addChild(s); rainNodes.append(s)
            }
        }

        hero = HeroNode(art: art)
        hero.add(to: world)

        dark.anchorPoint = .zero; dark.size = size; dark.zPosition = Z.dark; dark.isHidden = true
        world.addChild(dark)
        sunWash.texture = st.isLava ? Art.sun((1, 170 / 255, 110 / 255), 0.55) : Art.sun((1, 232 / 255, 180 / 255), 0.32)
        sunWash.anchorPoint = .zero; sunWash.size = size; sunWash.zPosition = Z.sun; sunWash.blendMode = .screen; sunWash.alpha = 0.7
        world.addChild(sunWash)
        for _ in 0..<6 {
            let r = SKShapeNode(); r.zPosition = Z.ranges; r.lineWidth = 1.5; r.isHidden = true
            world.addChild(r); ranges.append(r)
        }

        vignette.texture = Art.vignette(); vignette.anchorPoint = .zero; vignette.size = size; vignette.zPosition = Z.vignette
        overlay.addChild(vignette)
        flashNode.anchorPoint = .zero; flashNode.zPosition = Z.flash; flashNode.alpha = 0
        overlay.addChild(flashNode)
    }

    private func buildMapRules() {
        let st = battle.stage
        // Telegraphed Wave+1 breaches (dashed red-orange path + '!' rift beacon).
        for r in battle.roads where r.def.openAtWave != nil {
            let p = CGMutablePath()
            for (i, pt) in r.path.pts.enumerated() { i == 0 ? p.move(to: P(pt.x, pt.y)) : p.addLine(to: P(pt.x, pt.y)) }
            let line = SKShapeNode(); line.lineWidth = 3; line.zPosition = Z.rules
            line.strokeColor = UIColor(218, 86, 52, 0.42); line.isHidden = !r.telegraph
            line.path = p.copy(dashingWithPhase: 0, lengths: [8, 10])
            let badge = SKNode(); let p0 = r.path.point(at: 36); badge.position = P(p0.x, p0.y); badge.zPosition = Z.rules + 0.02
            let disc = SKShapeNode(circleOfRadius: 13); disc.fillColor = UIColor(28, 16, 14, 0.86)
            disc.strokeColor = UIColor(hex: 0xff8a50); disc.lineWidth = 2
            let ex = SKLabelNode(text: "!"); ex.fontName = "Barlow-ExtraBold"; ex.fontSize = 13; ex.fontColor = UIColor(hex: 0xffe6b8)
            ex.verticalAlignmentMode = .center; ex.horizontalAlignmentMode = .center
            badge.addChild(disc); badge.addChild(ex); badge.isHidden = !r.telegraph
            world.addChild(line); world.addChild(badge)
            riftWarnNodes.append((r, line, badge))
        }
        // Portals / Chutes / Drift Rifts with quadratic directional flow arcs.
        for pt in battle.portals {
            let col = pt.def.kind == .rift ? UIColor(hex: 0xff7a3a) : pt.def.kind == .chute ? UIColor(hex: 0xe5a444) : UIColor(hex: 0x5ad8ff)
            let arcPath = CGMutablePath()
            let a = P(pt.fromPos.x, pt.fromPos.y), b = P(pt.toPos.x, pt.toPos.y)
            let midY = max(a.y, b.y) + 42
            arcPath.move(to: a); arcPath.addQuadCurve(to: b, control: CGPoint(x: (a.x + b.x) / 2, y: midY))
            let arc = SKShapeNode(path: arcPath.copy(dashingWithPhase: 0, lengths: [5, 7]))
            arc.strokeColor = col; arc.lineWidth = 1.6; arc.zPosition = Z.rules
            let dotA = SKShapeNode(ellipseOf: CGSize(width: 32, height: 16))
            dotA.fillColor = UIColor(18, 22, 26, 0.8); dotA.strokeColor = col; dotA.lineWidth = 2; dotA.position = a; dotA.zPosition = Z.rules
            let dotB = SKShapeNode(ellipseOf: CGSize(width: 32, height: 16))
            dotB.fillColor = UIColor(18, 22, 26, 0.8); dotB.strokeColor = col; dotB.lineWidth = 2; dotB.position = b; dotB.zPosition = Z.rules
            let glowA = glowSprite(color: col, r: 16, a: 0.35); glowA.position = a; glowA.zPosition = Z.emit(pt.fromPos.y)
            let glowB = glowSprite(color: col, r: 16, a: 0.35); glowB.position = b; glowB.zPosition = Z.emit(pt.toPos.y)
            world.addChild(arc); world.addChild(dotA); world.addChild(dotB); world.addChild(glowA); world.addChild(glowB)
            portalNodes.append((arc, dotA, dotB, glowA, glowB))
        }
        // Interactive tactical switches (fork / gate / belt).
        for sw in battle.switches {
            let sp = P(sw.def.at.x, sw.def.at.y)
            let ring = SKShapeNode(ellipseOf: CGSize(width: 32, height: 16))
            ring.fillColor = UIColor(hex: 0x2d2924); ring.lineWidth = 1.8; ring.position = CGPoint(x: sp.x, y: sp.y - 2); ring.zPosition = Z.rules + 0.01
            let lever = SKShapeNode(); lever.strokeColor = UIColor(hex: 0xd8cbb4); lever.lineWidth = 3; lever.lineCap = .round
            lever.position = sp; lever.zPosition = Z.rules + 0.02
            let knob = SKShapeNode(circleOfRadius: 4.5); knob.lineWidth = 0; knob.position = sp; knob.zPosition = Z.rules + 0.03
            let arc = SKShapeNode(); arc.lineWidth = 2.5; arc.position = CGPoint(x: sp.x, y: sp.y + 6); arc.zPosition = Z.rules + 0.03
            let boost = SKShapeNode(ellipseOf: CGSize(width: 44, height: 22))
            boost.strokeColor = UIColor(255, 214, 140, 0.75); boost.lineWidth = 1.4; boost.fillColor = .clear
            boost.position = CGPoint(x: sp.x, y: sp.y - 2); boost.zPosition = Z.rules + 0.01; boost.isHidden = true
            let barPath = CGMutablePath(); barPath.move(to: CGPoint(x: -26, y: 0)); barPath.addLine(to: CGPoint(x: 26, y: 0))
            let gateBar = SKShapeNode(path: barPath); gateBar.strokeColor = UIColor(hex: 0xd98a2b); gateBar.lineWidth = 6
            gateBar.position = CGPoint(x: sp.x, y: sp.y + 6); gateBar.zPosition = Z.rules + 0.02; gateBar.isHidden = true
            let gateDash = SKShapeNode(path: barPath.copy(dashingWithPhase: 0, lengths: [7, 7])); gateDash.strokeColor = UIColor(hex: 0x1d1914)
            gateDash.lineWidth = 6; gateDash.position = CGPoint(x: sp.x, y: sp.y + 6); gateDash.zPosition = Z.rules + 0.025; gateDash.isHidden = true
            world.addChild(ring); world.addChild(lever); world.addChild(knob); world.addChild(arc); world.addChild(boost)
            world.addChild(gateBar); world.addChild(gateDash)
            switchNodes.append((ring, lever, knob, arc, boost, gateBar, gateDash))
            leverState.append(-1)
        }
        // Tides and lava closures.
        for s in st.shifts ?? [] {
            let n = SKNode(); n.position = P(s.at.x, s.at.y); n.zPosition = Z.rules
            if s.kind == "lava" {
                let pool = SKSpriteNode(texture: art.soft); pool.name = "pool"; pool.colorBlendFactor = 1
                n.addChild(pool)
                let glow = glowSprite(color: UIColor(hex: 0xff7a2a), r: s.r * 1.4, a: 0.35); glow.name = "glow"
                n.addChild(glow)
            } else {
                let water = SKShapeNode(ellipseOf: CGSize(width: s.r * 2.4, height: s.r * 1.4))
                water.fillColor = UIColor(70, 110, 140, 0.85); water.lineWidth = 0; water.name = "on"
                let edge = SKShapeNode(); edge.name = "edge"; edge.strokeColor = UIColor(220, 240, 255, 0.45); edge.lineWidth = 1.5
                water.addChild(edge)
                n.addChild(water)
                let stones = SKNode(); stones.name = "off"
                for k in 0..<6 {
                    let e = SKShapeNode(ellipseOf: CGSize(width: 12, height: 7)); e.fillColor = UIColor(hex: 0x4a4945); e.lineWidth = 0
                    e.position = CGPoint(x: -20 + Double(k) * 8, y: -(10 - Double(k) * 6)); stones.addChild(e)
                }
                n.addChild(stones)
            }
            world.addChild(n); shiftNodes.append(n)
        }
        // Wrecks across a road.
        for r in battle.roads {
            guard let bar = r.barrier else { continue }
            let whole = art.sprite("wreck"); whole.position = P(bar.x, bar.y); whole.zPosition = Z.rules
            let down = art.sprite("wreck-down"); down.position = P(bar.x, bar.y); down.zPosition = Z.rules
            let b = Bar(width: 34, color: UIColor(hex: 0xc89a5a)); b.place(x: bar.x, y: bar.y - 70); b.root.zPosition = Z.rules + 0.01
            world.addChild(whole); world.addChild(down); world.addChild(b.root)
            barrierNodes[r.def.id] = (whole, down, b)
        }
        // Belts: iron plates with moving chevrons.
        for r in battle.roads {
            for bt in r.belts {
                let path = CGMutablePath()
                var d = bt.from, first = true
                while d <= bt.to { let p = r.path.point(at: d); first ? path.move(to: P(p.x, p.y)) : path.addLine(to: P(p.x, p.y)); first = false; d += 8 }
                let plate = SKShapeNode(path: path); plate.strokeColor = UIColor(40, 38, 36, 0.75); plate.lineWidth = r.def.w * 0.8; plate.lineCap = .butt; plate.zPosition = Z.rules
                let dash = SKShapeNode(); dash.strokeColor = UIColor(200, 160, 90, 0.35); dash.lineWidth = r.def.w * 0.6; dash.lineCap = .butt; dash.zPosition = Z.rules + 0.01
                world.addChild(plate); world.addChild(dash)
                beltNodes.append((dash, path))
            }
        }
        // Vents.
        for v in battle.vents {
            let e = SKShapeNode(ellipseOf: CGSize(width: 44, height: 18)); e.fillColor = UIColor(hex: 0x26221e); e.strokeColor = UIColor(hex: 0x5a5048); e.lineWidth = 2
            e.position = P(v.x, v.y); e.zPosition = Z.rules
            let g = glowSprite(color: UIColor(hex: 0xffb070), r: 18, a: 0.15); g.position = P(v.x, v.y); g.zPosition = Z.rules + 0.01
            world.addChild(e); world.addChild(g)
            ventNodes.append((e, g))
        }
    }

    func glowSprite(color: UIColor, r: Double, a: Double) -> SKSpriteNode {
        let s = SKSpriteNode(texture: art.glow)
        s.color = color; s.colorBlendFactor = 1; s.blendMode = .add
        s.size = CGSize(width: r * 2, height: r * 2); s.alpha = a
        return s
    }

    /* ------------------------------------------------------------------ loop */

    override func update(_ currentTime: TimeInterval) {
        let dt = lastTime.map { min(0.05, max(0, currentTime - $0)) } ?? 0
        lastTime = currentTime
        T += dt
        let simDt = look.aiming ? dt * 0.25 : dt
        let events = onFrame?(dt) ?? []
        consume(events)
        render(dt: battle.paused ? 0 : simDt)
    }

    /// Draw one still frame without running the loop (the title screen).
    func renderStill() {
        consume(battle.drain())
        render(dt: 0)
    }

    private var shake = 0.0
    private var flash = 0.0

    private func render(dt: Double) {
        let b = battle, st = b.stage
        step(dt)
        stepGaits(dt)
        if shake > 0 && !look.reduceMotion { world.position = CGPoint(x: (R() - 0.5) * shake, y: (R() - 0.5) * shake) } else { world.position = .zero }

        // Water glints, drainable channels, dynamic roads, lighthouse beam & Sanctuary perimeter.
        for (i, w) in waterNodes.enumerated() {
            if let lava = w.lava { lava.strokeColor = UIColor(255, 110 + 30 * sin(T * 2), 40, 0.35); _ = i }
            let lengths: [CGFloat] = st.isLava ? [10, 26, 4, 30] : [6, 30, 14, 46]
            let total = lengths.reduce(0, +)
            let speed = st.isLava ? 18.0 : 26.0
            w.glint.path = w.path.copy(dashingWithPhase: total - CGFloat((T * speed).truncatingRemainder(dividingBy: Double(total))), lengths: lengths)
        }
        for dw in drainWaterNodes {
            let drained = dw.idx < b.waters.count ? b.waters[dw.idx].drained : false
            dw.wet.isHidden = drained; dw.glint.isHidden = drained; dw.dry.isHidden = !drained
            if !drained {
                let lengths: [CGFloat] = [6, 26, 12, 40], total = lengths.reduce(0, +)
                dw.glint.path = dw.path.copy(dashingWithPhase: total - CGFloat((T * 24).truncatingRemainder(dividingBy: Double(total))), lengths: lengths)
            }
        }
        for dr in dynRoadNodes { dr.fill.isHidden = !dr.road.active; dr.dash.isHidden = !dr.road.active }
        for (i, ring) in sanctuaryNodes.enumerated() where i < b.gate.count {
            if look.still || b.hero.dead { ring.isHidden = true; continue }
            let g = b.gate[i]
            let near = hypot2(g.x - b.hero.x, g.y - b.hero.y) < b.data.hero.gateRadius
            let show = near || b.hero.hp < b.heroMaxHp() * 0.85
            ring.isHidden = !show
            ring.strokeColor = near ? UIColor(128, 210, 110, 0.36) : UIColor(235, 195, 120, 0.2)
        }
        if let beam = lighthouseBeam, !look.reduceMotion { beam.zRotation = -CGFloat(T * 0.65) }
        for (i, rn) in rainNodes.enumerated() {
            let show = !look.reduceMotion && !look.still
            rn.isHidden = !show
            if show {
                let rx = (Double(i * 97) + T * 420).truncatingRemainder(dividingBy: World.width + 120) - 60
                let ry = (Double(i * 71) + T * 880).truncatingRemainder(dividingBy: World.height + 80) - 40
                rn.position = P(rx, ry)
            }
        }
        drawMapRules()
        drawPlots()
        drawRune()
        syncTowers()
        syncFoes()
        hero.update(b, look: look, T: T, moveMark: moveMark)
        drawParts()
        drawClouds()
        drawLight()
        drawShots()
        drawFx()
        drawRanges()
        drawCrows(dt)
        vignette.alpha = b.night ? 0.7 : 0.16
        flashNode.alpha = look.reduceMotion ? 0 : flash * 0.35
        flashNode.color = b.status == .lost ? UIColor(255, 80, 60) : UIColor(255, 230, 180)
        drawCoins()
        drawFloats()
    }

    private func step(_ dt: Double) {
        shake = max(0, shake - dt * 20)
        flash = max(0, flash - dt * 1.5)
        for i in parts.indices {
            parts[i].x += parts[i].vx * dt; parts[i].y += parts[i].vy * dt
            if parts[i].grav { parts[i].vy += 380 * dt }
            parts[i].life -= dt
        }
        parts.removeAll { $0.life <= 0 }
        if parts.count > 600 { parts.removeFirst(parts.count - 600) }
        for f in fx { if f.kind == .ring { f.r += dt * 320 } else { f.life -= dt } }
        fx.removeAll { f in
            let done = f.kind == .ring ? f.r >= f.max : f.life <= 0
            if done { f.node.removeFromParent() }
            return done
        }
        for i in coins.indices {
            coins[i].u += dt * 1.3
            let c = coins[i]
            coins[i].x = c.sx + (40 - c.sx) * c.u * c.u
            coins[i].y = c.sy + (20 - c.sy) * c.u - sin(c.u * .pi) * 120
        }
        coins.removeAll { $0.u >= 1 }
        for f in floats { f.life -= dt; f.y -= dt * (f.big ? 26 : 40) }
        floats.removeAll { f in if f.life <= 0 { f.node.removeFromParent(); return true }; return false }
        if var m = moveMark { m.t -= dt; moveMark = m.t > 0 ? m : nil }
    }

    /* ------------------------------------------------------------------ events to effects */

    private struct Part { var x, y, vx, vy, life, max: Double; var color: UIColor; var s: Double; var kind: PartKind; var grav = false }
    private enum PartKind { case smoke, spark, chip }
    private var parts: [Part] = []
    private var fx: [Fx] = []
    private var floats: [FloatText] = []
    private var coins: [(sx: Double, sy: Double, u: Double, x: Double, y: Double)] = []
    private var moveMark: (x: Double, y: Double, t: Double)?

    func markMove(_ x: Double, _ y: Double) { moveMark = (x, y, 0.6) }

    private func consume(_ events: [BattleEvent]) {
        let b = battle, TAU = Double.pi * 2
        for e in events {
            switch e {
            case let .pulse(_, x, y, r): addFx(.ring, x, y, r: 0, max: r, life: 1, color: UIColor(170, 220, 255))
            case let .arc(pts): let f = addFx(.arc, 0, 0, r: 0, max: 0.18, life: 0.18); f.pts = pts; f.seed = Int(R() * 999)
            case let .boom(x, y, r):
                addFx(.boom, x, y, r: r, max: 0.45, life: 0.45)
                shake = max(shake, 4)
                for _ in 0..<14 { let a = R() * TAU, v = 60 + R() * 160; parts.append(Part(x: x, y: y, vx: cos(a) * v, vy: sin(a) * v * 0.5 - 90, life: 0.8, max: 0.8, color: UIColor(hex: 0x2a241c), s: 2.6, kind: .chip, grav: true)) }
                for _ in 0..<3 { parts.append(Part(x: x + (R() - 0.5) * 26, y: y - 4, vx: (R() - 0.5) * 20, vy: -14, life: 0.9, max: 0.9, color: UIColor(150, 142, 130), s: 6, kind: .smoke)) }
            case let .root(x, y):
                for _ in 0..<8 { parts.append(Part(x: x + (R() - 0.5) * 30, y: y, vx: (R() - 0.5) * 40, vy: -50 - R() * 50, life: 0.6, max: 0.6, color: UIColor(hex: 0x3a3326), s: 2.6, kind: .chip, grav: true)) }
            case let .hit(x, y, dmg, crit, source):
                let c = elementColor(source)
                for _ in 0..<3 { let a = R() * TAU; parts.append(Part(x: x, y: y, vx: cos(a) * 80, vy: sin(a) * 80, life: 0.3, max: 0.3, color: c, s: 1.6, kind: .spark)) }
                if look.dmgNumbers && crit { float(x, y - 10, "\(Int(dmg.rounded()))!", UIColor(hex: 0xffe6b0), big: true) }
                else if look.dmgNumbers, case .element(.hero) = source { float(x, y - 6, "\(Int(dmg.rounded()))", UIColor(hex: 0xe8f2ff), big: false) }
            case let .kill(x, y, kind, gold, byHero):
                coins.append((x, y - 20, 0, x, y))
                goldPop(x + 12, y - 46, gold, byHero)
                for _ in 0..<10 { let a = R() * TAU; parts.append(Part(x: x, y: y - 10, vx: cos(a) * 60, vy: -30 - R() * 60, life: 0.9, max: 0.9, color: UIColor(hex: 0x5ac8a8), s: 1.8, kind: .spark)) }
                for _ in 0..<2 { parts.append(Part(x: x + (R() - 0.5) * 16, y: y - 6, vx: 0, vy: -16, life: 0.8, max: 0.8, color: UIColor(60, 80, 72), s: 5, kind: .smoke)) }
                if [EnemyKind.mireking, .tidewyrm, .colossus, .queen].contains(kind) { shake = 12; flash = 0.6 }
            case let .leak(x, y, lives, _, _): flash = max(flash, 0.25); float(x, y - 50, "-\(lives)", UIColor(hex: 0xff6a5a), big: true)
            case let .vent(x, y): addFx(.steam, x, y, r: 0, max: 1.2, life: 1.2); shake = max(shake, 2)
            case let .skill(key, x, y):
                if key == .q { addFx(.slash, x, y, r: 100, max: 0.4, life: 0.4) }
                if key == .w { addFx(.lantern, x, y, r: b.data.snare.radius, max: 0.7, life: 0.7) }
                if key == .r { addFx(.sun, x, y, r: 0, max: 1.4, life: 1.4); shake = 7 }
            case .level: addFx(.ring, b.hero.x, b.hero.y, r: 0, max: 70, life: 1, color: UIColor(255, 215, 140))
            case let .phase(_, x, y): addFx(.ring, x, y, r: 0, max: 360, life: 1, color: UIColor(120, 230, 200)); shake = 10
            case let .dive(x, y, _): addFx(.splash, x, y, r: 0, max: 0.8, life: 0.8)
            case let .stamp(x, y, r):
                addFx(.ring, x, y, r: 0, max: r, life: 0.7, color: UIColor(120, 230, 190)); shake = max(shake, 5)
                for _ in 0..<10 { let a = R() * TAU, v = 50 + R() * 90; parts.append(Part(x: x + cos(a) * 20, y: y, vx: cos(a) * v, vy: -40 - R() * 60, life: 0.7, max: 0.7, color: UIColor(hex: 0x4a4238), s: 2.6, kind: .chip, grav: true)) }
            case let .pane(x, y, _):
                for _ in 0..<9 { let a = R() * TAU, v = 50 + R() * 80; parts.append(Part(x: x, y: y, vx: cos(a) * v, vy: sin(a) * v * 0.5 - 60, life: 0.55, max: 0.55, color: UIColor(hex: 0xe6f4fa), s: 2.2, kind: .chip, grav: true)) }
            case let .lunge(x, y):
                for _ in 0..<4 { parts.append(Part(x: x + (R() - 0.5) * 14, y: y - 4, vx: (R() - 0.5) * 24, vy: -18, life: 0.6, max: 0.6, color: UIColor(110, 96, 84), s: 4, kind: .smoke)) }
            case let .build(_, x, y), let .upgrade(_, x, y):
                for _ in 0..<12 { let a = R() * TAU; parts.append(Part(x: x + cos(a) * 20, y: y + sin(a) * 8, vx: cos(a) * 30, vy: -20 - R() * 30, life: 0.8, max: 0.8, color: UIColor(150, 140, 120), s: 6, kind: .smoke)) }
            case .heroDown: float(b.hero.x, b.hero.y - 80, "Wren falls", UIColor(hex: 0xff8a7a), big: true)
            case .revive: addFx(.sun, b.hero.x, b.hero.y, r: 0, max: 1, life: 1)
            case let .rune(kind, picked): if picked { let d = b.data.rune(kind); float(b.hero.x, b.hero.y - 80, d.name, UIColor(css: d.color), big: true) }
            case let .riftWarn(road, _):
                if let r = b.roads.first(where: { $0.def.id == road }) {
                    let p = r.path.point(at: 36)
                    addFx(.ring, p.x, p.y, r: 0, max: 85, life: 1.1, color: UIColor(255, 155, 70))
                }
            case let .riftOpen(road):
                if let r = b.roads.first(where: { $0.def.id == road }) {
                    let p = r.path.point(at: 36)
                    addFx(.ring, p.x, p.y, r: 0, max: 140, life: 1, color: UIColor(96, 226, 180))
                    shake = max(shake, 5)
                }
            case let .clearPlot(plot, free):
                if plot >= 0 && plot < b.plots.count {
                    let pl = b.plots[plot]
                    for _ in 0..<10 { let a = R() * TAU; parts.append(Part(x: pl.x, y: pl.y - 6, vx: cos(a) * 65, vy: sin(a) * 35 - 40, life: 0.65, max: 0.65, color: UIColor(hex: 0x7a6c58), s: 2.5, kind: .chip, grav: true)) }
                    addFx(.ring, pl.x, pl.y, r: 0, max: 52, life: 0.6, color: free ? UIColor(140, 220, 160) : UIColor(230, 190, 110))
                }
            case let .switchFlip(id, _, _):
                if let sw = b.switches.first(where: { $0.def.id == id }) {
                    let sx = sw.def.at.x, sy = sw.def.at.y
                    addFx(.ring, sx, sy, r: 0, max: 58, life: 0.65, color: UIColor(230, 185, 95))
                    for _ in 0..<6 { let a = R() * TAU; parts.append(Part(x: sx, y: sy - 10, vx: cos(a) * 55, vy: sin(a) * 40, life: 0.35, max: 0.35, color: UIColor(hex: 0xffd480), s: 2, kind: .spark)) }
                }
            case .terraform:
                shake = max(shake, 8)
                addFx(.ring, World.width / 2, World.height / 2, r: 0, max: 420, life: 0.9, color: UIColor(180, 220, 210))
            case let .warp(fx, fy, tx, ty, _):
                addFx(.ring, fx, fy, r: 0, max: 46, life: 0.55, color: UIColor(90, 210, 255))
                addFx(.ring, tx, ty, r: 0, max: 54, life: 0.65, color: UIColor(255, 150, 70))
            case let .gateShock(gx, gy):
                addFx(.ring, gx, gy, r: 0, max: 180, life: 0.85, color: UIColor(255, 215, 120))
                shake = max(shake, 6)
            default: break
            }
        }
    }

    private func elementColor(_ s: DamageSource) -> UIColor {
        switch s {
        case .env: return UIColor(hex: 0xffd9a0)
        case .element(let e):
            switch e {
            case .pierce: return UIColor(hex: 0xf0d6a8)
            case .fire: return UIColor(hex: 0xffb27a)
            case .frost: return UIColor(hex: 0xbfe6ff)
            case .storm: return UIColor(hex: 0xcfc6ff)
            case .nature: return UIColor(hex: 0xb8e6a0)
            case .hero: return UIColor(hex: 0xe8f2ff)
            }
        }
    }

    /* ------------------------------------------------------------------ floats */

    private final class FloatText {
        var x: Double, y: Double, text: String, color: UIColor, big: Bool, life: Double, max: Double
        var gold: Int?
        let node = SKLabelNode()
        init(x: Double, y: Double, text: String, color: UIColor, big: Bool) {
            self.x = x; self.y = y; self.text = text; self.color = color; self.big = big
            life = big ? 1.4 : 0.8; max = life
        }
    }

    /// Gold from kills close together in time and place adds up in one number instead of a stack.
    private func goldPop(_ x: Double, _ y: Double, _ gold: Int, _ byHero: Bool) {
        if let f = floats.first(where: { $0.gold != nil && $0.max - $0.life < 0.45 && hypot2($0.x - x, $0.y - y) < 95 }) {
            f.gold! += gold; f.text = "+\(f.gold!)"; f.life = f.max; f.y -= 3
            if byHero { f.color = UIColor(hex: 0xffd76a); f.big = true }
            return
        }
        float(x, y, "+\(gold)", byHero ? UIColor(hex: 0xffd76a) : UIColor(hex: 0xe8b34a), big: byHero)
        floats.last?.gold = gold
    }

    private func float(_ x: Double, _ y: Double, _ text: String, _ color: UIColor, big: Bool) {
        if floats.count > 28 { floats.removeFirst().node.removeFromParent() }
        let f = FloatText(x: x + (R() - 0.5) * 14, y: max(85, y), text: text, color: color, big: big)
        f.node.zPosition = Z.floats
        f.node.horizontalAlignmentMode = .center
        f.node.verticalAlignmentMode = .baseline
        overlay.addChild(f.node)
        floats.append(f)
    }

    private func drawFloats() {
        for f in floats {
            let a = min(1, f.life / f.max * 2.2), sc = f.big ? 1 + max(0, f.life / f.max - 0.75) * 2 : 1
            let size = CGFloat((f.big ? 24 : 15) * sc)
            let font = UIFont(name: "Cinzel-ExtraBold", size: size) ?? .boldSystemFont(ofSize: size)
            let key = "\(f.text)|\(Int(size * 4))|\(f.color.hashValue)"
            if f.node.name != key {
                f.node.name = key
                f.node.attributedText = NSAttributedString(string: f.text, attributes: [
                    .font: font, .foregroundColor: f.color, .strokeColor: UIColor(white: 0, alpha: 0.8), .strokeWidth: f.big ? -9 : -10,
                ])
            }
            f.node.position = P(f.x, f.y)
            f.node.alpha = a
        }
    }

    private var coinNodes: [SKSpriteNode] = []
    private func drawCoins() {
        while coinNodes.count < coins.count {
            let n = SKSpriteNode(texture: art.disc); n.color = UIColor(hex: 0xd9962a); n.colorBlendFactor = 1; n.zPosition = Z.coins
            overlay.addChild(n); coinNodes.append(n)
        }
        for (i, n) in coinNodes.enumerated() {
            guard i < coins.count else { n.isHidden = true; continue }
            let c = coins[i]
            n.isHidden = false
            n.position = P(c.x, c.y)
            n.size = CGSize(width: (4.5 * abs(cos(c.u * 12)) + 1) * 2, height: 9)
        }
    }

    /* ------------------------------------------------------------------ map */

    private func drawMapRules() {
        let b = battle, st = b.stage
        // Telegraphed Wave+1 breaches.
        for rw in riftWarnNodes {
            let show = rw.road.telegraph
            rw.line.isHidden = !show; rw.badge.isHidden = !show
            if show {
                rw.line.strokeColor = UIColor(218, 86, 52, look.reduceMotion ? 0.42 : 0.32 + 0.16 * sin(T * 4))
            }
        }
        // Portals / Chutes / Drift Rifts.
        for (i, pn) in portalNodes.enumerated() where i < b.portals.count {
            let active = b.portals[i].active
            let a = active ? 0.92 : 0.35
            pn.arc.alpha = a; pn.fromDot.alpha = a; pn.toDot.alpha = a
            pn.glowA.isHidden = !active; pn.glowB.isHidden = !active
            if active {
                let pulse = 0.35 + 0.1 * sin(T * 5)
                pn.glowA.alpha = pulse; pn.glowB.alpha = pulse
            }
        }
        // Interactive tactical switches (fork / gate / belt).
        for (i, sw) in b.switches.enumerated() where i < switchNodes.count {
            let sn = switchNodes[i]
            let active = sw.activeT > 0
            let ready = sw.cdLeft <= 0 && !active
            let col = active ? UIColor(hex: 0x5ee8c0) : ready ? UIColor(hex: 0xe6a83e) : UIColor(hex: 0x7a756c)
            sn.ring.strokeColor = col
            // The lever only moves when the switch flips: its path is rebuilt then, not every frame.
            if i < leverState.count, leverState[i] != sw.state {
                leverState[i] = sw.state
                let lean: Double = sw.state != 0 ? 10 : -10
                let lp = CGMutablePath()
                lp.move(to: .zero)
                lp.addLine(to: CGPoint(x: lean, y: 14))
                sn.lever.path = lp
                sn.knob.position = P(sw.def.at.x + lean, sw.def.at.y - 14)
            }
            sn.knob.fillColor = col
            sn.boost.isHidden = !sw.boosted
            if sw.cdLeft > 0 || active {
                let share = active ? sw.activeT / (sw.def.dur ?? 10) : 1 - sw.cdLeft / sw.def.cd
                let ap = CGMutablePath()
                ap.addArc(center: .zero, radius: 15, startAngle: .pi / 2, endAngle: .pi / 2 - share * .pi * 2, clockwise: true)
                sn.arc.path = ap
                sn.arc.strokeColor = active ? UIColor(hex: 0x6ff5d0) : UIColor(246, 240, 228, 0.75)
                sn.arc.isHidden = false
            } else {
                sn.arc.isHidden = true
            }
            let barOn = sw.def.mode == .gate && active
            sn.gateBar.isHidden = !barOn
            sn.gateDash.isHidden = !barOn
        }
        // Tides and lava closures.
        for (i, s) in (st.shifts ?? []).enumerated() where i < shiftNodes.count {
            let on = b.shiftActive(i), n = shiftNodes[i]
            if s.kind == "lava" {
                guard let pool = n.childNode(withName: "pool") as? SKSpriteNode, let glow = n.childNode(withName: "glow") as? SKSpriteNode else { continue }
                pool.size = CGSize(width: s.r * 1.3 * 2, height: s.r * 0.8 * 2)
                pool.color = on ? UIColor(230, 110, 40) : UIColor(255, 120, 40)
                pool.alpha = on ? 0.95 : 0.25
                pool.blendMode = on ? .alpha : .add
                glow.isHidden = !on
                glow.alpha = 0.35 + 0.1 * sin(T * 4)
            } else {
                n.childNode(withName: "on")?.isHidden = !on
                n.childNode(withName: "off")?.isHidden = on
                if on, let edge = n.childNode(withName: "on")?.childNode(withName: "edge") as? SKShapeNode {
                    let path = CGPath(ellipseIn: CGRect(x: -s.r * 1.05, y: -s.r * 0.58, width: s.r * 2.1, height: s.r * 1.16), transform: nil)
                    edge.path = path.copy(dashingWithPhase: CGFloat((T * 20).truncatingRemainder(dividingBy: 22)), lengths: [8, 14])
                }
            }
        }
        for r in b.roads {
            guard let bar = r.barrier, let n = barrierNodes[r.def.id] else { continue }
            n.whole.isHidden = bar.hp <= 0; n.bar.root.isHidden = bar.hp <= 0; n.down.isHidden = bar.hp > 0
            n.bar.set(bar.hp / bar.max)
        }
        for belt in beltNodes {
            belt.dash.path = belt.path.copy(dashingWithPhase: 18 - CGFloat((T * 60).truncatingRemainder(dividingBy: 18)), lengths: [4, 14])
        }
        for (i, v) in b.vents.enumerated() where i < ventNodes.count {
            let warn = v.t < 1.2
            ventNodes[i].1.color = warn ? UIColor(hex: 0xff7a3a) : UIColor(hex: 0xffb070)
            ventNodes[i].1.alpha = warn ? 0.5 + 0.3 * sin(T * 20) : 0.15
        }
    }

    private func drawPlots() {
        let b = battle
        let canAfford = b.stage.towers.contains { b.gold >= b.costOf($0) }
        for (i, p) in b.plots.enumerated() where i < plotNodes.count {
            let used = b.towers.contains { $0.plot == i }
            let gearUp = p.gear.map { b.gearUp($0) } ?? true
            plotNodes[i].update(p, used: used, gearUp: gearUp, hint: look.hintPlot == i && look.selPlot != i, selected: look.selPlot == i,
                                plus: canAfford && !b.over && gearUp, tidePearl: b.mods.tidePearl, T: T)
        }
    }

    private func drawRune() {
        guard let r = battle.rune else { runeNode.isHidden = true; return }
        let c = UIColor(css: battle.data.rune(r.kind).color), bob = sin(T * 3) * 4
        runeNode.isHidden = false
        runeNode.position = P(r.x, r.y)
        runeHex.position = CGPoint(x: 0, y: 26 - bob)
        runeHex.zRotation = -T
        runeHex.strokeColor = c
        runeGlow.position = runeHex.position
        runeGlow.color = c
    }

    /* ------------------------------------------------------------------ towers */

    private var towerNodes: [Int: TowerNode] = [:]
    static let towerLight: [TowerKind: (UIColor, Double)] = [
        .watch: (UIColor(hex: 0xff9a3a), 120), .cannon: (UIColor(hex: 0xff8a2a), 72), .bell: (UIColor(hex: 0x8fd0ff), 70),
        .pylon: (UIColor(hex: 0xa99cff), 150), .roots: (UIColor(hex: 0x7fd06a), 50), .beacon: (UIColor(hex: 0xffb050), 150),
    ]

    private func syncTowers() {
        var seen = Set<Int>()
        for t in battle.towers {
            seen.insert(t.id)
            let n = towerNodes[t.id] ?? {
                let n = TowerNode(tower: t, scene: self)
                towerNodes[t.id] = n
                return n
            }()
            n.update(t, battle: battle, T: T)
        }
        for (id, n) in towerNodes where !seen.contains(id) { n.remove(); towerNodes[id] = nil }
    }

    /* ------------------------------------------------------------------ foes */

    private struct Gait { var x, y, ph, v, face, hx, hy: Double; var tick: Int }
    private enum GaitKind { case crawl, scuttle, plod, stomp, fly }
    private static let gaitTable: [GaitKind: (stride: Double, lift: Double, rock: Double, surge: Double)] = [
        .crawl: (30, 0.8, 0, 0.035), .scuttle: (16, 2.2, 0, 0.02), .plod: (34, 1.4, 0.035, 0),
        .stomp: (70, 3, 0.025, 0.015), .fly: (60, 0, 0.04, 0),
    ]
    private static func gaitOf(_ f: Foe) -> GaitKind {
        if f.def.isFlying { return .fly }
        if f.def.isBoss { return .stomp }
        switch f.kind {
        case .skitter, .hound: return .scuttle
        case .shell, .sapper, .elite, .warden, .glasshide, .herald: return .plod
        case .ram: return .stomp
        default: return .crawl
        }
    }
    private var gaits: [Int: Gait] = [:]
    private var gaitTick = 0
    private func seedOf(_ f: Foe) -> Double { 40 + Double((f.id * 7) % 9) }

    /// Follow each foe from frame to frame: how far it moved, which way it heads, how it turns. Drawing only.
    private func stepGaits(_ dt: Double) {
        gaitTick += 1
        let tick = gaitTick
        for f in battle.foes {
            let seed = seedOf(f)
            var m = gaits[f.id] ?? Gait(x: f.x, y: f.y, ph: seed * 1.7 + Double(f.id) * 2.3, v: 1, face: f.dir == 0 ? 1 : f.dir, hx: f.dir == 0 ? 1 : f.dir, hy: 0, tick: tick)
            m.tick = tick
            if dt > 0 {
                let dx = f.x - m.x, dy = f.y - m.y, dist = hypot(dx, dy)
                m.x = f.x; m.y = f.y
                if dist <= 40 {
                    m.ph += dist / Self.gaitTable[Self.gaitOf(f)]!.stride * .pi * 2
                    let k = 1 - exp(-dt * 8)
                    m.v += (min(1.5, dist / dt / f.def.speed) - m.v) * k
                    if dist > 0.05 { let q = 1 - exp(-dt * 6); m.hx += (dx / dist - m.hx) * q; m.hy += (dy / dist - m.hy) * q }
                    let want = f.dir == 0 ? 1 : f.dir
                    m.face += jsSign(want - m.face) * min(abs(want - m.face), dt * 7)
                }
            }
            gaits[f.id] = m
        }
        if tick % 120 == 0 { gaits = gaits.filter { $0.value.tick == tick } }
    }

    private var foeNodes: [Int: FoeNode] = [:]

    private func syncFoes() {
        var seen = Set<Int>()
        for f in battle.foes {
            seen.insert(f.id)
            let n = foeNodes[f.id] ?? {
                let n = FoeNode(foe: f, scene: self)
                foeNodes[f.id] = n
                return n
            }()
            drawFoe(f, n)
        }
        for (id, n) in foeNodes where !seen.contains(id) { n.remove(); foeNodes[id] = nil }
    }

    private func drawFoe(_ f: Foe, _ n: FoeNode) {
        let seed = seedOf(f), m = gaits[f.id], gt = Self.gaitTable[Self.gaitOf(f)]!
        let ph = m?.ph ?? seed, v = min(1, m?.v ?? 1)
        let fs = m?.face ?? (f.dir == 0 ? 1 : f.dir)
        let face = (fs == 0 ? 1 : jsSign(fs)) * max(0.25, abs(fs))
        let hx = m?.hx ?? 1, hy = m?.hy ?? 0, hl = hypot(hx, hy) == 0 ? 1 : hypot(hx, hy)
        let lane = f.def.isBoss || f.def.isFlying ? 0 : max(-8, min(8, f.off * 0.45)) + sin(T * 0.9 + seed * 3) * 2 * v
        let x = f.x - hy / hl * lane, y = f.y + hx / hl * lane * World.ySquash
        let strike = f.blocked ? pow(max(0, sin(T * 6 + seed)), 3) : 0
        let stepLift = abs(sin(ph)) * gt.lift * v
        let breath = sin(T * 2.2 + seed) * 0.5
        let by = y - stepLift + breath * (1 - v)
        let bx = x + strike * 5 * jsSign(face)
        let tilt = (hy / hl) * 0.16 * jsSign(face) + sin(ph) * gt.rock * v - strike * 0.12 * jsSign(face)
        let surge = sin(ph * 2) * gt.surge * v
        let legs: Double? = f.blocked || v < 0.05 ? nil : ph
        let depthY = f.y + (f.def.isFlying ? 40 : 0)
        n.base.zPosition = Z.unit(depthY)
        n.emit.zPosition = Z.emit(depthY)

        if f.under {
            n.showUnder(x: x, y: y, size: f.def.size, T: T)
            return
        }
        n.hideUnder()
        let K = f.def.isBoss ? 1.0 : 1.2
        let flying = f.def.isFlying
        let mothY = by + sin(T * 3 + seed) * 3 - max(0, sin(T * 13 + seed)) * 2
        var art = "\(f.kind.rawValue)"
        if f.kind == .colossus && (f.slowT > 0 || f.freezeT > 0) { art = "colossusf" }
        // A Glasshide with every pane broken: the moment to land the big hits.
        if f.kind == .glasshide && f.panes == 0 { art = "glasshide0" }
        let tag: String
        if flying { tag = "s" } else if let l = legs {
            let k = Int((l.truncatingRemainder(dividingBy: .pi * 2) + .pi * 2).truncatingRemainder(dividingBy: .pi * 2) / (.pi * 2) * 8 + 0.5) % 8
            tag = String(k)
        } else { tag = "s" }
        let flap: (Double) -> Double = { k in 1 - k * (0.5 + 0.5 * sin(self.T * 13 + seed)) }
        let pos = flying && f.kind != .queen ? P(bx, mothY) : P(bx, by)
        let sx = flying && f.kind != .queen ? K * flap(0.35) : K * (1 + surge) * face
        let sy = K * (1 - surge * 0.8)
        for (sprite, prefix) in [(n.body, "f-"), (n.bodyEmit, "fe-")] {
            self.art.set(sprite, "\(prefix)\(art)-\(tag)")
            sprite.position = pos
            sprite.zRotation = -tilt
            sprite.xScale = sx
            sprite.yScale = sy
        }
        if let w = n.wings, let we = n.wingsEmit {
            for s in [w, we] { s.position = P(bx, by); s.zRotation = -tilt; s.xScale = K * flap(0.15); s.yScale = K }
        }
        let hidden = f.hidden
        n.body.alpha = hidden ? 0.3 : 1
        n.bodyEmit.alpha = hidden ? 0.3 : 1
        n.wings?.alpha = hidden ? 0.3 : 1
        // The green glow in their seams: the one strong colour the Hollow owns.
        n.seam.isHidden = hidden || flying
        if !n.seam.isHidden {
            n.seam.position = P(bx, by - f.def.bar * 0.35)
            let r = (12 + 6 * f.def.size) * K
            n.seam.size = CGSize(width: r * 2, height: r * 2)
        }
        if let ring = n.ring {
            ring.isHidden = hidden
            switch f.kind {
            case .mender: ring.position = P(bx, by - 12); ring.alpha = 0.2 + 0.1 * sin(T * 4)
            case .splitter: ring.position = P(bx, by - 14)
            case .warden: ring.position = P(bx, by - 24); ring.alpha = 0.22 + 0.08 * sin(T * 3)
            case .tidewyrm: ring.position = P(bx, by)
            case .queen: ring.position = P(bx, by - 40); ring.alpha = 0.25 + 0.1 * sin(T * 2)
            default: break
            }
        }
        n.ashGlow?.position = P(bx, by - 60)
        n.status(f, x: x, y: y, T: T)
        // Health and the white flash of a hit.
        let showBar = !hidden && !look.still && (f.hp < f.max || f.def.isBoss)
        n.bar.root.isHidden = !showBar
        if showBar {
            n.bar.width = f.def.isBoss ? 90 : 34
            n.bar.color = f.def.isBoss ? UIColor(hex: 0xe0503a) : f.shielded ? UIColor(hex: 0x5ac8a8) : f.vulnT > 0 ? UIColor(hex: 0xe88b3a) : UIColor(hex: 0xc8552e)
            n.bar.place(x: x, y: y - f.def.bar * K)
            n.bar.set(f.hp / f.max)
        }
        n.hit.isHidden = hidden || f.hitT <= 0
        if f.hitT > 0 {
            n.hit.position = P(x, y - f.def.bar * 0.5)
            let r = 16 * f.def.size
            n.hit.size = CGSize(width: r * 2, height: r * 2)
            n.hit.alpha = min(1, f.hitT * 2)
        }
    }

    /* ------------------------------------------------------------------ particles, clouds, light */

    private var smokeNodes: [SKSpriteNode] = []
    private var chipNodes: [SKSpriteNode] = []
    private var sparkNodes: [SKSpriteNode] = []

    private func pool(_ arr: inout [SKSpriteNode], _ n: Int, make: () -> SKSpriteNode) {
        while arr.count < n { let s = make(); world.addChild(s); arr.append(s) }
        for (i, s) in arr.enumerated() { s.isHidden = i >= n }
    }

    private func drawParts() {
        let smoke = parts.filter { $0.kind == .smoke }, chips = parts.filter { $0.kind == .chip }, sparks = parts.filter { $0.kind == .spark }
        pool(&smokeNodes, smoke.count) { let s = SKSpriteNode(texture: art.disc); s.colorBlendFactor = 1; s.zPosition = Z.smoke; return s }
        for (i, p) in smoke.enumerated() {
            let s = smokeNodes[i], r = p.s * (2.2 - p.life / p.max)
            s.position = P(p.x, p.y); s.size = CGSize(width: r * 2, height: r * 2); s.color = p.color; s.alpha = p.life / p.max * 0.4
        }
        pool(&chipNodes, chips.count) { let s = SKSpriteNode(color: .black, size: CGSize(width: 3, height: 3)); s.anchorPoint = CGPoint(x: 0, y: 1); s.zPosition = Z.smoke + 0.1; return s }
        for (i, p) in chips.enumerated() {
            let s = chipNodes[i]
            s.position = P(p.x, p.y); s.size = CGSize(width: p.s, height: p.s); s.color = p.color; s.alpha = min(1, p.life / p.max * 2)
        }
        pool(&sparkNodes, sparks.count) { let s = SKSpriteNode(color: .white, size: CGSize(width: 2, height: 2)); s.anchorPoint = CGPoint(x: 0, y: 1); s.blendMode = .add; s.zPosition = Z.fx + 0.1; return s }
        for (i, p) in sparks.enumerated() {
            let s = sparkNodes[i]
            s.position = P(p.x, p.y); s.size = CGSize(width: p.s, height: p.s); s.color = p.color; s.alpha = p.life / p.max
        }
    }

    private var cloudNodes: [SKSpriteNode] = []
    private func drawClouds() {
        let cl = battle.clouds
        pool(&cloudNodes, cl.count) { let s = SKSpriteNode(texture: art.soft); s.color = UIColor(120, 170, 70); s.colorBlendFactor = 1; s.zPosition = Z.clouds; return s }
        for (i, c) in cl.enumerated() {
            let s = cloudNodes[i]
            s.position = P(c.x, c.y); s.size = CGSize(width: c.r * 2, height: c.r * 2 / World.ySquash); s.alpha = 0.35 * min(1, c.t)
        }
    }

    /// Lanterns, towers and Wren light the map. By day it is nearly bright; at night and in the Rift the dark closes in.
    private func drawLight() {
        let b = battle, st = b.stage
        let amt = b.hero.sunriseT > 0 ? 0 : b.night ? 0.62 : st.isLava ? 0.14 : 0.03
        sunWash.isHidden = b.night
        guard amt > 0.05 else { dark.isHidden = true; return }
        var lights: [(Double, Double, Double, Double)] = []
        let fk = 1 + sin(T * 7) * 0.03
        for t in b.towers { let r = t.kind == .beacon ? b.stats(t).range * 0.8 : Self.towerLight[t.kind]!.1; lights.append((t.x, t.y - 50, r * fk, 0.9)) }
        for p in posts { lights.append((p.x, p.y - 34, 70 * fk, 0.75)) }
        if !b.hero.dead { lights.append((b.hero.x - 16, b.hero.y - 10, b.heroSight() * fk, 0.95)) }
        for g in b.gate { lights.append((g.x, g.y - 120, 230 * fk, 1)) }
        if let lh = st.lighthouse { lights.append((lh.x, lh.y - 120, 380, 1)) }
        for f in fx where f.kind == .boom { lights.append((f.x, f.y, 140 * f.life / 0.45 + 40, 0.9)) }
        // A small mask, redrawn each frame and stretched over the map: soft edges cost nothing.
        let w = 192, h = 108, k = Double(w) / World.width
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return }
        ctx.translateBy(x: 0, y: CGFloat(h)); ctx.scaleBy(x: 1, y: -1)
        let space = CGColorSpaceCreateDeviceRGB()
        let fill = CGGradient(colorsSpace: space, colors: [UIColor(6, 9, 16, amt * 0.82).cgColor, UIColor(3, 4, 8, amt).cgColor] as CFArray, locations: [0, 1])!
        ctx.drawLinearGradient(fill, start: .zero, end: CGPoint(x: w, y: h), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        ctx.setBlendMode(.destinationOut)
        for (lx, ly, r, s) in lights {
            let g = CGGradient(colorsSpace: space, colors: [UIColor(white: 0, alpha: s).cgColor, UIColor(white: 0, alpha: s * 0.55).cgColor, UIColor(white: 0, alpha: 0).cgColor] as CFArray, locations: [0, 0.5, 1])!
            let c = CGPoint(x: lx * k, y: ly * k)
            ctx.drawRadialGradient(g, startCenter: c, startRadius: 0, endCenter: c, endRadius: r * k, options: [])
        }
        guard let img = ctx.makeImage() else { return }
        dark.texture = SKTexture(cgImage: img)
        dark.isHidden = false
    }

    /* ------------------------------------------------------------------ shots, effects, ranges */

    private var boltNodes: [SKSpriteNode] = []
    private var shellNodes: [SKSpriteNode] = []

    private func drawShots() {
        let shots = look.still ? [] : battle.shots.filter { $0.t >= 0 }
        let bolts = shots.filter { $0.kind == .bolt }, shells = shots.filter { $0.kind == .shell }
        pool(&boltNodes, bolts.count) { let s = SKSpriteNode(texture: art.streak); s.anchorPoint = CGPoint(x: 1, y: 0.5); s.blendMode = .add; s.colorBlendFactor = 1; s.zPosition = Z.shots; return s }
        for (i, s) in bolts.enumerated() {
            let u = min(1, s.t / s.dur)
            let x = s.x0 + (s.tx - s.x0) * u, y = s.y0 + (s.ty - 12 - s.y0) * u
            let u0 = max(0, u - 0.18)
            let bx = s.x0 + (s.tx - s.x0) * u0, by = s.y0 + (s.ty - 12 - s.y0) * u0
            let n = boltNodes[i], len = hypot(x - bx, y - by)
            n.position = P(x, y)
            n.zRotation = atan2(-(y - by), x - bx)
            n.size = CGSize(width: max(1, len), height: s.crit ? 3 : 2)
            n.color = s.crit ? UIColor(255, 240, 200) : UIColor(255, 215, 160)
            n.alpha = s.crit ? 1 : 0.9
        }
        pool(&shellNodes, shells.count) { let s = SKSpriteNode(texture: art.disc); s.color = UIColor(hex: 0x0c0c0d); s.colorBlendFactor = 1; s.size = CGSize(width: 9, height: 9); s.zPosition = Z.shots; return s }
        for (i, s) in shells.enumerated() {
            let u = min(1, s.t / s.dur), arc = sin(u * .pi) * 90
            let x = s.x0 + (s.tx - s.x0) * u, y = s.y0 + (s.ty - s.y0) * u - arc
            shellNodes[i].position = P(x, y)
            if R() < 0.5 { parts.append(Part(x: x, y: y, vx: 0, vy: -6, life: 0.7, max: 0.7, color: UIColor(60, 60, 62), s: 3, kind: .smoke)) }
        }
    }

    private final class Fx {
        enum Kind { case ring, arc, boom, slash, steam, lantern, sun, splash }
        let kind: Kind
        let x: Double, y: Double
        var r: Double
        let max: Double
        var life: Double
        var color: UIColor
        var pts: [Vec] = []
        var seed = 1
        let node = SKNode()
        init(kind: Kind, x: Double, y: Double, r: Double, max: Double, life: Double, color: UIColor) {
            self.kind = kind; self.x = x; self.y = y; self.r = r; self.max = max; self.life = life; self.color = color
        }
    }

    @discardableResult
    private func addFx(_ kind: Fx.Kind, _ x: Double, _ y: Double, r: Double, max: Double, life: Double, color: UIColor = .white) -> Fx {
        let f = Fx(kind: kind, x: x, y: y, r: r, max: max, life: life, color: color)
        f.node.zPosition = Z.fx
        switch kind {
        case .ring, .slash, .splash:
            let s = SKShapeNode(); s.name = "s"; s.blendMode = .add; s.lineWidth = kind == .slash ? 4 : 2; f.node.addChild(s)
        case .lantern:
            f.node.addChild(glowSprite(color: UIColor(hex: 0xffb050), r: r, a: 0.5))
            let s = SKShapeNode(ellipseOf: CGSize(width: r * 2, height: r * 2 / World.ySquash * 0.6)); s.name = "s"; s.blendMode = .add; s.lineWidth = 2
            f.node.addChild(s)
        case .boom:
            let a = glowSprite(color: UIColor(hex: 0xff8a3a), r: 1, a: 0); a.name = "a"; f.node.addChild(a)
            let b = glowSprite(color: UIColor(hex: 0xffe0b0), r: 20, a: 0); b.name = "b"; f.node.addChild(b)
        case .sun:
            let a = glowSprite(color: UIColor(hex: 0xffd590), r: 1, a: 0); a.name = "a"; f.node.addChild(a)
        case .steam:
            for k in 0..<5 { let s = SKSpriteNode(texture: art.disc); s.name = "p\(k)"; s.color = UIColor(230, 230, 230); s.colorBlendFactor = 1; s.blendMode = .add; f.node.addChild(s) }
        case .arc:
            let s = SKShapeNode(); s.name = "s"; s.blendMode = .add; f.node.addChild(s)
        }
        world.addChild(f.node)
        fx.append(f)
        return f
    }

    private func drawFx() {
        for e in fx {
            switch e.kind {
            case .ring:
                guard let s = e.node.childNode(withName: "s") as? SKShapeNode else { continue }
                let a = 1 - e.r / e.max, ry = e.r / World.ySquash * 0.6
                s.path = CGPath(ellipseIn: CGRect(x: -e.r, y: -ry, width: e.r * 2, height: ry * 2), transform: nil)
                s.position = P(e.x, e.y); s.strokeColor = e.color.withAlphaComponent(0.45 * a)
            case .arc:
                guard let s = e.node.childNode(withName: "s") as? SKShapeNode, s.path == nil else { continue }
                s.path = boltPath(e.pts, seed: e.seed)
                s.strokeColor = UIColor(250, 248, 255, 0.95); s.lineWidth = 1.2; s.glowWidth = 2.5; s.lineJoin = .round
            case .boom:
                let a = e.life / e.max
                if let g = e.node.childNode(withName: "a") as? SKSpriteNode { let r = 70 * (1.2 - a) + 20; g.size = CGSize(width: r * 2, height: r * 2); g.alpha = 0.6 * a; g.position = P(e.x, e.y - 8) }
                if let g = e.node.childNode(withName: "b") as? SKSpriteNode { g.alpha = 0.8 * a; g.position = P(e.x, e.y - 8) }
            case .slash:
                guard let s = e.node.childNode(withName: "s") as? SKShapeNode else { continue }
                let a = e.life / e.max, k = 1.2 - a * 0.4
                let path = CGMutablePath()
                path.addArc(center: .zero, radius: 1, startAngle: -T * 8, endAngle: -(T * 8 + 4.5), clockwise: true,
                            transform: CGAffineTransform(scaleX: e.r * k, y: e.r * 0.45 * k))
                s.path = path; s.position = P(e.x, e.y - 10); s.strokeColor = UIColor(220, 235, 250, a)
            case .lantern:
                let a = e.life / e.max
                e.node.position = P(e.x, e.y)
                for c in e.node.children {
                    if let g = c as? SKSpriteNode { g.alpha = 0.5 * a; g.position = CGPoint(x: 0, y: 10) }
                    if let s = c as? SKShapeNode { s.strokeColor = UIColor(255, 200, 120, a) }
                }
            case .sun:
                let a = e.life / e.max
                if let g = e.node.childNode(withName: "a") as? SKSpriteNode { let r = 400 * (1.2 - a); g.size = CGSize(width: r * 2, height: r * 2); g.alpha = 0.5 * a; g.position = P(e.x, e.y - 40) }
            case .steam:
                let a = e.life / e.max
                for k in 0..<5 {
                    guard let s = e.node.childNode(withName: "p\(k)") as? SKSpriteNode else { continue }
                    let r = 14 + Double(k) * 4
                    s.size = CGSize(width: r * 2, height: r * 2); s.alpha = 0.18 * a
                    s.position = P(e.x + sin(Double(k) * 2 + T) * 10, e.y - (1 - a) * 90 - Double(k) * 14)
                }
            case .splash:
                guard let s = e.node.childNode(withName: "s") as? SKShapeNode else { continue }
                let a = e.life / e.max, k = 1.2 - a
                s.path = CGPath(ellipseIn: CGRect(x: -60 * k, y: -20 * k, width: 120 * k, height: 40 * k), transform: nil)
                s.position = P(e.x, e.y); s.strokeColor = UIColor(200, 230, 255, a)
            }
        }
    }

    /// A jagged bolt along the chain of points, as LFX.bolt draws it.
    private func boltPath(_ pts: [Vec], seed: Int) -> CGPath {
        let path = CGMutablePath()
        guard pts.count > 1 else { return path }
        for i in 1..<pts.count {
            var r = Rng(seed: seed + i)
            let a = pts[i - 1], b = pts[i]
            path.move(to: P(a.x, a.y))
            for j in 1..<12 {
                let t = Double(j) / 12
                path.addLine(to: P(a.x + (b.x - a.x) * t + (r.next() - 0.5) * 14, a.y + (b.y - a.y) * t + (r.next() - 0.5) * 14))
            }
            path.addLine(to: P(b.x, b.y))
        }
        return path
    }

    private func drawRanges() {
        let b = battle
        var want: [(Double, Double, Double, UIColor)] = []
        if let id = look.selTower, let t = b.tower(id) {
            want.append((t.x, t.y, b.stats(t).range, UIColor(255, 214, 140)))
            if t.kind != .beacon { want.append((t.x, t.y, Battle.towerSight, UIColor(140, 200, 255))) }
        }
        if let pi = look.selPlot, let kind = look.preview, pi < b.plots.count {
            let p = b.plots[pi]
            let waterBonus = b.mods.tidePearl && p.nearWater ? 0.15 : 0.0
            let modRange = 1 + (b.mods.towerRange[kind] ?? 0) + b.mods.rangeAll + waterBonus
            want.append((p.x, p.y, b.data.tower(kind).range[0] * modRange * (p.high ? 1.2 : 1), UIColor(255, 214, 140)))
        }
        if look.aiming {
            want.append((b.hero.x, b.hero.y, b.data.snare.range, UIColor(255, 214, 140)))
            if let a = look.aimW { want.append((a.x, a.y, b.data.snare.radius, UIColor(255, 150, 70))) }
        }
        if look.showLeash && !b.hero.dead {
            want.append((b.hero.anchorX, b.hero.anchorY, b.data.hero.leash, UIColor(255, 214, 140)))
            if b.hero.rank(.e) > 0 { want.append((b.hero.x, b.hero.y, b.data.attune.radius, UIColor(130, 220, 145))) }
        }
        let key = want.map { "\(Int($0.0)),\(Int($0.1)),\(Int($0.2))" }.joined(separator: ";")
        guard key != rangeKey else { return }
        rangeKey = key
        for (i, n) in ranges.enumerated() {
            guard i < want.count else { n.isHidden = true; continue }
            let (x, y, r, c) = want[i]
            let rect = CGRect(x: -r, y: -r / World.ySquash, width: r * 2, height: r * 2 / World.ySquash)
            let solid = CGPath(ellipseIn: rect, transform: nil)
            n.path = solid
            n.fillColor = c.withAlphaComponent(0.08)
            n.strokeColor = .clear
            let dash: SKShapeNode
            if let d = n.children.first as? SKShapeNode { dash = d } else { dash = SKShapeNode(); dash.lineWidth = 1.5; n.addChild(dash) }
            dash.path = solid.copy(dashingWithPhase: 0, lengths: [6, 6])
            dash.strokeColor = c.withAlphaComponent(0.7)
            n.position = P(x, y)
            n.isHidden = false
        }
    }

    private var crows: [(x: Double, y: Double, v: Double, n: Int, nodes: [SKShapeNode])] = []
    private func drawCrows(_ dt: Double) {
        if look.reduceMotion || look.still { for c in crows { c.nodes.forEach { $0.removeFromParent() } }; crows = []; return }
        if R() < dt * 0.15 && crows.count < 2 {
            let l = R() < 0.5, n = 3 + Int(R() * 3)
            let nodes = (0..<n).map { _ -> SKShapeNode in let s = SKShapeNode(); s.strokeColor = UIColor(hex: 0x141414); s.lineWidth = 2.2; s.zPosition = Z.crows; world.addChild(s); return s }
            crows.append((l ? -40 : World.width + 40, 60 + R() * 380, (l ? 1 : -1) * (110 + R() * 50), n, nodes))
        }
        for i in crows.indices {
            crows[i].x += crows[i].v * dt
            let c = crows[i]
            for (k, node) in c.nodes.enumerated() {
                let x = c.x - jsSign(c.v) * Double(k) * 26, y = c.y + Double(k % 2) * 14 + Double(k) * 6, w = sin(T * 14 + Double(k)) * 6
                let path = CGMutablePath()
                path.move(to: CGPoint(x: -10, y: w))
                path.addQuadCurve(to: CGPoint(x: 0, y: -2), control: CGPoint(x: -4, y: 2))
                path.addQuadCurve(to: CGPoint(x: 10, y: w), control: CGPoint(x: 4, y: 2))
                node.path = path
                node.position = P(x, y)
            }
        }
        crows.removeAll { c in
            let gone = c.x < -120 || c.x > World.width + 120
            if gone { c.nodes.forEach { $0.removeFromParent() } }
            return gone
        }
    }

    /* ------------------------------------------------------------------ input */

    private var touchStart: CGPoint?
    private var lastX: CGFloat = 0
    private var panning = false
    /// A finger came down on Wren. She is picked up once it travels; a still release stays a tap.
    private var heroGrab = false
    private var heroDragging = false

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let t = touches.first else { return }
        // Window points: the view itself moves while the map slides, so its own points would drift.
        touchStart = t.location(in: nil)
        lastX = touchStart?.x ?? 0
        panning = false
        heroGrab = false
        heroDragging = false
        if look.aiming { aim(t); return }
        let wp = t.location(in: self)
        let wx = Double(wp.x), wy = World.height - Double(wp.y)
        let onHero = !battle.hero.dead && hypot2(wx - battle.hero.x, wy - (battle.hero.y - 20)) < 52
        if onHero && !(grabBlocked?(wx, wy) ?? false) { heroGrab = true }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let t = touches.first else { return }
        let wp = t.location(in: self)
        let wx = Double(wp.x), wy = World.height - Double(wp.y)
        if heroDragging { onHeroDrag?(wx, wy); return }
        if look.aiming { aim(t); return }
        let now = t.location(in: nil)
        if heroGrab, let s = touchStart {
            // Wren follows only after the finger has clearly moved, so a tap near her never shifts her.
            if hypot(now.x - s.x, now.y - s.y) > 10 {
                heroDragging = true
                look.showLeash = true
                onHeroDrag?(wx, wy)
            }
            return
        }
        if canPan, let s = touchStart {
            if !panning && abs(now.x - s.x) > 10 { panning = true }
            if panning { onPan?(now.x - lastX); lastX = now.x }
            return
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let t = touches.first, let s = touchStart else { return }
        touchStart = nil
        heroGrab = false
        let p = t.location(in: self)
        let wx = Double(p.x), wy = World.height - Double(p.y)
        if heroDragging {
            heroDragging = false
            onHeroDragEnd?(wx, wy)
            return
        }
        let now = t.location(in: nil)
        let dist = hypot(now.x - s.x, now.y - s.y)
        if look.aiming {
            // Tap-to-aim: a drag only moves the mark, and the next tap throws.
            if tapAimW && dist > 18 { return }
            // Every other release ends the aim: thrown, or called off when let go far outside the range.
            let cancel = hypot2(wx - battle.hero.x, wy - battle.hero.y) > battle.data.snare.range + 45
            onAimEnd?(wx, wy, cancel)
            return
        }
        if panning || dist > 18 { panning = false; return }
        onTap?(wx, wy)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        touchStart = nil; panning = false; heroGrab = false
        if heroDragging { heroDragging = false; look.showLeash = false; onHeroDragCancel?() }
    }

    private func aim(_ t: UITouch) {
        guard look.aiming else { return }
        let p = t.location(in: self)
        onAim?(Double(p.x), World.height - Double(p.y))
    }

    /* ------------------------------------------------------------------ parts of the picture */

    /// A health bar: a dark strip with a coloured fill, as bar0 draws it.
    final class Bar {
        let root = SKNode()
        private let back = SKSpriteNode(color: UIColor(white: 0, alpha: 0.75), size: .zero)
        private let fill = SKSpriteNode(color: .white, size: .zero)
        var width: Double
        var color: UIColor { didSet { fill.color = color } }
        init(width: Double, color: UIColor) {
            self.width = width; self.color = color
            back.anchorPoint = CGPoint(x: 0, y: 1); fill.anchorPoint = CGPoint(x: 0, y: 1)
            fill.color = color
            root.addChild(back); root.addChild(fill)
        }
        func place(x: Double, y: Double) {
            back.position = P(x - width / 2 - 1, y); back.size = CGSize(width: width + 2, height: 5)
            fill.position = P(x - width / 2, y + 1)
        }
        func set(_ v: Double) { fill.size = CGSize(width: width * max(0, min(1, v)), height: 3) }
    }

    /// The pieces of one foe: the walking body, its lit seams and bar above the dark, and status marks.
    final class FoeNode {
        let base = SKNode(), emit = SKNode()
        let body = SKSpriteNode(), bodyEmit = SKSpriteNode()
        var wings: SKSpriteNode?, wingsEmit: SKSpriteNode?
        let seam: SKSpriteNode, hit: SKSpriteNode
        var ring: SKShapeNode?
        var ashGlow: SKSpriteNode?
        let bar = Bar(width: 34, color: .red)
        private let under = SKShapeNode()
        private let marks = SKShapeNode()
        private let slow = SKShapeNode()
        private let burn = SKShapeNode()
        private let vuln = SKShapeNode()
        private let shieldRing = SKShapeNode()
        /// 0 none, 1 chilled, 2 frozen: which frost shape `slow` holds now.
        private var chillShown = 0

        init(foe f: Foe, scene: BattleScene) {
            bodyEmit.blendMode = .add
            seam = scene.glowSprite(color: UIColor(hex: 0x3be0b8), r: 12, a: 0.28)
            hit = scene.glowSprite(color: .white, r: 16, a: 0)
            if f.kind == .queen {
                let w = SKSpriteNode(), we = SKSpriteNode(); we.blendMode = .add
                Art.shared.set(w, "f-queenw"); Art.shared.set(we, "fe-queenw")
                w.zPosition = -0.001
                base.addChild(w); emit.addChild(we)
                wings = w; wingsEmit = we
            }
            base.addChild(body); emit.addChild(bodyEmit); emit.addChild(seam); emit.addChild(hit); emit.addChild(bar.root)
            let ringSpec: (Double, UIColor, Double)? = {
                switch f.kind {
                case .mender: return (26, UIColor(120, 230, 140), 0.25)
                case .splitter: return (20, UIColor(180, 240, 200), 0.15)
                case .warden: return (110 / World.ySquash * 0.6, UIColor(90, 200, 170), 0.22)
                case .tidewyrm: return (60, UIColor(120, 190, 230), 0.2)
                case .queen: return (80, UIColor(90, 230, 190), 0.25)
                default: return nil
                }
            }()
            if let (r, c, a) = ringSpec {
                let s = SKShapeNode(ellipseOf: CGSize(width: r * 2, height: r * 1.2))
                s.strokeColor = c; s.lineWidth = 1.5; s.blendMode = .add; s.alpha = a; s.fillColor = .clear
                emit.addChild(s); ring = s
            }
            if f.kind == .ashmoth { let g = scene.glowSprite(color: UIColor(hex: 0xff7a3a), r: 22, a: 0.35); emit.addChild(g); ashGlow = g }
            under.fillColor = UIColor(40, 32, 24, 0.9); under.lineWidth = 0; base.addChild(under)
            marks.fillColor = UIColor(hex: 0x0d0f0a); marks.lineWidth = 0; base.addChild(marks)
            slow.lineWidth = 1; base.addChild(slow)
            burn.fillColor = UIColor(255, 130, 48, 0.78); burn.lineWidth = 0; base.addChild(burn)
            vuln.strokeColor = UIColor(255, 158, 64, 0.82); vuln.lineWidth = 1.6; vuln.fillColor = .clear; base.addChild(vuln)
            shieldRing.strokeColor = UIColor(90, 220, 185, 0.4); shieldRing.lineWidth = 1.8; shieldRing.blendMode = .add; shieldRing.fillColor = .clear; emit.addChild(shieldRing)
            // Shapes that never change for this foe are built once here; each frame only shows, hides and moves them.
            let S = f.def.size, sr = 20 * S
            vuln.path = CGPath(ellipseIn: CGRect(x: -19 * S, y: -6.5 * S, width: 38 * S, height: 13 * S), transform: nil).copy(dashingWithPhase: 0, lengths: [4, 3])
            shieldRing.path = CGPath(ellipseIn: CGRect(x: -sr, y: -sr * 0.6, width: sr * 2, height: sr * 1.2), transform: nil)
            [under, marks, slow, burn, vuln, shieldRing].forEach { $0.isHidden = true }
            scene.world.addChild(base); scene.world.addChild(emit)
        }

        func showUnder(x: Double, y: Double, size S: Double, T: Double) {
            [body, bodyEmit, seam, hit, bar.root, shieldRing].forEach { $0.isHidden = true }
            wings?.isHidden = true; wingsEmit?.isHidden = true; ring?.isHidden = true; ashGlow?.isHidden = true
            [marks, slow, burn, vuln].forEach { $0.isHidden = true }
            under.isHidden = false
            let path = CGMutablePath()
            path.addEllipse(in: CGRect(x: -14 * S, y: -6 * S, width: 28 * S, height: 12 * S))
            for k in 0..<4 { path.addRect(CGRect(x: -10 + Double(k) * 6 + sin(T * 9 + Double(k)) * 2, y: 0, width: 3, height: 3)) }
            under.path = path
            under.position = P(x, y)
        }

        func hideUnder() {
            under.isHidden = true
            [body, bodyEmit].forEach { $0.isHidden = false }
            wings?.isHidden = false; wingsEmit?.isHidden = false; ashGlow?.isHidden = false
        }

        /// Roots holding it, faceted ice / frost on it, multi-tongue fire, vulnerability, and shield aura.
        func status(_ f: Foe, x: Double, y: Double, T: Double) {
            let S = f.def.size
            marks.isHidden = f.rootT <= 0
            if f.rootT > 0 {
                let path = CGMutablePath()
                for i in 0..<6 {
                    let a = Double(i) / 6 * .pi * 2, rx = cos(a) * 14 * S, ry = sin(a) * 4
                    path.move(to: CGPoint(x: rx - 3, y: -ry)); path.addLine(to: CGPoint(x: rx + cos(a) * 3, y: -(ry - 12 - f.rootT * 4))); path.addLine(to: CGPoint(x: rx + 3, y: -ry)); path.closeSubpath()
                }
                marks.path = path; marks.position = P(x, y)
            }
            // Frozen shows a crystal, chilled a frost patch. The shape is rebuilt only when that state changes.
            let chill = f.freezeT > 0 ? 2 : f.slowT > 0 ? 1 : 0
            slow.isHidden = chill == 0
            if chill != chillShown {
                chillShown = chill
                if chill == 2 {
                    let crystal = CGMutablePath()
                    crystal.move(to: CGPoint(x: -14 * S, y: 0)); crystal.addLine(to: CGPoint(x: -10 * S, y: 22 * S))
                    crystal.addLine(to: CGPoint(x: 0, y: 28 * S)); crystal.addLine(to: CGPoint(x: 11 * S, y: 20 * S))
                    crystal.addLine(to: CGPoint(x: 14 * S, y: 0)); crystal.closeSubpath()
                    slow.path = crystal
                    slow.fillColor = UIColor(185, 232, 255, 0.55)
                    slow.strokeColor = UIColor(240, 252, 255, 0.9)
                } else if chill == 1 {
                    slow.path = CGPath(ellipseIn: CGRect(x: -18 * S, y: -5 * S, width: 36 * S, height: 10 * S), transform: nil)
                    slow.fillColor = UIColor(190, 225, 250, 0.35)
                    slow.strokeColor = .clear
                }
            }
            if chill == 2 { slow.position = P(x, y) } else if chill == 1 { slow.position = P(x, y + 2) }
            burn.isHidden = f.burnT <= 0
            if f.burnT > 0 {
                let fp = CGMutablePath()
                for k in -1...1 {
                    let fh = 12 + sin(T * 14 + Double(k) * 2) * 3
                    let cx = Double(k) * 5
                    fp.move(to: CGPoint(x: cx - 3, y: 4))
                    fp.addQuadCurve(to: CGPoint(x: cx + 3, y: 4), control: CGPoint(x: cx + sin(T * 9 + Double(k)) * 3, y: 4 + fh))
                    fp.closeSubpath()
                }
                burn.path = fp; burn.position = P(x, y)
            }
            vuln.isHidden = f.vulnT <= 0
            if f.vulnT > 0 { vuln.position = P(x, y + 2) }
            shieldRing.isHidden = f.hidden || !f.shielded
            if !shieldRing.isHidden {
                shieldRing.position = P(x, y - f.def.bar * 0.4)
                shieldRing.alpha = 0.35 + 0.08 * sin(T * 5)
            }
        }

        func remove() { base.removeFromParent(); emit.removeFromParent() }
    }

    /// One tower: painted body, cannon barrel, integrated plinth gem, sleep icon badge, and lit aura.
    final class TowerNode {
        let base = SKNode(), emit = SKNode()
        let body = SKSpriteNode()
        var barrel: SKSpriteNode?
        private let plinthRim = SKShapeNode(circleOfRadius: 5.2)
        private let plinthGem = SKShapeNode(circleOfRadius: 3.6)
        private let sleepBadge = SKNode()
        private let masteryRing = SKShapeNode(ellipseOf: CGSize(width: 66, height: 26))
        let lit = SKSpriteNode(), hot = SKSpriteNode()
        let splitGlow: SKSpriteNode, muzzle: SKSpriteNode
        private var key = ""

        init(tower t: Tower, scene: BattleScene) {
            lit.blendMode = .add; hot.blendMode = .add
            splitGlow = scene.glowSprite(color: BattleScene.towerLight[t.kind]!.0, r: 26, a: 0.25)
            muzzle = scene.glowSprite(color: UIColor(hex: 0xffa040), r: 26, a: 0)
            base.addChild(body)
            if t.kind == .cannon { let b = SKSpriteNode(); b.zPosition = 0.001; base.addChild(b); barrel = b }
            // Integrated plinth rune gem for elemental rounds (replaces floating badge dots & white plaque cards).
            plinthRim.fillColor = UIColor(hex: 0x1c1814); plinthRim.lineWidth = 0; plinthRim.position = P(t.x, t.y - 5); plinthRim.zPosition = 0.002
            plinthGem.lineWidth = 0; plinthGem.position = P(t.x, t.y - 5); plinthGem.zPosition = 0.003
            base.addChild(plinthRim); base.addChild(plinthGem)
            // Compact crescent sleep badge when lowered gear rests this wave.
            let disc = SKShapeNode(circleOfRadius: 9); disc.fillColor = UIColor(24, 22, 20, 0.88); disc.strokeColor = UIColor(220, 195, 150, 0.75); disc.lineWidth = 1.2
            let moonPath = CGMutablePath()
            moonPath.addArc(center: CGPoint(x: -1, y: 0), radius: 4.5, startAngle: 0.6, endAngle: .pi * 2 - 0.6, clockwise: false)
            let moon = SKShapeNode(path: moonPath); moon.fillColor = UIColor(hex: 0xe8d4a6); moon.lineWidth = 0
            sleepBadge.addChild(disc); sleepBadge.addChild(moon); sleepBadge.position = P(t.x, t.y - 26); sleepBadge.zPosition = 0.004; sleepBadge.isHidden = true
            base.addChild(sleepBadge)
            masteryRing.strokeColor = UIColor(255, 220, 125, 0.72); masteryRing.lineWidth = 1.6; masteryRing.fillColor = .clear
            masteryRing.position = P(t.x, t.y); masteryRing.zPosition = -0.001; masteryRing.isHidden = true
            base.addChild(masteryRing)
            emit.addChild(lit); emit.addChild(hot); emit.addChild(splitGlow); emit.addChild(muzzle)
            base.position = .zero; emit.position = .zero
            base.zPosition = Z.unit(t.y); emit.zPosition = Z.emit(t.y)
            body.position = P(t.x, t.y); lit.position = P(t.x, t.y); hot.position = P(t.x, t.y)
            scene.world.addChild(base); scene.world.addChild(emit)
        }

        func update(_ t: Tower, battle b: Battle, T: Double) {
            let lv = min(t.lv, b.data.maxTowerLevel), fbLv = min(lv, 4), splitTag = t.split.map { "-\($0.rawValue)" } ?? ""
            let S = lv >= 5 ? 0.86 : 0.6 + 0.06 * Double(fbLv - 1)
            let k = "\(lv)|\(splitTag)|\(t.round?.rawValue ?? "")|\(t.down)|\(t.stunT > 0)"
            if k != key {
                key = k
                Art.shared.set(body, "t-\(t.kind.rawValue)-\(lv)\(splitTag)-\(t.plot % 2)", fallback: "t-\(t.kind.rawValue)-\(fbLv)-\(t.plot % 2)")
                plinthRim.isHidden = t.round == nil
                plinthGem.isHidden = t.round == nil
                plinthGem.fillColor = t.round == .ember ? UIColor(hex: 0xff8a3a) : t.round == .frost ? UIColor(hex: 0x8fd0ff) : UIColor(hex: 0xb9a8ff)
                // Asleep on a lowered gear, or stunned by a Ram's stamp.
                body.alpha = t.down ? 0.42 : t.stunT > 0 ? 0.7 : 1
                barrel?.alpha = t.down ? 0.42 : t.stunT > 0 ? 0.7 : 1
                sleepBadge.isHidden = !t.down
                masteryRing.isHidden = t.lv < 5
                emit.isHidden = t.down
            }
            if let barrel {
                let a = atan2(sin(t.aim) * 0.5, cos(t.aim))
                let frame = Int(((t.aim / (.pi * 2) * 16).rounded()).truncatingRemainder(dividingBy: 16) + 16) % 16
                Art.shared.set(barrel, "barrel-\(frame)")
                let recoil = max(0, 1 - t.fired * 4) * 7 * S
                barrel.position = P(t.x + 4 * S - cos(a) * recoil, t.y - 50 * S - sin(a) * recoil)
                barrel.setScale(S)
                if t.fired < 0.14 && !t.down {
                    muzzle.isHidden = false
                    muzzle.position = P(t.x + 4 * S + cos(a) * 38 * S, t.y - 50 * S + sin(a) * 38 * S)
                    muzzle.alpha = 0.8 * (1 - t.fired / 0.14)
                } else { muzzle.isHidden = true }
            } else { muzzle.isHidden = true }
            switch t.kind {
            case .beacon:
                Art.shared.set(lit, "te-beacon-\(fbLv)-\(Int(T * 1.8 * 6) % 6)")
            case .roots:
                Art.shared.set(lit, "te-roots-\(fbLv)-0"); Art.shared.set(hot, "te-roots-\(fbLv)-1")
                hot.alpha = max(0, 1 - t.fired)
            default:
                Art.shared.set(lit, "te-\(t.kind.rawValue)-\(lv)\(splitTag)", fallback: "te-\(t.kind.rawValue)-\(fbLv)")
            }
            hot.isHidden = t.kind != .roots
            splitGlow.isHidden = t.split == nil
            if t.split != nil { splitGlow.position = P(t.x, t.y - 120 * S); splitGlow.alpha = (t.lv >= 5 ? 0.34 : 0.25) + 0.1 * sin(T * 3) }
        }

        func remove() { base.removeFromParent(); emit.removeFromParent() }
    }

    /// Wren: lantern ring at her feet, mirrored facing sprite, carried bag gem pips, bar & level.
    final class HeroNode {
        let ring = SKShapeNode(ellipseOf: CGSize(width: 60, height: 22))
        let body: SKSpriteNode, lit: SKSpriteNode
        let swing = SKShapeNode()
        let bar = Bar(width: 46, color: UIColor(hex: 0x7fd06a))
        let level = SKLabelNode()
        private var bagPips: [SKShapeNode] = []
        let double = SKShapeNode(ellipseOf: CGSize(width: 68, height: 40.8))
        let haste = SKShapeNode(ellipseOf: CGSize(width: 52, height: 31.2))
        let sunrise: SKSpriteNode
        let post = SKShapeNode()
        let mark = SKShapeNode()
        let base = SKNode(), emit = SKNode()
        private var shownLevel = -1

        init(art: Art) {
            body = art.sprite("wren"); lit = art.sprite("wren-e"); lit.blendMode = .add
            ring.fillColor = UIColor(255, 244, 214, 0.38); ring.strokeColor = UIColor(255, 236, 190, 0.95); ring.lineWidth = 2.5
            swing.lineWidth = 3; swing.lineCap = .round
            double.strokeColor = UIColor(90, 180, 255, 0.35); double.lineWidth = 1.5; double.blendMode = .add
            haste.strokeColor = UIColor(255, 110, 80, 0.3); haste.lineWidth = 1.5; haste.blendMode = .add
            sunrise = SKSpriteNode(texture: art.glow); sunrise.color = UIColor(hex: 0xffd590); sunrise.colorBlendFactor = 1; sunrise.blendMode = .add; sunrise.size = CGSize(width: 220, height: 220)
            post.lineWidth = 1.5; post.strokeColor = UIColor(255, 214, 140, 0.35)
            post.path = CGPath(ellipseIn: CGRect(x: -14, y: -6, width: 28, height: 12), transform: nil).copy(dashingWithPhase: 0, lengths: [3, 6])
            mark.lineWidth = 2
            level.horizontalAlignmentMode = .center; level.verticalAlignmentMode = .baseline
            base.addChild(ring); base.addChild(body); base.addChild(swing)
            let pipPath = CGMutablePath()
            pipPath.move(to: CGPoint(x: 0, y: 3.5)); pipPath.addLine(to: CGPoint(x: 3.5, y: 0)); pipPath.addLine(to: CGPoint(x: 0, y: -3.5)); pipPath.addLine(to: CGPoint(x: -3.5, y: 0)); pipPath.closeSubpath()
            for _ in 0..<4 {
                let pip = SKShapeNode(path: pipPath); pip.fillColor = UIColor(hex: 0xd49a38); pip.lineWidth = 0; pip.zPosition = 0.002; pip.isHidden = true
                base.addChild(pip); bagPips.append(pip)
            }
            emit.addChild(lit); emit.addChild(bar.root); emit.addChild(level); emit.addChild(double); emit.addChild(haste); emit.addChild(sunrise); emit.addChild(post); emit.addChild(mark)
            ring.zPosition = -0.001; swing.zPosition = 0.001
        }

        func add(to world: SKNode) { world.addChild(base); world.addChild(emit) }

        func update(_ b: Battle, look: SceneView, T: Double, moveMark: (x: Double, y: Double, t: Double)?) {
            let h = b.hero
            base.isHidden = h.dead; emit.isHidden = h.dead
            if let m = moveMark {
                let a = m.t / 0.6
                mark.isHidden = false
                mark.path = CGPath(ellipseIn: CGRect(x: -22 * (1.4 - a), y: -9 * (1.4 - a), width: 44 * (1.4 - a), height: 18 * (1.4 - a)), transform: nil)
                mark.position = P(m.x, m.y); mark.strokeColor = UIColor(255, 214, 140, a)
            } else { mark.isHidden = true }
            if h.dead { return }
            base.zPosition = Z.unit(h.y); emit.zPosition = Z.emit(h.y)
            ring.position = P(h.x, h.y + 2)
            body.position = P(h.x, h.y); lit.position = P(h.x, h.y)
            let face: CGFloat = h.face < 0 ? -1 : 1
            body.xScale = face; lit.xScale = face
            for (i, pip) in bagPips.enumerated() {
                pip.isHidden = i >= h.items.count
                if !pip.isHidden { pip.position = P(h.x - 10 + Double(i) * 10, h.y + 13) }
            }
            swing.isHidden = h.swing <= 0
            if h.swing > 0 {
                let path = CGMutablePath()
                let s0 = h.face > 0 ? -1.4 : Double.pi + 1.4, s1 = h.face > 0 ? 0.3 : Double.pi - 0.3
                path.addArc(center: .zero, radius: 30, startAngle: -s0, endAngle: -s1, clockwise: h.face > 0)
                swing.path = path; swing.position = P(h.x + h.face * 12, h.y - 30); swing.strokeColor = UIColor(220, 235, 250, min(1, h.swing * 3))
            }
            let still = look.still
            bar.root.isHidden = still; level.isHidden = still
            if !still {
                bar.place(x: h.x, y: h.y - 98); bar.set(h.hp / b.heroMaxHp())
                if shownLevel != h.level {
                    shownLevel = h.level
                    level.attributedText = NSAttributedString(string: "\(h.level)", attributes: [
                        .font: UIFont(name: "Barlow-ExtraBold", size: 12) ?? .boldSystemFont(ofSize: 12),
                        .foregroundColor: UIColor(hex: 0xffe2a0), .strokeColor: UIColor(white: 0, alpha: 0.8), .strokeWidth: -12,
                    ])
                }
                level.position = P(h.x - 32, h.y - 94)
            }
            double.isHidden = still || h.double <= 0; double.position = P(h.x, h.y - 30)
            haste.isHidden = still || h.haste <= 0; haste.position = P(h.x, h.y)
            sunrise.isHidden = still || h.sunriseT <= 0; sunrise.position = P(h.x, h.y - 40); sunrise.alpha = 0.35 + 0.1 * sin(T * 6)
            let away = hypot2(h.anchorX - h.x, h.anchorY - h.y) > 20
            post.isHidden = still || !away
            if away { post.position = P(h.anchorX, h.anchorY) }
        }
    }

    /// One stone plot's live marks: submerged patch, rubble cluster & salvage arc, gear ring, "+" mark & selection ring.
    final class PlotNode {
        let root = SKNode()
        private let sunk = SKShapeNode(ellipseOf: CGSize(width: 68, height: 28))
        private let submerged = SKShapeNode()
        private let rubbleRoot = SKNode()
        private var rubbleRocks: [SKShapeNode] = []
        private let rubbleRim = SKShapeNode(ellipseOf: CGSize(width: 78, height: 32))
        private let salvageArc = SKShapeNode()
        private let gearHolder = SKNode()
        private let gear = SKShapeNode()
        private let lowered = SKShapeNode(ellipseOf: CGSize(width: 68, height: 28))
        private let hintA = SKShapeNode(ellipseOf: CGSize(width: 92, height: 38))
        private let hintB = SKShapeNode(ellipseOf: CGSize(width: 100, height: 42))
        private let tide = SKShapeNode(ellipseOf: CGSize(width: 72, height: 29))
        private let sel = SKShapeNode(ellipseOf: CGSize(width: 78, height: 32))
        private let plus = Art.shared.sprite("plus")
        private let gearKind: SplitId?

        init(plot p: PlotRt, index: Int, lava: Bool) {
            gearKind = p.gear
            root.position = P(p.x, p.y); root.zPosition = Z.plots
            sunk.fillColor = UIColor(40, 52, 40, 0.9); sunk.strokeColor = UIColor(150, 180, 150, 0.25)
            root.addChild(sunk)
            let subRect = CGPath(ellipseIn: CGRect(x: -32, y: -13, width: 64, height: 26), transform: nil)
            submerged.path = subRect.copy(dashingWithPhase: 0, lengths: [4, 5])
            submerged.fillColor = lava ? UIColor(80, 45, 30, 0.45) : UIColor(65, 108, 132, 0.48)
            submerged.strokeColor = UIColor(220, 235, 245, 0.32); submerged.lineWidth = 1.2
            root.addChild(submerged)
            let specs: [(Double, Double, Double, Double)] = [(-9, 4, 26, 16), (10, 3, 24, 14), (1, 10, 22, 16)]
            for (rx, ry, rw, rh) in specs {
                let rock = SKShapeNode(ellipseOf: CGSize(width: rw, height: rh))
                rock.position = CGPoint(x: rx, y: ry); rock.lineWidth = 0
                rubbleRoot.addChild(rock); rubbleRocks.append(rock)
            }
            rubbleRim.strokeColor = UIColor(255, 220, 160, 0.55); rubbleRim.lineWidth = 1.4; rubbleRim.position = CGPoint(x: 0, y: 2)
            salvageArc.strokeColor = UIColor(hex: 0x7fe698); salvageArc.lineWidth = 3; salvageArc.position = CGPoint(x: 0, y: 10)
            rubbleRoot.addChild(rubbleRim); rubbleRoot.addChild(salvageArc)
            root.addChild(rubbleRoot)
            if let g = p.gear {
                gearHolder.position = CGPoint(x: 0, y: -2); gearHolder.yScale = 0.4
                let path = CGMutablePath()
                for k in 0..<10 { let a = Double(k) / 10 * .pi * 2; path.move(to: CGPoint(x: cos(a) * 34, y: sin(a) * 34)); path.addLine(to: CGPoint(x: cos(a) * 42, y: sin(a) * 42)) }
                path.addEllipse(in: CGRect(x: -34, y: -34, width: 68, height: 68))
                gear.path = path; gear.lineWidth = 4
                gear.strokeColor = g == .a ? UIColor(230, 180, 90, 0.8) : UIColor(170, 180, 195, 0.8)
                gearHolder.addChild(gear)
                root.addChild(gearHolder)
                lowered.fillColor = UIColor(10, 12, 10, 0.45); lowered.lineWidth = 0
                root.addChild(lowered)
            }
            hintA.strokeColor = UIColor(255, 248, 232, 0.95); hintA.lineWidth = 3; hintA.position = CGPoint(x: 0, y: 1.5)
            hintB.strokeColor = UIColor(40, 30, 22, 0.75); hintB.lineWidth = 2; hintB.position = CGPoint(x: 0, y: 1.5)
            tide.strokeColor = UIColor(110, 210, 225, 0.55); tide.lineWidth = 1.6; tide.position = CGPoint(x: 0, y: 1.5)
            sel.lineWidth = 2.5; sel.position = CGPoint(x: 0, y: 1.5)
            plus.position = CGPoint(x: 0, y: 2)
            [tide, hintA, hintB, sel, plus].forEach(root.addChild)
        }

        func update(_ p: PlotRt, used: Bool, gearUp: Bool, hint: Bool, selected: Bool, plus showPlus: Bool, tidePearl: Bool, T: Double) {
            sunk.isHidden = !p.sunk
            submerged.isHidden = p.sunk || p.unlocked
            gearHolder.isHidden = p.sunk || !p.unlocked || gearKind == nil
            lowered.isHidden = p.sunk || !p.unlocked || gearKind == nil || gearUp
            if let g = gearKind { gear.zRotation = -T * (gearUp ? 0.6 : 0.15) * (g == .a ? 1 : -1) }
            if let rb = p.rubble, p.unlocked && !p.sunk {
                rubbleRoot.isHidden = false
                let col = rb.kind == .slag ? UIColor(hex: 0x4a352e) : rb.kind == .crane ? UIColor(hex: 0x585c62) : UIColor(hex: 0x645c50)
                for rk in rubbleRocks { rk.fillColor = col }
                rubbleRim.isHidden = !selected
                if let hold = rb.holdSec, p.rubbleLeft < hold {
                    let prog = max(0, min(1, 1 - p.rubbleLeft / hold))
                    let ap = CGMutablePath()
                    ap.addArc(center: .zero, radius: 20, startAngle: .pi / 2, endAngle: .pi / 2 - prog * .pi * 2, clockwise: true)
                    salvageArc.path = ap; salvageArc.isHidden = false
                } else { salvageArc.isHidden = true }
            } else {
                rubbleRoot.isHidden = true
            }
            let open = p.unlocked && p.rubble == nil && !p.sunk && !used
            tide.isHidden = !(open && tidePearl && p.nearWater)
            hintA.isHidden = !(open && hint); hintB.isHidden = hintA.isHidden
            sel.isHidden = !(open && selected)
            if !sel.isHidden { sel.strokeColor = UIColor(255, 214, 140, 0.6 + 0.3 * sin(T * 6)) }
            plus.isHidden = !(open && showPlus)
            plus.alpha = (selected || hint) ? 1.0 : 0.62
        }
    }
}
