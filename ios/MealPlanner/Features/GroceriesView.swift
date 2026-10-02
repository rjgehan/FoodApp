import SwiftUI
import UIKit

/**
 The shared list (mockup 4.1): one box to add to it, then everything grouped by aisle in the
 order the household walks the store, each aisle with its count. Each row has its amount in bold,
 the recipes it is for underneath, "Cupboard says you have 1" in sky when the cupboard already
 has some, and a mustard bell when a restock reminder is set on it.

 The circle ticks a thing off — a whole-row target is too easy to catch with a thumb while
 scrolling a shop list — and the rest of the row opens its sheet (aisle, reminder, cupboard,
 remove). Ticked things stay in their aisle, struck through at the bottom of it, until Done
 shopping takes them off: nothing jumps out from under a thumb mid-shop.
 */
struct GroceriesView: View {
    var session: Session
    var sample: [GroceryItem]?
    var sampleCategories: [GroceryCategory]?
    var sampleReminders: [RestockReminder]?
    var sampleCupboard: [CupboardItem]?

    @State private var items: [GroceryItem] = []
    @State private var categories: [GroceryCategory] = []
    /// Restock reminders by ingredient, for the bell on a row.
    @State private var reminders: [UUID: RestockReminder] = [:]
    /// What the cupboard holds, by ingredient, for "Cupboard says you have 1" and the item sheet.
    @State private var cupboard: [UUID: CupboardItem] = [:]
    @State private var error: String?
    @State private var toast: String?
    @State private var draft = ""
    @State private var open: GroceryItem?
    @State private var finishing = false
    @State private var switchingHousehold = false
    @State private var showingAccount = false
    @State private var showingIdeas = false
    @State private var sorting = false
    @State private var debugOpened = false

    /// Things nobody — no keyword list, no model — has put in an aisle yet.
    private var unplaced: Int {
        items.filter { $0.categoryId == nil && $0.ingredientId != nil }.count
    }

    private var ticked: [GroceryItem] { items.filter(\.checked) }

    /// Unsorted last, the way the web groups them; within an aisle, the basket sinks to the bottom.
    private var groups: [(category: GroceryCategory?, items: [GroceryItem])] {
        let ordered = items.filter { !$0.checked } + ticked
        var out: [(GroceryCategory?, [GroceryItem])] = []
        for category in categories {
            let rows = ordered.filter { $0.categoryId == category.id }
            if !rows.isEmpty { out.append((category, rows)) }
        }
        let loose = ordered.filter { item in
            item.categoryId == nil || !categories.contains(where: { $0.id == item.categoryId })
        }
        if !loose.isEmpty { out.append((nil, loose)) }
        return out
    }

