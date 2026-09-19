import SwiftUI

/// What the house already has. Most things are a Have / Low toggle; the ones worth counting
/// carry an amount and a stepper. Grouped by the same aisles as the grocery list, because it is
/// the same ingredients seen from the other end.
struct CupboardView: View {
    var session: Session
    var sample: [CupboardItem]?
    var sampleCategories: [GroceryCategory]?

    @State private var items: [CupboardItem] = []
    @State private var categories: [GroceryCategory] = []
    @State private var query = ""
    @State private var error: String?
    @State private var editing: CupboardItem?
    @State private var switchingHousehold = false

    private var shown: [CupboardItem] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return q.isEmpty ? items : items.filter { $0.name.lowercased().contains(q) }
    }

    private var groups: [(category: GroceryCategory?, items: [CupboardItem])] {
        var out: [(GroceryCategory?, [CupboardItem])] = []
        for category in categories {
            let rows = shown.filter { $0.categoryId == category.id }
            if !rows.isEmpty { out.append((category, rows)) }
        }
        let loose = shown.filter { item in
            item.categoryId == nil || !categories.contains(where: { $0.id == item.categoryId })
        }
        if !loose.isEmpty { out.append((nil, loose)) }
        return out
    }

    private var subtitle: String {
        let low = items.filter(\.runningLow).count
        let things = "\(items.count) \(items.count == 1 ? "thing" : "things")"
        return low > 0 ? "\(things) · \(low) running low" : things
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(items.isEmpty ? "Nothing in the cupboard yet" : subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .listRowBackground(Color.clear)
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }

                ForEach(groups, id: \.category?.id) { group in
                    Section(group.category?.name ?? "Everything else") {
                        ForEach(group.items) { item in
                            row(item)
                                .contentShape(Rectangle())
                                .onTapGesture { editing = item }
                                .swipeActions(edge: .trailing) {
                                    Button("Buy again", systemImage: "cart.badge.plus") {
                                        Task { await buyAgain(item) }
                                    }
                                    .tint(.accentColor)
                                }
                        }
                    }
                }
            }
            .navigationTitle("Cupboard")
            .searchable(text: $query, prompt: "Do we have… ?")
            .refreshable { await load() }
            .householdHeader(session, switching: $switchingHousehold)
        }
        .task { await load() }
        .sheet(item: $editing) { item in
            CupboardItemSheet(item: item, session: session) { await load() }
        }
    }

    @ViewBuilder
    private func row(_ item: CupboardItem) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(item.name)
                if let detail = item.detail {
                    Text(detail).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 8)

            if item.tracksQuantity {
                // Worth counting: a stepper, so "how much rice is left" has an answer.
                HStack(spacing: 10) {
                    Button("Less", systemImage: "minus") { Task { await adjust(item, by: -1) } }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.plain)
                    Text(item.amount ?? "")
                        .font(.subheadline.weight(.medium).monospacedDigit())
                        .frame(minWidth: 52)
                    Button("More", systemImage: "plus") { Task { await adjust(item, by: 1) } }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.plain)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color(.tertiarySystemFill), in: Capsule())
            } else {
                // Everything else: the one-tap answer to "are we out?"
                Picker("Have or low", selection: Binding(
                    get: { item.runningLow },
                    set: { wanted in Task { await setLow(item, wanted) } }
                )) {
                    Text("Have").tag(false)
                    Text("Low").tag(true)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .frame(width: 128)
            }
        }
    }

    // MARK: - Behaviour

    private func load() async {
        if let sample {
            items = sample
            categories = sampleCategories ?? []
            return
        }
        guard let household = session.household?.id else { return }
        do {
            error = nil
            async let list = APIClient.shared.cupboard(household: household)
            async let aisles = APIClient.shared.categories(household: household)
            (items, categories) = try await (list, aisles)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func setLow(_ item: CupboardItem, _ low: Bool) async {
        guard let household = session.household?.id else { return }
        do {
            let saved = try await APIClient.shared.updateCupboard(household: household, item: item.id, runningLow: low)
            replace(saved)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func adjust(_ item: CupboardItem, by delta: Double) async {
        guard let household = session.household?.id, let current = item.quantity else { return }
        let wanted = max(0, current + delta)
        do {
            let saved = try await APIClient.shared.updateCupboard(household: household, item: item.id, quantity: wanted)
            replace(saved)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func buyAgain(_ item: CupboardItem) async {
        guard let household = session.household?.id else { return }
        do {
            try await APIClient.shared.buyAgain(household: household, item: item.id)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func replace(_ item: CupboardItem) {
        if let i = items.firstIndex(where: { $0.id == item.id }) { items[i] = item }
    }
}

/// What one thing in the cupboard is: whether it is a staple, whether it is counted, and the
/// ways out — back on the list, or gone. Tapping a row on the web opens the same thing.
struct CupboardItemSheet: View {
    let item: CupboardItem
    var session: Session
    var onChanged: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var staple: Bool
    @State private var tracks: Bool
    @State private var amount: Double
    @State private var unit: String
    @State private var busy = false
    @State private var error: String?

    init(item: CupboardItem, session: Session, onChanged: @escaping () async -> Void) {
        self.item = item
        self.session = session
        self.onChanged = onChanged
        _staple = State(initialValue: item.staple)
        _tracks = State(initialValue: item.tracksQuantity)
        _amount = State(initialValue: item.quantity ?? 1)
        _unit = State(initialValue: item.unit ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Status", value: item.runningLow ? "Running low" : "Have some")
                    LabeledContent("On the grocery list", value: item.onList ? "Yes" : "No")
                    if let amount = item.amount {
                        LabeledContent("In the cupboard", value: amount)
                    }
                }

                Section {
                    Toggle("Always have", isOn: $staple)
                    Toggle("Count how much is left", isOn: $tracks)
                    if tracks {
                        HStack {
                            Text("Amount")
                            Spacer()
                            TextField("0", value: $amount, format: .number)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 80)
                            TextField("unit", text: $unit)
                                .frame(width: 64)
                                .multilineTextAlignment(.trailing)
                        }
                    }
                } footer: {
                    Text("A staple goes back on the list as soon as it runs low.")
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }

                Section {
                    Button("Put it back on the list", systemImage: "cart.badge.plus") {
                        Task { await buyAgain() }
                    }
                    Button("Remove from the cupboard", systemImage: "trash", role: .destructive) {
                        Task { await remove() }
                    }
                }
            }
            .navigationTitle(item.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") { Task { await save() } }.disabled(busy)
                }
            }
        }
        .presentationDetents([.large])
    }

    private func save() async {
        guard let household = session.household?.id else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await APIClient.shared.editCupboard(
                household: household,
                item: item.id,
                staple: staple,
                trackQuantity: tracks,
                quantity: tracks ? amount : nil,
                unit: tracks ? unit : nil
            )
            await onChanged()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func buyAgain() async {
        guard let household = session.household?.id else { return }
        do {
            try await APIClient.shared.buyAgain(household: household, item: item.id)
            await onChanged()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func remove() async {
        guard let household = session.household?.id else { return }
        do {
            try await APIClient.shared.removeFromCupboard(household: household, item: item.id)
            await onChanged()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Cupboard") {
    CupboardView(session: .preview, sample: SampleData.cupboard, sampleCategories: SampleData.categories)
}
