import SwiftUI

/**
 The common things a kitchen already has — flour, salt, oil, ketchup — to tick through in one
 go, so a new household's cupboard does not start empty and get filled a name at a time.

 Offered once, straight after a household is made, and any time after from the Cupboard's
 menu. What is in the cupboard already shows ticked in green and stays as it is. The list
 comes from the server, so the web offers exactly the same one.
*/
struct StartCupboardSheet: View {
    let household: UUID
    /// Straight after making the household: it says hello, and offers Skip.
    var first = false
    var sample: [StarterGroup]?
    var onAdded: (Int) async -> Void = { _ in }

    @Environment(\.dismiss) private var dismiss
    @State private var groups: [StarterGroup]?
    @State private var chosen: Set<String> = []
    @State private var busy = false
    @State private var error: String?

    // The mockup's 7.3: chips to tick — green with a tick once chosen, plain with a + until then —
    // and one button at the bottom. Straight after making the house it is a prompt (its own
    // heading, Skip under the button); from the Cupboard's menu it is an ordinary sheet with a
    // close button.
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if first {
                    PromptHeader(title: "Stock your cupboard", line: intro)
                } else {
                    SheetHeader("Start with the basics", subtitle: intro) { dismiss() }
                }

                if let error {
                    Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
                }

                if let groups {
                    ForEach(groups, id: \.name) { group in
                        section(group)
                    }
                } else if error == nil {
                    ProgressView().frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 26)
            .padding(.bottom, 12)
        }
        // The way out stays in reach at the bottom, however far down the list you are.
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 0) {
                Button {
                    Task { await add() }
                } label: {
                    Text(busy ? "Adding…" : chosen.isEmpty ? "Add to cupboard" : "Add \(chosen.count) to cupboard")
                }
                .buttonStyle(.primary)
                .disabled(busy || chosen.isEmpty)

                if first {
                    PromptWayOut("Skip") { dismiss() }
                        .disabled(busy)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 10)
            .padding(.bottom, 6)
            .background(Palette.bg)
        }
        .kitchenSheet([.large])
        .task { await load() }
        // Skip is the one way out of the first one, so a stray swipe does not lose the list.
        .interactiveDismissDisabled(first && !chosen.isEmpty)
    }

    private var intro: String {
        let have = groups?.contains { $0.items.contains(where: \.have) } ?? false
        return "Tick what you already have. You can change it anytime."
            + (have ? " The pale green ones are in the cupboard already." : "")
    }

    private func section(_ group: StarterGroup) -> some View {
        let open = group.items.filter { !$0.have }.map(\.name)
        let allOn = !open.isEmpty && open.allSatisfy(chosen.contains)
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                // On the chips' leading edge rather than the label's usual 4pt in.
                SectionLabel(group.name)
                    .padding(.horizontal, -4)
                Spacer()
                if !open.isEmpty {
                    Button(allOn ? "Clear" : "Select all") {
                        if allOn { chosen.subtract(open) } else { chosen.formUnion(open) }
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Palette.accentInk)
                    .accessibilityLabel(allOn ? "Clear \(group.name)" : "Select all in \(group.name)")
                }
            }
            ChipFlow(spacing: 8) {
                ForEach(group.items, id: \.name) { item in
                    chip(item)
                }
            }
        }
    }

    private func chip(_ item: StarterItem) -> some View {
        let on = item.have || chosen.contains(item.name)
        return Button {
            if chosen.contains(item.name) { chosen.remove(item.name) } else { chosen.insert(item.name) }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: on ? "checkmark" : "plus").font(.system(size: 11, weight: on ? .heavy : .semibold))
                // Named the way recipes name them, lower case; shown the way the mockup writes them.
                Text(item.name.prefix(1).uppercased() + item.name.dropFirst())
            }
            // The mockup's chip: 32pt tall, 14pt words.
            .font(.system(size: 14, weight: .medium))
            .lineLimit(1)
            .padding(.horizontal, 12)
            .frame(minHeight: 32)
            .foregroundStyle(item.have ? Palette.herb : on ? Color.white : Palette.text)
            .background(item.have ? Palette.herbSoft : on ? Palette.herb : Palette.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(on ? Color.clear : Palette.border, lineWidth: 1))
            .fixedSize()
            .contentShape(Capsule())
        }
        .buttonStyle(PressFade())
        .disabled(item.have)
        .accessibilityLabel(item.name)
        .accessibilityAddTraits(on ? [.isSelected] : [])
        .accessibilityHint(item.have ? "Already in the cupboard" : "")
    }

    private func load() async {
        if let sample {
            groups = sample
            return
        }
        do {
            groups = try await APIClient.shared.cupboardStarters(household: household)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func add() async {
        guard !chosen.isEmpty, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let result = try await APIClient.shared.addStarters(household: household, names: Array(chosen))
            await onAdded(result.added)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Chips in rows, each row as full as it will go — the shape a list of short names wants on a
/// phone, where a column of them would be sixty rows long.
struct ChipFlow: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(0, rows.count - 1))
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var row = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = row.indices.isEmpty ? size.width : row.width + spacing + size.width
            if needed > width, !row.indices.isEmpty {
                rows.append(row)
                row = Row()
            }
            row.width = row.indices.isEmpty ? size.width : row.width + spacing + size.width
            row.height = max(row.height, size.height)
            row.indices.append(index)
        }
        if !row.indices.isEmpty { rows.append(row) }
        return rows
    }
}

