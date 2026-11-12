import SwiftUI
import TowerRiotKit

private struct NodePosKey: PreferenceKey {
    static var defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue()) { _, n in n }
    }
}

/// Skill trees: Embers from stars buy lasting upgrades. Refunds are free.
struct TreesView: View {
    @EnvironmentObject var app: AppModel
    @Environment(\.upright) private var upright
    @State private var nodeFrames: [String: CGRect] = [:]

    var body: some View {
        let s = app.save, c = s.cleared, trees = app.data.trees
        let tab = min(app.treeTab, trees.count - 1), t = trees[tab]
        VStack(spacing: 10) {
            TopBar(title: "\(s.embers.free) Embers to spend", back: { app.screen = .campaign(focus: nil) }) {
                Button("Refund all") { app.resetTrees() }.buttonStyle(PaperButton())
            }
            // Shown once after an old save had its trees refunded; gone when dismissed or on leaving this screen.
            if s.treesRefunded {
                HStack(spacing: 8) {
                    Text("The trees were rebalanced. Your Embers were refunded, so spend them again.")
                        .font(Face.body(13, .semibold)).foregroundStyle(Ink.ink).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    Button { app.clearTreesRefunded() } label: {
                        Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Ink.ink).frame(width: 44, height: 44)
                    }.buttonStyle(.plain).accessibilityLabel("Dismiss")
                }
                .padding(.leading, 12)
                .frame(maxWidth: 560)
                .paperCard(Ink.paper2)
            }
            Text("Earn Embers: one per star, two more for each stage cleared, one for a first Variant B clear of a stage, and one for a first clear of a stage with any Oath active. Refunds are free, so try other builds.")
                .font(Face.body(13)).foregroundStyle(Ink.inkFaint).multilineTextAlignment(.center).frame(maxWidth: 560)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 2) {
                    ForEach(Array(trees.enumerated()), id: \.offset) { i, tree in
                        Button { app.treeTab = i } label: {
                            HStack(spacing: 4) {
                                if tree.after > c { ArtIcon(name: "lock", size: 12) }
                                Text(tree.name).font(Face.body(14, i == tab ? .heavy : .semibold)).lineLimit(1)
                            }
                            .foregroundStyle(i == tab ? Ink.ink : Ink.inkDim)
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(RoundedRectangle(cornerRadius: 4).fill(i == tab ? Ink.paper : .clear))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(3)
                .background(RoundedRectangle(cornerRadius: 5).fill(Ink.paper3))
            }
            .fixedSize(horizontal: !upright, vertical: true)
            Text(t.after > c ? "Opens after stage \(t.after)." : t.blurb).font(Face.body(14)).foregroundStyle(Ink.inkDim)
            ScrollView {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(maximum: upright ? 600 : 340)), count: upright ? 1 : 2), spacing: 18) {
                    ForEach(t.nodes, id: \.id) { n in
                        NodeCard(node: n)
                            .background(GeometryReader { g in
                                Color.clear.preference(key: NodePosKey.self, value: [n.id: g.frame(in: .named("treeGrid"))])
                            })
                    }
                }
                // The links between nodes are drawn behind the grid, sized to it, so they share its coordinates.
                .background {
                    Canvas { ctx, _ in
                        for n in t.nodes {
                            guard let reqId = n.req, let a = nodeFrames[reqId], let b = nodeFrames[n.id] else { continue }
                            var p = SwiftUI.Path()
                            let start = CGPoint(x: a.midX, y: a.maxY)
                            let end = CGPoint(x: b.midX, y: b.minY)
                            let my = (start.y + end.y) / 2
                            p.move(to: start)
                            p.addCurve(to: end, control1: CGPoint(x: start.x, y: my), control2: CGPoint(x: end.x, y: my))
                            let bothOwned = s.nodes.contains(n.id) && s.nodes.contains(reqId)
                            let canBuy = s.canBuyNode(n.id)
                            let col = bothOwned ? Color(hex: 0x261D16) : canBuy ? Color(hex: 0xA43D29) : Color(hex: 0xA39688).opacity(0.6)
                            ctx.stroke(p, with: .color(col), style: StrokeStyle(lineWidth: bothOwned ? 2.5 : 1.6, dash: bothOwned ? [] : [5, 4]))
                        }
                    }
                }
                .coordinateSpace(name: "treeGrid")
                .onPreferenceChange(NodePosKey.self) { nodeFrames = $0 }
                .frame(maxWidth: 700)
                .frame(maxWidth: .infinity)
            }
        }
        .padding(16)
        .onDisappear { app.clearTreesRefunded() }
    }
}

private struct NodeCard: View {
    @EnvironmentObject var app: AppModel
    let node: TreeNode

    var body: some View {
        let s = app.save, c = s.cleared, owned = s.nodes.contains(node.id), can = s.canBuyNode(node.id)
        let req = node.req.flatMap { app.data.nodes[$0] }
        let exclNode = node.excl.flatMap { app.data.nodes[$0] }
        let exclLocked = node.excl.map { s.nodes.contains($0) } ?? false
        let isCapstone = node.excl != nil
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(node.name).font(Face.body(16, .heavy)).foregroundStyle(Ink.ink)
                if isCapstone {
                    Text("Capstone").font(Face.body(11, .heavy)).foregroundStyle(Ink.accentLo)
                        .padding(.horizontal, 7).padding(.vertical, 1)
                        .background(Capsule().fill(Ink.accent.opacity(0.16)))
                }
            }
            Text(node.desc).font(Face.body(14)).foregroundStyle(Ink.inkDim).fixedSize(horizontal: false, vertical: true)
            if let req, !owned { Text("Needs \(req.name)").font(Face.body(12)).foregroundStyle(Ink.inkFaint) }
            if let after = node.after, after > c, !owned { Text("Opens after stage \(after)").font(Face.body(12, .semibold)).foregroundStyle(Ink.inkFaint) }
            if let exclNode, !owned, !exclLocked { Text("Capstone: locks \(exclNode.name)").font(Face.body(12)).foregroundStyle(Ink.accent) }
            if owned {
                Text("Learned").font(Face.body(12, .heavy)).foregroundStyle(Ink.paper)
                    .padding(.horizontal, 10).padding(.vertical, 2).background(Capsule().fill(Ink.ink))
            } else if exclLocked, let exclNode {
                Text("Locked by \(exclNode.name)").font(Face.body(12, .bold)).foregroundStyle(Ink.inkFaint)
                    .padding(.horizontal, 10).padding(.vertical, 2).background(Capsule().fill(Ink.paper3))
            } else {
                Button("\(node.cost) Embers") { app.buyNode(node.id) }
                    .buttonStyle(PaperButton(kind: can ? .primary : .plain))
                    .disabled(!can)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 7).fill(owned || can ? Ink.paper : Ink.paper2))
        .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(owned ? (isCapstone ? Ink.accentLo : Ink.ink) : can ? (isCapstone ? Ink.accent : Ink.inkFaint) : Ink.rule, lineWidth: isCapstone ? 1.5 : 1))
        .opacity(exclLocked ? 0.62 : 1)
    }
}
