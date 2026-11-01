import SpriteKit
import UIKit
import TowerRiotKit

/// Files in the app bundle: the art baked from the web painters by `npm run native:art`.
enum ArtFiles {
    static func url(_ name: String, _ ext: String) -> URL? {
        Bundle.main.url(forResource: name, withExtension: ext) ?? Bundle.main.url(forResource: name, withExtension: ext, subdirectory: "Art")
    }

    private static var images: [String: UIImage] = [:]

    /// A baked PNG as an image for the menus. Baked at 2x unless it is a line icon (3x).
    static func uiImage(_ name: String) -> UIImage? {
        if let hit = images[name] { return hit }
        guard let u = url(name, "png"), let data = try? Data(contentsOf: u) else { return nil }
        let img = UIImage(data: data, scale: name.hasPrefix("ui-") ? 3 : 2)
        images[name] = img
        return img
    }

    /// Lantern posts and smoothed water lines for each stage, as the web scene places them.
    struct MapMeta: Decodable { let posts: [[Double]]; let waters: [Water] }
    struct Water: Decodable { let w: Double; let pts: [[Double]] }

    static let maps: [Int: MapMeta] = {
        guard let u = url("maps", "json"), let data = try? Data(contentsOf: u),
              let raw = try? JSONDecoder().decode([String: MapMeta].self, from: data) else { return [:] }
        return Dictionary(uniqueKeysWithValues: raw.compactMap { k, v in Int(k).map { ($0, v) } })
    }()
}

/// One painted picture on the sprite sheet: its texture, its size in world units, and where its origin sits.
struct ArtFrame {
    let texture: SKTexture
    let size: CGSize
    let anchor: CGPoint
}

/// The sprite sheet and the soft shapes the scene builds itself (glows, shadows, the vignette).
final class Art {
    static let shared = Art()

    private var frames: [String: ArtFrame] = [:]
    let glow: SKTexture
    let shadow: SKTexture
    let disc: SKTexture
    let soft: SKTexture
    let streak: SKTexture