    var body: some View {
        NavigationStack {
            List {
                VStack(alignment: .leading, spacing: 0) {
                    TopBar(session: session, switching: $switchingHousehold, account: $showingAccount, ideas: $showingIdeas)
                    LargeTitle("Groceries") { optionsMenu }
                }
                .pageRow(horizontal: 0)

                AddItemBox(text: $draft) { Task { await addTyped() } }
                    .pageRow(bottom: 14)

                if let error {
                    NoteBox(error, tone: .accent, systemImage: "exclamationmark.triangle").pageRow(bottom: 14)
                }

                if items.isEmpty && error == nil {
                    Text("Nothing on the list. Add planned meals from Plan, or type something above.")
                        .font(.system(size: 15))
                        .foregroundStyle(Palette.muted)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .pageRow(top: 24)
                }

                ForEach(groups, id: \.category?.id) { group in
                    AisleLabel(name: group.category?.name ?? "Unsorted", count: group.items.count)
                        .pageRow(bottom: 6)
                    ForEach(Array(group.items.enumerated()), id: \.element.id) { index, item in
                        GroceryRow(
                            item: item,
                            reminder: item.ingredientId.flatMap { reminders[$0] },
                            stock: item.ingredientId.flatMap { cupboard[$0] },
                            me: session.userId,
                            onToggle: { Task { await toggle(item) } },
                            onOpen: { open = item }
                        )
                        .cardRow(first: index == 0, last: index == group.items.count - 1, inset: 50, padding: 14)
                        .swipeActions(edge: .trailing) {
                            Button("Remove", systemImage: "trash", role: .destructive) {
                                Task { await remove(item) }
                            }
                            // The theme's tomato, as the mockup draws Remove, not the system red.
                            .tint(Palette.accent)
                        }
                    }
                    Color.clear.frame(height: 14).pageRow()
                }

                if !ticked.isEmpty {
                    Button {
                        finishing = true
                    } label: {
                        Label("Done shopping · \(ticked.count) ticked", systemImage: "checkmark")
                    }
                    .buttonStyle(.secondary)
                    .pageRow(bottom: 8)
                }

                if !items.isEmpty {
                    Text("Tap the circle to tick a thing off, the rest of the row for its aisle and a reminder. Swipe left to remove it.")
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.faint)
                        .pageRow(bottom: 24, horizontal: 24)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .environment(\.defaultMinListRowHeight, 0)
            .pageBackground()
            .hidesNavigationBar()
            .refreshable { await load() }
            .overlay(alignment: .bottom) {
                if let toast {
                    RecipeToast(text: toast)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 12)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .householdSheets(session, switching: $switchingHousehold, account: $showingAccount, ideas: $showingIdeas)
            .sheet(item: $open) { item in
                GroceryItemSheet(
                    item: items.first { $0.id == item.id } ?? item,
                    categories: categories,
                    reminder: item.ingredientId.flatMap { reminders[$0] },
                    stock: item.ingredientId.flatMap { cupboard[$0] },
                    session: session,
                    sample: sample != nil,
                    onMove: { category in Task { await move(item, to: category) } },
                    onReminder: { saved in
                        if let ingredient = item.ingredientId { reminders[ingredient] = saved }
                    },
                    onRemove: { Task { await remove(item) } }
                )
            }
            .sheet(isPresented: $finishing) {
                DoneShoppingSheet(items: ticked, session: session, sample: sample != nil) { cleared, stocked in
                    items.removeAll { cleared.contains($0.id) }
                    say(stocked > 0 ? "Put \(stocked) \(stocked == 1 ? "thing" : "things") in the cupboard" : "Cleared")
                    Task { await load() }
                }
            }
            .sheet(isPresented: $sorting) {
                SortIntoAislesSheet(session: session, items: items, aisles: categories) { _ in
                    await load()
                }
            }
        }
        .task {
            await load()
            #if DEBUG
            debugOpen()
            #endif
        }
    }

    /// The list's ••• (mockup 4.3): the system menu, each choice with what it will do under it.
    private var optionsMenu: some View {
        Menu {
            Button(action: copyForNotes) {
                Label {
                    Text("Copy for Notes")
                    Text("Plain text in aisle order")
                } icon: {
                    Image(systemName: "doc.on.doc")
                }
            }
            Button {
                sorting = true
            } label: {
                Label {
                    Text("Sort into aisles")
                    Text(unplaced > 0 ? "Apple Intelligence · on device" : "Everything has an aisle")
                } icon: {
                    Image(systemName: "sparkles")
                }
            }
            .disabled(unplaced == 0)
            Button {
                finishing = true
            } label: {
                Label {
                    Text("Done shopping")
                    Text(ticked.isEmpty ? "Nothing ticked yet" : "\(ticked.count) ticked \(ticked.count == 1 ? "item" : "items")")
                } icon: {
                    Image(systemName: "checkmark")
                }
            }
            .disabled(ticked.isEmpty)
        } label: {
            IconButtonFace(systemImage: "ellipsis", size: 36)
        }
        .accessibilityLabel("List options")
    }

    // MARK: - Behaviour

    private func load() async {
        if let sample {
            items = sample
            categories = sampleCategories ?? []
            reminders = Dictionary(uniqueKeysWithValues: (sampleReminders ?? []).map { ($0.ingredientId, $0) })
            cupboard = Dictionary((sampleCupboard ?? []).compactMap { c in c.ingredientId.map { ($0, c) } },
                                  uniquingKeysWith: { a, _ in a })
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
        // Apart from the list: a server from before reminders has none to give, and that is no error.
        if let found = try? await APIClient.shared.restockReminders(household: household) {
            reminders = Dictionary(uniqueKeysWithValues: found.map { ($0.ingredientId, $0) })
        }
        if let stock = try? await APIClient.shared.cupboard(household: household) {
            cupboard = Dictionary(stock.compactMap { c in c.ingredientId.map { ($0, c) } }, uniquingKeysWith: { a, _ in a })
        }
    }

    /// Optimistic: the tick has to feel instant in a shop, and the server is the tiebreaker.
    private func toggle(_ item: GroceryItem) async {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        let wanted = !item.checked
        withAnimation(.snappy(duration: 0.25)) {
            items[index] = GroceryItem(
                id: item.id, ingredientId: item.ingredientId, sorted: item.sorted,
                name: item.name, quantity: item.quantity, unit: item.unit,
                checked: wanted, checkedByName: session.displayName, categoryId: item.categoryId,
                inCupboard: item.inCupboard, fromRecipes: item.fromRecipes, addedByName: item.addedByName
            )
        }
        guard sample == nil, let household = session.household?.id else { return }
        do {
            let saved = try await APIClient.shared.setChecked(household: household, item: item.id, checked: wanted)
            if let i = items.firstIndex(where: { $0.id == saved.id }) { items[i] = saved }
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }

    /// "2 lb chicken" in one box: a leading amount and a unit are split off the name, which is
    /// what the web's add field does too.
    private func addTyped() async {
        let typed = draft.trimmingCharacters(in: .whitespaces)
        guard !typed.isEmpty, let household = session.household?.id else { return }
        let parsed = Amount(typed)
        draft = ""
        do {
            _ = try await APIClient.shared.addGroceryItem(
                household: household,
                name: parsed.name,
                quantity: parsed.quantity,
                unit: parsed.unit
            )
            await load()
        } catch {
            self.error = error.localizedDescription
            draft = typed
        }
    }

    private func remove(_ item: GroceryItem) async {
        withAnimation { items.removeAll { $0.id == item.id } }
        guard sample == nil, let household = session.household?.id else { return }
        do {
            try await APIClient.shared.removeGroceryItem(household: household, item: item.id)
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }

    /// The aisle belongs to the ingredient, so every row of it moves — and stays moved next time.
    private func move(_ item: GroceryItem, to category: UUID) async {
        guard let ingredient = item.ingredientId else { return }
        withAnimation {
            items = items.map { row in
                guard row.ingredientId == ingredient else { return row }
                return GroceryItem(
                    id: row.id, ingredientId: row.ingredientId, sorted: true, name: row.name,
                    quantity: row.quantity, unit: row.unit, checked: row.checked, checkedByName: row.checkedByName,
                    categoryId: category, inCupboard: row.inCupboard, fromRecipes: row.fromRecipes,
                    addedByName: row.addedByName
                )
            }
        }
        guard sample == nil, let household = session.household?.id else { return }
        do {
            try await APIClient.shared.placeIngredient(household: household, ingredient: ingredient, category: category)
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }

    /// The same export the web has: plain lines, aisle order, nothing else — the shape Apple
    /// Notes converts into a checklist in one go. It will not take checkboxes from a paste.
    private func copyForNotes() {
        let lines = groups.flatMap(\.items).filter { !$0.checked }.map { item in
            [item.amount, item.name].compactMap { $0 }.joined(separator: " ")
        }
        guard !lines.isEmpty else { return }
        UIPasteboard.general.string = lines.joined(separator: "\n")
        say("Copied \(lines.count) \(lines.count == 1 ? "item" : "items") — paste into Notes, then tap the checklist button")
    }

    private func say(_ message: String) {
        withAnimation(.snappy) { toast = message }
        Task {
            try? await Task.sleep(for: .seconds(3.5))
            withAnimation(.snappy) { if toast == message { toast = nil } }
        }
    }

    #if DEBUG
    /// Screenshot runs: -mp_debug_screen grocery-item | done-shopping opens that sheet on the
    /// first suitable row once the list is in.
    private func debugOpen() {
        guard !debugOpened else { return }
        debugOpened = true
        switch UserDefaults.standard.string(forKey: "mp_debug_screen") {
        case "grocery-item":
            open = items.first { $0.ingredientId.flatMap { reminders[$0] } != nil } ?? items.first
        case "done-shopping":
            if !ticked.isEmpty { finishing = true }
        default:
            break
        }
    }
    #endif
}

/// One row of the list. The circle ticks it; the rest opens its sheet.
struct GroceryRow: View {
    let item: GroceryItem
    var reminder: RestockReminder?
    var stock: CupboardItem?
    /// Who is looking, so a row they ticked says "got by you".
    var me: UUID? = nil
    var onToggle: () -> Void
    var onOpen: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Button(action: onToggle) {
                CheckCircle(isOn: item.checked)
                    // A 44pt target around the 24pt circle, without making the row tall.
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.leading, -10)
            .padding(.trailing, -10)
            .accessibilityLabel(item.checked ? "Untick \(item.name)" : "Tick off \(item.name)")

            Button(action: onOpen) {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        title
                        if let detail = GroceryWords.detail(item, me: me) {
                            Text(detail).font(.system(size: 12)).foregroundStyle(Palette.muted).lineLimit(1)
                        }
                        if item.inCupboard && !item.checked {
                            Label(GroceryWords.cupboardSays(stock), systemImage: "cabinet")
                                .labelStyle(WarningLabel())
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Palette.sky)
                                .padding(.top, 1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if let reminder {
                        Image(systemName: "bell")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Palette.mustard)
                            .accessibilityLabel(Restock.everyTitle(reminder.everyDays))
                    }
                }
                .padding(.vertical, 11)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .frame(minHeight: 56)
    }

    private var title: some View {
        let amount = item.amount.map { Text($0 + " ").fontWeight(.semibold) } ?? Text("")
        return (amount + Text(item.name).fontWeight(item.checked ? .regular : .medium))
            .font(.system(size: 16))
            .strikethrough(item.checked, color: Palette.muted)
            .foregroundStyle(item.checked ? Palette.muted : Palette.text)
            .lineLimit(2)
    }
}

/// An icon and its text with the icon close, as the mockup's small warning lines are set.
struct WarningLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 4) {
            configuration.icon.font(.system(size: 11, weight: .semibold))
            configuration.title
        }
    }
}

#Preview("Groceries") {
    GroceriesView(session: .preview, sample: SampleData.groceriesMockup, sampleCategories: SampleData.aisles,
                  sampleReminders: SampleData.groceryReminders, sampleCupboard: SampleData.cupboardMockup)
}

#Preview("Groceries — dark") {
    GroceriesView(session: .preview, sample: SampleData.groceriesMockup, sampleCategories: SampleData.aisles,
                  sampleReminders: SampleData.groceryReminders, sampleCupboard: SampleData.cupboardMockup)
        .preferredColorScheme(.dark)
}