/**
 A one-time copy of another of your households' cupboards into this one — for somebody with
 two houses setting up the second. Pick the house, see how much would come across, say yes.
 What is here already stays as it is, so doing it twice only brings what is new.
*/
struct CopyCupboardSheet: View {
    var session: Session
    /// What is in this cupboard now, to say how much of theirs is new.
    let items: [CupboardItem]
    var sample: [CupboardItem]?
    var onCopied: (CupboardCopied) async -> Void = { _ in }

    @Environment(\.dismiss) private var dismiss
    @State private var picked: HouseholdSummary?
    @State private var theirs: [CupboardItem]?
    @State private var busy = false
    @State private var error: String?

    private var others: [HouseholdSummary] {
        session.households.filter { $0.id != session.household?.id }
    }

    /// Matched by name, the way the server matches ingredients: case and spaces aside.
    private var missing: Int {
        let here = Set(items.map { key($0.name) })
        return (theirs ?? []).filter { !here.contains(key($0.name)) }.count
    }

    var body: some View {
        NavigationStack {
            Form {
                if let picked, let theirs {
                    KitchenSection {
                        Text(summary(from: picked.name, total: theirs.count))
                    } footer: {
                        if missing > 0 {
                            Text("Amounts, Low and Always have come across too. Nothing changes in \(picked.name).")
                        }
                    }
                    if missing > 0 {
                        KitchenSection {
                            Button(busy ? "Copying…" : "Copy \(things(missing))") {
                                Task { await copy(from: picked) }
                            }
                            .disabled(busy)
                        }
                    }
                } else {
                    KitchenSection {
                        ForEach(others) { household in
                            Button {
                                Task { await pick(household) }
                            } label: {
                                HStack {
                                    Text(household.name).foregroundStyle(.primary)
                                    Spacer()
                                    if picked?.id == household.id {
                                        ProgressView()
                                    } else {
                                        Image(systemName: "chevron.right")
                                            .font(.footnote.weight(.semibold))
                                            .foregroundStyle(.tertiary)
                                    }
                                }
                            }
                            .disabled(picked != nil)
                        }
                    } header: {
                        Text("Copy from")
                    } footer: {
                        Text("Copies what's in another house of yours into this cupboard. Only what isn't here yet comes across.")
                    }
                }
                if let error {
                    KitchenSection { Text(error).foregroundStyle(Palette.danger) }
                }
            }
            .kitchenList()
            .navigationTitle("Copy from another household")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if theirs != nil {
                        Button("Back") {
                            picked = nil
                            theirs = nil
                        }
                        .disabled(busy)
                    } else {
                        Button("Cancel") { dismiss() }
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func summary(from name: String, total: Int) -> String {
        let into = session.household?.name ?? "this household"
        if total == 0 { return "\(name)'s cupboard is empty, so there's nothing to copy." }
        let has = "\(name) has \(things(total)) in its cupboard."
        if missing == 0 { return "\(has) \(total == 1 ? "It's" : "All of them are") in \(into) already." }
        if missing == total { return "\(has) \(total == 1 ? "It" : "All of them") will be copied into \(into)." }
        let kept = total - missing
        return "\(has) \(things(missing)) will be copied into \(into); the \(kept) already here "
            + (kept == 1 ? "stays as it is." : "stay as they are.")
    }

    private func things(_ n: Int) -> String { "\(n) \(n == 1 ? "item" : "items")" }

    private func key(_ name: String) -> String { name.trimmingCharacters(in: .whitespaces).lowercased() }

    private func pick(_ household: HouseholdSummary) async {
        picked = household
        error = nil
        if let sample {
            theirs = sample
            return
        }
        do {
            theirs = try await APIClient.shared.cupboard(household: household.id)
        } catch {
            self.error = "Could not open \(household.name)'s cupboard."
            picked = nil
        }
    }

    private func copy(from source: HouseholdSummary) async {
        guard let household = session.household?.id, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let result = try await APIClient.shared.copyCupboard(into: household, from: source.id)
            await onCopied(result)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Start your cupboard") {
    Text("New household")
        .sheet(isPresented: .constant(true)) {
            StartCupboardSheet(household: SampleData.household.id, first: true, sample: SampleData.starters)
        }
}

#Preview("Start with the basics") {
    Text("Cupboard")
        .sheet(isPresented: .constant(true)) {
            StartCupboardSheet(household: SampleData.household.id, sample: SampleData.startersSomeHere)
        }
}

#Preview("Copy from another household") {
    let session = Session.preview
    session.households = [SampleData.household, SampleData.otherHousehold]
    return Text("Cupboard")
        .sheet(isPresented: .constant(true)) {
            CopyCupboardSheet(session: session, items: SampleData.cupboard, sample: SampleData.otherCupboard)
        }
}