    private init() {
        struct Sheet: Decodable { let pages: [[Raw]]; let frames: [String: [Double]] }
        enum Raw: Decodable {
            case s(String), n(Double)
            init(from d: Decoder) throws {
                let c = try d.singleValueContainer()
                if let s = try? c.decode(String.self) { self = .s(s) } else { self = .n(try c.decode(Double.self)) }
            }
        }
        if let u = ArtFiles.url("sprites", "json"), let data = try? Data(contentsOf: u), let sheet = try? JSONDecoder().decode(Sheet.self, from: data) {
            var pages: [(SKTexture, CGFloat, CGFloat)] = []
            for p in sheet.pages {
                guard case let .s(file) = p[0], case let .n(w) = p[1], case let .n(h) = p[2] else { continue }
                let base = file.replacingOccurrences(of: ".png", with: "")
                let img = ArtFiles.url(base, "png").flatMap { UIImage(contentsOfFile: $0.path) } ?? UIImage()
                let tex = SKTexture(image: img)
                tex.filteringMode = .linear
                pages.append((tex, CGFloat(w), CGFloat(h)))
            }
            for (name, f) in sheet.frames where f.count == 8 {
                let pi = Int(f[0])
                guard pi < pages.count else { continue }
                let (tex, W, H) = pages[pi]
                let x = CGFloat(f[1]), y = CGFloat(f[2]), w = CGFloat(f[3]), h = CGFloat(f[4])
                let s = CGFloat(f[7])
                let rect = CGRect(x: x / W, y: 1 - (y + h) / H, width: w / W, height: h / H)
                let size = CGSize(width: w / s, height: h / s)
                let anchor = CGPoint(x: CGFloat(f[5]) / size.width, y: 1 - CGFloat(f[6]) / size.height)
                frames[name] = ArtFrame(texture: SKTexture(rect: rect, in: tex), size: size, anchor: anchor)
            }
        }
        glow = Art.radial(128, stops: [(0, 1), (0.35, 0.45), (1, 0)])
        shadow = Art.radial(64, stops: [(0, 1), (1, 0)], black: true)
        disc = Art.radial(64, stops: [(0, 1), (0.92, 1), (1, 0)])
        soft = Art.radial(64, stops: [(0, 1), (1, 0)])
        streak = Art.image(CGSize(width: 64, height: 4)) { g, size in
            let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [UIColor(white: 1, alpha: 0).cgColor, UIColor.white.cgColor] as CFArray, locations: [0, 1])!
            g.drawLinearGradient(grad, start: .zero, end: CGPoint(x: size.width, y: 0), options: [])
        }
    }

    func frame(_ name: String) -> ArtFrame? { frames[name] }

    /// A sprite for a painted picture, sized in world units with its origin at the node's position.
    func sprite(_ name: String) -> SKSpriteNode {
        let n = SKSpriteNode()
        set(n, name)
        return n
    }

    func set(_ n: SKSpriteNode, _ name: String) {
        guard let f = frames[name] else { n.texture = nil; n.size = .zero; return }
        if n.texture !== f.texture { n.texture = f.texture }
        n.size = f.size
        n.anchorPoint = f.anchor
    }

    /* ------------------------------------------------------------------ drawn textures */

    static func image(_ size: CGSize, scale: CGFloat = 2, _ draw: (CGContext, CGSize) -> Void) -> SKTexture {
        let fmt = UIGraphicsImageRendererFormat()
        fmt.scale = scale
        fmt.opaque = false
        let img = UIGraphicsImageRenderer(size: size, format: fmt).image { ctx in draw(ctx.cgContext, size) }
        let t = SKTexture(image: img)
        t.filteringMode = .linear
        return t
    }

    /// A white (or black) round fade with the given alpha stops: tinted by the sprite's colour.
    static func radial(_ px: CGFloat, stops: [(CGFloat, CGFloat)], black: Bool = false) -> SKTexture {
        image(CGSize(width: px, height: px), scale: 1) { g, size in
            let v: CGFloat = black ? 0 : 1
            let colors = stops.map { UIColor(white: v, alpha: $0.1).cgColor }
            let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors as CFArray, locations: stops.map(\.0))!
            let c = CGPoint(x: size.width / 2, y: size.height / 2)
            g.drawRadialGradient(grad, startCenter: c, startRadius: 0, endCenter: c, endRadius: size.width / 2, options: [])
        }
    }

    /// The map's vignette at full strength: the scene sets its alpha (0.16 by day, 0.7 at night).
    static func vignette() -> SKTexture {
        image(CGSize(width: 320, height: 180), scale: 1) { g, size in
            let k = size.width / World.width
            let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [UIColor(white: 0, alpha: 0).cgColor, UIColor(white: 0, alpha: 1).cgColor] as CFArray, locations: [0, 1])!
            // Flipped: CG draws y up, the world is y down.
            g.translateBy(x: 0, y: size.height); g.scaleBy(x: 1, y: -1)
            g.drawRadialGradient(grad, startCenter: CGPoint(x: World.width / 2 * k, y: World.height * 0.55 * k), startRadius: World.height * 0.3 * k,
                                 endCenter: CGPoint(x: World.width / 2 * k, y: World.height / 2 * k), endRadius: World.width * 0.75 * k, options: [.drawsAfterEndLocation])
        }
    }

    /// Low sun from the upper right.
    static func sun(_ rgb: (CGFloat, CGFloat, CGFloat), _ a: CGFloat) -> SKTexture {
        image(CGSize(width: 320, height: 180), scale: 1) { g, size in
            let k = size.width / World.width
            let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [UIColor(red: rgb.0, green: rgb.1, blue: rgb.2, alpha: a).cgColor, UIColor(red: 1, green: 225 / 255, blue: 160 / 255, alpha: 0).cgColor] as CFArray, locations: [0, 1])!
            g.translateBy(x: 0, y: size.height); g.scaleBy(x: 1, y: -1)
            let c = CGPoint(x: World.width * 0.92 * k, y: -60 * k)
            g.drawRadialGradient(grad, startCenter: c, startRadius: 40 * k, endCenter: c, endRadius: World.width * 1.1 * k, options: [.drawsBeforeStartLocation])
        }
    }
}


extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(red: CGFloat(hex >> 16 & 0xFF) / 255, green: CGFloat(hex >> 8 & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
    }
    convenience init(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) {
        self.init(red: r / 255, green: g / 255, blue: b / 255, alpha: a)
    }
    /// "#rrggbb", as the game data writes rune colours.
    convenience init(css: String) {
        let s = css.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        self.init(hex: UInt32(s, radix: 16) ?? 0xFFFFFF)
    }
}
