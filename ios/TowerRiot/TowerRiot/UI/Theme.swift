import SwiftUI

/// The morning look, from the colour tokens at the top of src/styles.css.
/// Pale limestone paper, dark iron ink, one rust accent, gold only for stars and coin.
enum Ink {
    static let paper = Color(hex: 0xF7F3EB)
    static let paper2 = Color(hex: 0xEEE7DB)
    static let paper3 = Color(hex: 0xE1D8C9)
    static let paperGlass = Color(hex: 0xF7F3EB, alpha: 0.92)
    static let rule = Color(hex: 0xC9BFB2)
    static let ruleStrong = Color(hex: 0xA39688)
    static let ink = Color(hex: 0x261D16)
    static let inkDim = Color(hex: 0x554B42)
    static let inkFaint = Color(hex: 0x645C53)
    static let accent = Color(hex: 0xA43D29)
    static let accentLo = Color(hex: 0x8C2F1F)
    static let accentInk = Color(hex: 0xF8F5EE)
    static let gold = Color(hex: 0xDE9D16)
    static let goldDeep = Color(hex: 0xAA6A00)
    static let life = Color(hex: 0xCC3430)
    static let good = Color(hex: 0x357A3A)
    static let hollow = Color(hex: 0x11846E)
    static let skyTop = Color(hex: 0xBCDDF1)
    static let skyLow = Color(hex: 0xF8EDD8)
    static let shadow = Color(hex: 0x261D16, alpha: 0.18)
    static let scrim = Color(hex: 0x261D16, alpha: 0.45)
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB, red: Double(hex >> 16 & 0xFF) / 255, green: Double(hex >> 8 & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: alpha)
    }
}

/// Cinzel for the logo, screen titles, stage names and battle banners. Barlow for everything else.
enum Face {
    static func title(_ size: CGFloat, heavy: Bool = false) -> Font { .custom(heavy ? "Cinzel-ExtraBold" : "Cinzel-Bold", size: size) }
    static func body(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font {
        switch weight {
        case .heavy, .black: return .custom("Barlow-ExtraBold", size: size)
        case .bold: return .custom("Barlow-Bold", size: size)
        case .semibold: return .custom("Barlow-SemiBold", size: size)
        default: return .custom("Barlow-Medium", size: size)
        }
    }
}

/// The game's buttons: paper with an ink rule, or rust for the one thing to act on.
struct PaperButton: ButtonStyle {
    enum Kind { case plain, primary, danger, dangerSolid }
    var kind: Kind = .plain
    var big = false
    var poor = false
    /// At least 44 points high, for the small buttons that sit alone where a thumb has to find them.
    var tall = false
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        let (bg, fg, edge): (Color, Color, Color) = {
            switch kind {
            case .plain: return (configuration.isPressed ? Ink.paper2 : Ink.paper, Ink.ink, Ink.ruleStrong)
            case .primary: return (configuration.isPressed ? Ink.accentLo : Ink.accent, Ink.accentInk, Ink.accentLo)
            case .danger: return (Ink.paper, Ink.life, Ink.life)
            case .dangerSolid: return (Ink.life, Ink.accentInk, Ink.life)
            }
        }()
        return configuration.label
            .font(Face.body(big ? 18 : 15, kind == .primary ? .heavy : .bold))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .foregroundStyle(fg)
            .padding(.horizontal, big ? 24 : 14)
            .padding(.vertical, big ? 12 : 8)
            .frame(minHeight: tall ? 44 : nil)
            .background(RoundedRectangle(cornerRadius: 5).fill(bg))
            .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(edge, lineWidth: 1))
            .shadow(color: configuration.isPressed ? .clear : Ink.shadow, radius: 0, x: 0, y: 1)
            .offset(y: configuration.isPressed ? 1 : 0)
            .opacity(enabled && !poor ? 1 : 0.5)
            .contentShape(Rectangle())
    }
}

