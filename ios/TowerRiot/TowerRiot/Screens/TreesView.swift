import SwiftUI
import TowerRiotKit

/// Skill trees: Embers from stars buy lasting upgrades. Refunds are free.
struct TreesView: View {
    @EnvironmentObject var app: AppModel
    @Environment(\.upright) private var upright

    var body: some View {
        let s = app.save, c = s.cleared, trees = app.data.trees
        let tab = min(app.treeTab, trees.count - 1), t = trees[tab]
        VStack(spacing: 10) {
            TopBar(title: "\(s.embers.free) Embers to spend", back: { app.screen = .campaign(focus: nil) }) {
                Button("Refund all") { app.resetTrees() }.buttonStyle(PaperButton())
            }
            Text("Earn Embers from stars: one per star, two more for each stage cleared. Refunds are free, so try other builds.")
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
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(maximum: upright ? 600 : 340)), count: upright ? 1 : 2), spacing: 14) {
                    ForEach(t.nodes, id: \.id) { n in NodeCard(node: n) }
                }
                .frame(maxWidth: 700)
                .frame(maxWidth: .infinity)
            }
        }
        .padding(16)
    }
}

private struct NodeCard: View {
    @EnvironmentObject var app: AppModel
    let node: TreeNode

    var body: some View {
        let s = app.save, owned = s.nodes.contains(node.id), can = s.canBuyNode(node.id)
        let req = node.req.flatMap { app.data.nodes[$0] }
        VStack(alignment: .leading, spacing: 6) {
            Text(node.name).font(Face.body(16, .heavy)).foregroundStyle(Ink.ink)
            Text(node.desc).font(Face.body(14)).foregroundStyle(Ink.inkDim).fixedSize(horizontal: false, vertical: true)
            if let req, !owned { Text("Needs \(req.name)").font(Face.body(12)).foregroundStyle(Ink.inkFaint) }
            if owned {
                Text("Learned").font(Face.body(12, .heavy)).foregroundStyle(Ink.paper)
                    .padding(.horizontal, 10).padding(.vertical, 2).background(Capsule().fill(Ink.ink))
            } else {
                Button("\(node.cost) Embers") { app.buyNode(node.id) }
                    .buttonStyle(PaperButton(kind: can ? .primary : .plain))
                    .disabled(!can)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 7).fill(owned || can ? Ink.paper : Ink.paper2))
        .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(owned ? Ink.ink : can ? Ink.inkFaint : Ink.rule, lineWidth: 1))
    }
}
