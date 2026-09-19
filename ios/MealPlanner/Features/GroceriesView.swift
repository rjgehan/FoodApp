import SwiftUI
import UIKit

/// The list, in aisle order, with a tap target the size of the whole row — the one screen that
/// gets used standing up in a shop.
struct GroceriesView: View {
    var session: Session
    var sample: [GroceryItem]?
    var sampleCategories: [GroceryCategory]?

    @State private var items: [GroceryItem] = []
    @State private var categories: [GroceryCategory] = []
    @State private var error: String?
    @State private var copied = false

    private var toBuy: [GroceryItem] { items.filter { !$0.checked } }
    private var inCart: [GroceryItem] { items.filter(\.checked) }

    /// Unsorted last, the way the web groups them.
    private var groups: [(category: GroceryCategory?, items: [GroceryItem])] {
        var out: [(GroceryCategory?, [GroceryItem])] = []
        for category in categories {
            let rows = toBuy.filter { $0.categoryId == category.id }
            if !rows.isEmpty { out.append((category, rows)) }
        }
        let loose = toBuy.filter { item in
            item.categoryId == nil || !categories.contains(where: { $0.id == item.categoryId })
        }
        if !loose.isEmpty { out.append((nil, loose)) }
        return out
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(toBuy.isEmpty ? "Nothing to buy" : "\(toBuy.count) to buy")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .listRowBackground(Color.clear)
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
                if copied {
                    Section {
                        Label(
                            "Copied. In Notes: paste, select the lines, then tap the checklist button.",
                            systemImage: "checkmark.circle.fill"
                        )
                        .foregroundStyle(.green)
                        .font(.footnote)
                    }
                }

                ForEach(groups, id: \.category?.id) { group in
                    Section(group.category?.name ?? "Unsorted") {
                        ForEach(group.items) { item in
                            row(item)
                        }
                    }
                }

                if !inCart.isEmpty {
                    Section("Got it") {
                        ForEach(inCart) { item in
                            row(item)
                        }
                    }
                }
            }
            .navigationTitle("Groceries")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu("List options", systemImage: "ellipsis.circle") {
                        Button("Copy for Notes", systemImage: "doc.on.doc", action: copyForNotes)
                    }
                }
            }
            .refreshable { await load() }
        }
        .task { await load() }
    }

    private func row(_ item: GroceryItem) -> some View {
        Button {
            Task { await toggle(item) }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: item.checked ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(item.checked ? Color.accentColor : Color.secondary)
                VStack(alignment: .leading, spacing: 1) {
                    Text(item.name)
                        .strikethrough(item.checked)
                        .foregroundStyle(item.checked ? .secondary : .primary)
                    if let detail = detail(item) {
                        Text(detail).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func detail(_ item: GroceryItem) -> String? {
        var parts = [item.amount].compactMap { $0 }
        if item.checked, let who = item.checkedByName { parts.append("got by \(who)") }
        if !item.checked, item.inCupboard { parts.append("In the cupboard") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
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
            async let list = APIClient.shared.groceries(household: household)
            async let aisles = APIClient.shared.categories(household: household)
            (items, categories) = try await (list, aisles)
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Optimistic: the tick has to feel instant in a shop, and the server is the tiebreaker.
    private func toggle(_ item: GroceryItem) async {
        guard let household = session.household?.id else { return }
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        let wanted = !item.checked
        items[index] = GroceryItem(
            id: item.id, name: item.name, quantity: item.quantity, unit: item.unit,
            checked: wanted, checkedByName: session.displayName, categoryId: item.categoryId,
            inCupboard: item.inCupboard
        )
        do {
            let saved = try await APIClient.shared.setChecked(household: household, item: item.id, checked: wanted)
            if let i = items.firstIndex(where: { $0.id == saved.id }) { items[i] = saved }
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }

    /// The same export the web has: plain lines, aisle order, nothing else — the shape Apple
    /// Notes converts into a checklist in one go. It will not take checkboxes from a paste.
    private func copyForNotes() {
        let lines = groups.flatMap(\.items).map { item in
            [item.amount, item.name].compactMap { $0 }.joined(separator: " ")
        }
        guard !lines.isEmpty else { return }
        UIPasteboard.general.string = lines.joined(separator: "\n")
        withAnimation { copied = true }
        Task {
            try? await Task.sleep(for: .seconds(4))
            withAnimation { copied = false }
        }
    }
}

#Preview("Groceries") {
    GroceriesView(session: .preview, sample: SampleData.groceries, sampleCategories: SampleData.categories)
}