/// A square icon button, 44 points minimum target, for the HUD and menu corners.
struct IconButton: View {
    let icon: String
    var label: String
    var dim = false
    var active = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            ArtIcon(name: icon, size: 20).foregroundStyle(active ? Ink.accentInk : dim ? Ink.inkDim : Ink.ink)
                .frame(width: 44, height: 44)
                .background(RoundedRectangle(cornerRadius: 5).fill(active ? Ink.accent : Ink.paperGlass))
                .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(active ? Ink.accentLo : Ink.ruleStrong, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(active ? .isSelected : [])
    }
}

/// One of the line icons baked from the web game's SVGs, tinted with the text colour.
struct ArtIcon: View {
    let name: String
    var size: CGFloat = 18
    var body: some View {
        if let img = ArtFiles.uiImage("ui-\(name)") {
            Image(uiImage: img).renderingMode(.template).resizable().interpolation(.high).frame(width: size, height: size)
        } else {
            Color.clear.frame(width: size, height: size)
        }
    }
}

/// A painted picture (tower, foe, Wren) baked from the web painters.
struct ArtPicture: View {
    let name: String
    var size: CGFloat
    var body: some View {
        if let img = ArtFiles.uiImage(name) {
            Image(uiImage: img).resizable().interpolation(.high).scaledToFit().frame(width: size, height: size)
        } else {
            Color.clear.frame(width: size, height: size)
        }
    }
}

/// A paper card: the panels that sit over the map and the menus.
struct PaperCard: ViewModifier {
    var fill: Color = Ink.paper
    var radius: CGFloat = 7
    func body(content: Content) -> some View {
        content
            .background(RoundedRectangle(cornerRadius: radius).fill(fill))
            .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(Ink.rule, lineWidth: 1))
    }
}

extension View {
    func paperCard(_ fill: Color = Ink.paper, radius: CGFloat = 7) -> some View { modifier(PaperCard(fill: fill, radius: radius)) }
}

/// Stars: gold when won, a pale rule colour when not.
struct Stars: View {
    let n: Int
    var size: CGFloat = 18
    var body: some View {
        HStack(spacing: size * 0.2) {
            ForEach(0..<3, id: \.self) { i in
                Text("★").font(.system(size: size)).foregroundStyle(i < n ? Ink.gold : Ink.ruleStrong)
                    .shadow(color: i < n ? Ink.goldDeep : .clear, radius: 0, x: 0, y: 1)
            }
        }
        .accessibilityLabel("\(n) of 3 stars")
    }
}

/// A coin and a number: gold is only for coin and stars.
struct Price: View {
    let n: Int
    var size: CGFloat = 14
    var body: some View {
        HStack(spacing: 3) {
            Circle().fill(Ink.gold).overlay(Circle().strokeBorder(Ink.goldDeep, lineWidth: 1)).frame(width: size * 0.8, height: size * 0.8)
            Text("\(n)").font(Face.body(size, .heavy))
        }
    }
}

/// A segmented choice, as in the web game's .seg.
struct Segments<T: Hashable>: View {
    let items: [(T, String)]
    let selected: T
    /// Each choice at least 44 points high, for pickers that stand alone outside a crowded menu.
    var tall = false
    let pick: (T) -> Void
    var body: some View {
        HStack(spacing: 2) {
            ForEach(items, id: \.0) { item in
                Button { pick(item.0) } label: {
                    Text(item.1).font(Face.body(14, item.0 == selected ? .heavy : .semibold)).lineLimit(1).minimumScaleFactor(0.8)
                        .foregroundStyle(item.0 == selected ? Ink.ink : Ink.inkDim)
                        .padding(.horizontal, items.count >= 4 ? 8 : 10).padding(.vertical, 6)
                        .frame(minHeight: tall ? 44 : nil)
                        .background(RoundedRectangle(cornerRadius: 4).fill(item.0 == selected ? Ink.paper : .clear))
                        .contentShape(Rectangle())
                }.buttonStyle(.plain)
                    .accessibilityAddTraits(item.0 == selected ? .isSelected : [])
            }
        }
        .padding(3)
        .background(RoundedRectangle(cornerRadius: 5).fill(Ink.paper3))
    }
}
