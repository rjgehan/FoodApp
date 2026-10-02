import SwiftUI

/**
 What the house already has (mockup 4.5), filled mostly by Done shopping. One box does both jobs:
 type to see whether you have something, and if you don't, it offers to add it (4.6). The chips
 narrow it to what is low, what you always have, or what has a restock reminder.

 Each row shows the one thing you check at a glance — Have or Low, an exact count with its
 stepper, or "Always" — grouped by the same aisles as the grocery list, because it is the same
 ingredients seen from the other end. Tap a row to edit it; swipe it for Buy again or Remove (a
 long swipe removes it straight away).
 */
struct CupboardView: View {
    var session: Session
    var sample: [CupboardItem]?
    var sampleCategories: [GroceryCategory]?
    var sampleReminders: [RestockReminder]?
    /// Previews: start with something typed in the box.
    var sampleQuery = ""

    private enum Filter { case all, low, always, reminders }

    @State private var items: [CupboardItem] = []
    @State private var categories: [GroceryCategory] = []
    /// Restock reminders by ingredient, for the bell and "Restock every 3 weeks".
    @State private var reminders: [UUID: RestockReminder] = [:]
    @State private var query = ""
    @State private var filter: Filter = .all
    @State private var error: String?
    @State private var editing: CupboardItem?
    @State private var switchingHousehold = false
    @State private var showingAccount = false
    @State private var showingIdeas = false
    @State private var scanning = false
    @State private var startingWithBasics = false
    @State private var copying = false
    @State private var adding = false
    /// What just happened, said for a moment.
    @State private var toast: String?
    @State private var debugOpened = false
    /// Screenshot runs: the scanner opened on a sample result, since a simulator has no camera.
    @State private var scanSample: ScanBarcodeScreen.Stage?

    private var typed: String { query.trimmingCharacters(in: .whitespaces) }

    private func reminder(_ item: CupboardItem) -> RestockReminder? {
        item.ingredientId.flatMap { reminders[$0] }
    }

    private var counts: (low: Int, always: Int, reminders: Int) {
        (items.filter { $0.runningLow && !$0.staple }.count,
         items.filter(\.staple).count,
         items.filter { reminder($0) != nil }.count)
    }

    /// A search looks through the whole cupboard, whichever chip is on: "do we have…?" means anywhere.
    private var shown: [CupboardItem] {
        let q = typed.lowercased()
        if !q.isEmpty { return items.filter { $0.name.lowercased().contains(q) } }
        switch filter {
        case .all: return items
        case .low: return items.filter { $0.runningLow && !$0.staple }
        case .always: return items.filter(\.staple)
        case .reminders: return items.filter { reminder($0) != nil }
        }
    }

    private var exact: Bool { items.contains { $0.name.lowercased() == typed.lowercased() } }
    private var missed: Bool { !typed.isEmpty && !exact }

    private var groups: [(category: GroceryCategory?, items: [CupboardItem])] {
        let sortedRows = shown.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        var out: [(GroceryCategory?, [CupboardItem])] = []
        for category in categories {
            let rows = sortedRows.filter { $0.categoryId == category.id }
            if !rows.isEmpty { out.append((category, rows)) }
        }
        let loose = sortedRows.filter { item in
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
                    LargeTitle("Cupboard") {
                        optionsMenu
                        // The camera answers "do we have this?" without the typing — the question
                        // that matters when you are standing in a shop holding the tin.
                        IconButton("barcode.viewfinder", size: 36, label: "Scan a barcode") { scanning = true }
                    }
                }
                .pageRow(horizontal: 0)

                SearchBox(text: $query, prompt: "Search or add to cupboard") {
                    if missed { Task { await add() } }
                }
                .pageRow(bottom: 12)

                if typed.isEmpty && !items.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            Chip("All · \(items.count)", isOn: filter == .all) { filter = .all }
                            Chip("Low · \(counts.low)", isOn: filter == .low) { filter = .low }
                            Chip("Always have · \(counts.always)", isOn: filter == .always) { filter = .always }
                            Chip(counts.reminders > 0 ? "Reminders · \(counts.reminders)" : "Reminders",
                                 isOn: filter == .reminders) { filter = .reminders }
                        }
                        .padding(.horizontal, 20)
                    }
                    .pageRow(bottom: 16, horizontal: 0)
                }

                if missed {
                    missCard.pageRow(bottom: 16)
                    if !shown.isEmpty {
                        SectionLabel("Similar").pageRow(bottom: 8)
                    }
                }

                if let error {
                    NoteBox(error, tone: .accent, systemImage: "exclamationmark.triangle").pageRow(bottom: 14)
                }

                if items.isEmpty && typed.isEmpty {
                    VStack(spacing: 14) {
                        Text("Nothing here yet. Tap Done shopping in Groceries and what you bought lands here — or add things above.")
                            .font(.system(size: 15))
                            .foregroundStyle(Palette.muted)
                            .multilineTextAlignment(.center)
                        // A new house's cupboard is the one that is empty, and ticking a list beats typing it.
                        Button("Start with the basics") { startingWithBasics = true }
                            .buttonStyle(.kitchen(.secondary, size: .small))
                    }
                    .frame(maxWidth: .infinity)
                    .pageRow(top: 24)
                } else if shown.isEmpty && typed.isEmpty {
                    Text(filter == .low ? "Nothing is running low." : "Nothing here.")
                        .font(.system(size: 15))
                        .foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity)
                        .pageRow(top: 24)
                }

                ForEach(groups, id: \.category?.id) { group in
                    if !missed {
                        AisleLabel(name: group.category?.name ?? "Everything else").pageRow(bottom: 6)
                    }
                    ForEach(Array(group.items.enumerated()), id: \.element.id) { index, item in
                        CupboardRow(
                            item: item,
                            reminder: reminder(item),
                            onLow: { low in Task { await setLow(item, low) } },
                            onAdjust: { delta in Task { await adjust(item, by: delta) } }
                        )
                        .contentShape(Rectangle())
                        .onTapGesture { editing = item }
                        .cardRow(first: index == 0, last: index == group.items.count - 1)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            // Destructive first in the code, so it lands furthest out under the
                            // thumb — and a long swipe does it, which is what you do most.
                            Button("Remove", systemImage: "trash", role: .destructive) {
                                Task { await remove(item) }
                            }
                            // The theme's tomato, as the mockup draws Remove, not the system red.
                            .tint(Palette.accent)
                            Button("Buy again", systemImage: "cart") {
                                Task { await buyAgain(item) }
                            }
                            .tint(Palette.herb)
                        }
                    }
                    Color.clear.frame(height: 16).pageRow()
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
            .sheet(isPresented: $startingWithBasics) {
                if let household = session.household?.id {
                    StartCupboardSheet(household: household) { added in
                        say(added == 0 ? "All of those were here already" : "Added \(added) to the cupboard")
                        await load()
                    }
                }
            }
            .sheet(isPresented: $copying) {
                CopyCupboardSheet(session: session, items: items) { result in
                    let copied = "Copied \(result.copied) \(result.copied == 1 ? "item" : "items")"
                    say(result.skipped == 0 ? copied
                        : copied + "; \(result.skipped) \(result.skipped == 1 ? "was" : "were") already here")
                    await load()
                }
            }
            .fullScreenCover(isPresented: $scanning) {
                ScanBarcodeScreen(session: session, items: items, onDone: { message in
                    say(message)
                    Task { await load() }
                }, sample: scanSample)
            }
            .sheet(item: $editing) { item in
                CupboardItemSheet(item: item, others: items, categories: categories, reminder: reminder(item),
                                  session: session, sample: sample != nil) {
                    await load()
                }
            }
        }
        .task {
            query = sampleQuery
            await load()
            #if DEBUG
            debugOpen()
            #endif
        }
    }

    private var optionsMenu: some View {
        Menu {
            Button("Start with the basics…", systemImage: "checklist") { startingWithBasics = true }
            // Only for somebody with a second house to fill, which is almost nobody — so it is
            // not even offered otherwise.
            if session.households.count > 1 {
                Button("Copy from another household…", systemImage: "square.on.square") { copying = true }
            }
        } label: {
            IconButtonFace(systemImage: "ellipsis", size: 36)
        }
        .accessibilityLabel("Cupboard options")
    }

    /// The search missed: the box offers to add what was typed (4.6).
    private var missCard: some View {
        HStack(spacing: 12) {
            Tile("plus", tone: .accent, size: 38)
            VStack(alignment: .leading, spacing: 1) {
                Text("Add “\(typed)”").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text).lineLimit(1)
                Text("Not in the cupboard yet").font(.system(size: 12)).foregroundStyle(Palette.muted)
            }
            Spacer(minLength: 8)
            Button("Add") { Task { await add() } }
                .buttonStyle(.kitchen(.primary, size: .small))
                .disabled(adding)
        }
        .padding(14)
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
            .strokeBorder(Palette.faint, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
    }

    // MARK: - Behaviour

    private func load() async {
        if let sample {
            items = sample
            categories = sampleCategories ?? []
            reminders = Dictionary(uniqueKeysWithValues: (sampleReminders ?? []).map { ($0.ingredientId, $0) })
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
        // Apart from the cupboard: a server from before reminders has none, and that is no error.
        if let found = try? await APIClient.shared.restockReminders(household: household) {
            reminders = Dictionary(uniqueKeysWithValues: found.map { ($0.ingredientId, $0) })
        }
    }

    private func add() async {
        let name = typed
        guard !name.isEmpty, !adding, let household = session.household?.id else { return }
        adding = true
        defer { adding = false }
        do {
            let added = try await APIClient.shared.addToCupboard(household: household, name: name)
            items.append(added)
            query = ""
            say("Added \(name) to the cupboard")
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func setLow(_ item: CupboardItem, _ low: Bool) async {
        replace(item.with(runningLow: low))
        guard sample == nil, let household = session.household?.id else { return }
        do {
            replace(try await APIClient.shared.updateCupboard(household: household, item: item.id, runningLow: low))
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func adjust(_ item: CupboardItem, by delta: Double) async {
        guard let current = item.quantity else { return }
        let wanted = max(0, current + delta)
        replace(item.with(quantity: wanted))
        guard sample == nil, let household = session.household?.id else { return }
        do {
            replace(try await APIClient.shared.updateCupboard(household: household, item: item.id, quantity: wanted))
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func buyAgain(_ item: CupboardItem) async {
        // Used up: it leaves the cupboard as it goes on the list.
        withAnimation { items.removeAll { $0.id == item.id } }
        say("\(GroceryWords.titled(item.name)) is on the list")
        guard sample == nil, let household = session.household?.id else { return }
        do {
            try await APIClient.shared.buyAgain(household: household, item: item.id)
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }

    private func remove(_ item: CupboardItem) async {
        // Off the screen first: a swipe that leaves the row sitting there reads as a miss.
        withAnimation { items.removeAll { $0.id == item.id } }
        guard sample == nil, let household = session.household?.id else { return }
        do {
            try await APIClient.shared.removeFromCupboard(household: household, item: item.id)
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }

    private func say(_ message: String) {
        withAnimation(.snappy) { toast = message }
        Task {
            try? await Task.sleep(for: .seconds(3.5))
            withAnimation(.snappy) { if toast == message { toast = nil } }
        }
    }

    private func replace(_ item: CupboardItem) {
        if let i = items.firstIndex(where: { $0.id == item.id }) { items[i] = item }
    }

    #if DEBUG
    /// Screenshot runs: -mp_debug_screen cupboard-edit opens the first counted item's sheet;
    /// cupboard-search types -mp_debug_query (or "tahini") into the box; barcode opens the scanner.
    private func debugOpen() {
        guard !debugOpened else { return }
        debugOpened = true
        let defaults = UserDefaults.standard
        switch defaults.string(forKey: "mp_debug_screen") {
        case "cupboard-edit":
            editing = items.first(where: \.tracksQuantity) ?? items.first
        case "cupboard-search":
            query = defaults.string(forKey: "mp_debug_query") ?? "tahini"
        case "barcode":
            scanning = true
        case "barcode-found":
            scanSample = .found(Product(barcode: "5012345678900", name: "Chickpeas 400g tin", brand: "", size: "400 g"), nil)
            scanning = true
        default:
            break
        }
    }
    #endif
}

extension CupboardItem {
    /// The same item with one thing changed, for answering a tap before the server does.
    func with(runningLow: Bool? = nil, quantity: Double? = nil) -> CupboardItem {
        CupboardItem(id: id, name: name, runningLow: runningLow ?? self.runningLow, staple: staple, categoryId: categoryId,
                     onList: onList, quantity: quantity ?? self.quantity, unit: unit, ingredientId: ingredientId)
    }
}

/// One cupboard row: the name, a quiet line under it, and on the right the one thing you check.
struct CupboardRow: View {
    let item: CupboardItem
    var reminder: RestockReminder?
    var onLow: (Bool) -> Void
    var onAdjust: (Double) -> Void

    private var detail: String? {
        var parts: [String] = []
        if item.staple { parts.append("Always have") }
        if let reminder { parts.append("Restock \(Restock.every(reminder.everyDays))") }
        if item.onList { parts.append("On the list") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(GroceryWords.titled(item.name)).font(.rowTitle).foregroundStyle(Palette.text).lineLimit(1)
                if let detail {
                    Text(detail).font(.rowSubtitle).foregroundStyle(Palette.muted).lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if item.staple {
                // "Always have" means it is never low, so there is nothing to toggle.
                Pill("Always", tone: .herb, systemImage: "checkmark")
            } else if let quantity = item.quantity {
                HStack(spacing: 6) {
                    Text(GroceryWords.number(quantity)).font(.system(size: 14, weight: .semibold).monospacedDigit())
                        .foregroundStyle(Palette.text)
                    CountStepper(canLower: quantity > 0, onStep: onAdjust)
                }
            } else {
                HaveOrLow(low: item.runningLow, onChange: onLow)
            }
            if let reminder {
                Image(systemName: "bell")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Palette.mustard)
                    .accessibilityLabel("Restock \(Restock.every(reminder.everyDays))")
            }
        }
        .padding(.vertical, 12)
        .frame(minHeight: 54)
    }
}

/**
 One cupboard item (mockup 4.7): its name, its aisle, how much there is — Have, Low or an exact
 count — whether you always have it, and a restock reminder. Renaming it to something already in
 the cupboard merges the two; the sheet says so before Save, not after.
 */
struct CupboardItemSheet: View {
    let item: CupboardItem
    let others: [CupboardItem]
    let categories: [GroceryCategory]
    var reminder: RestockReminder?
    var session: Session
    var sample = false
    var onChanged: () async -> Void

    private enum Amount: Hashable { case have, low, exact }

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var aisle: UUID?
    @State private var amount: Amount
    @State private var quantity: Double
    @State private var unit: String
    @State private var staple: Bool
    @State private var everyDays: Int?
    /// Nil means no date on the packet.
    @State private var useBy: Date?
    @State private var busy = false
    @State private var error: String?

    init(item: CupboardItem, others: [CupboardItem], categories: [GroceryCategory], reminder: RestockReminder?,
         session: Session, sample: Bool = false, onChanged: @escaping () async -> Void) {
        self.item = item
        self.others = others
        self.categories = categories
        self.reminder = reminder
        self.session = session
        self.sample = sample
        self.onChanged = onChanged
        // As the row it was opened from says it: "Chickpeas (tin)", not the stored "chickpeas (tin)".
        _name = State(initialValue: GroceryWords.titled(item.name))
        _aisle = State(initialValue: item.categoryId)
        _amount = State(initialValue: item.tracksQuantity ? .exact : item.runningLow ? .low : .have)
        _quantity = State(initialValue: item.quantity ?? 1)
        _unit = State(initialValue: item.unit ?? "")
        _staple = State(initialValue: item.staple)
        _everyDays = State(initialValue: reminder?.everyDays)
        _useBy = State(initialValue: item.useBy.flatMap(UseByDate.date))
    }

    /// Blank means "leave it alone", not "call it nothing".
    private var named: String {
        let typed = name.trimmingCharacters(in: .whitespaces)
        return typed.isEmpty ? item.name : typed
    }

    private var mergesWith: CupboardItem? {
        guard named.lowercased() != item.name.lowercased() else { return nil }
        return others.first { $0.id != item.id && $0.name.lowercased() == named.lowercased() }
    }

    private var shownAmount: String {
        let u = unit.trimmingCharacters(in: .whitespaces)
        return GroceryWords.number(quantity) + (u.isEmpty ? "" : " \(u)")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Edit item").titleFont(26).foregroundStyle(Palette.text)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    Button("Save") { Task { await save() } }
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Palette.accentInk)
                        .disabled(busy)
                }

                FieldBox("Name", text: $name)

                VStack(alignment: .leading, spacing: 7) {
                    Text("Aisle").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.muted)
                    Menu {
                        Picker("Aisle", selection: $aisle) {
                            ForEach(categories) { category in
                                Text(category.name).tag(UUID?.some(category.id))
                            }
                        }
                    } label: {
                        HStack {
                            Text(categories.first { $0.id == aisle }?.name ?? "Unsorted")
                                .font(.system(size: 16)).foregroundStyle(Palette.text)
                            Spacer()
                            Image(systemName: "chevron.down").font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Palette.muted)
                        }
                        .padding(.horizontal, 14)
                        .frame(height: 52)
                        .fieldSurface()
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Amount").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
                        Spacer()
                        SegmentedControl(selection: $amount, options: [(.have, "Have"), (.low, "Low"), (.exact, "Exact")])
                            .frame(width: 190)
                    }
                    if amount == .exact {
                        HStack {
                            Text("How many").font(.system(size: 14)).foregroundStyle(Palette.muted)
                            Spacer()
                            CountStepper(shown: shownAmount, canLower: quantity > 0) { delta in
                                quantity = max(0, quantity + delta)
                            }
                        }
                        HStack {
                            Text("Counted in").font(.system(size: 14)).foregroundStyle(Palette.muted)
                            Spacer()
                            TextField("", text: $unit, prompt: Text("tins, g, packs").foregroundStyle(Palette.faint))
                                .font(.system(size: 15))
                                .multilineTextAlignment(.trailing)
                                .textInputAutocapitalization(.never)
                                .frame(width: 140)
                        }
                    }
                }
                .padding(16)
                .cardSurface()

                ListGroup {
                    ListRow("Always have", subtitle: "Never marked low") {
                        Toggle("Always have", isOn: $staple).labelsHidden()
                    }
                    if item.ingredientId != nil {
                        ListRow("Restock reminder",
                                subtitle: everyDays.map { "Ask me \(Restock.every($0))" } ?? "Off") {
                            Toggle("Restock reminder", isOn: Binding(
                                get: { everyDays != nil },
                                set: { everyDays = $0 ? (reminder?.everyDays ?? 21) : nil }
                            ))
                            .labelsHidden()
                        }
                        if let days = everyDays {
                            HStack {
                                Text("How often").font(.system(size: 15)).foregroundStyle(Palette.muted)
                                Spacer()
                                Menu {
                                    ForEach(Restock.presets, id: \.self) { preset in
                                        Button(Restock.everyTitle(preset)) { everyDays = preset }
                                    }
                                } label: {
                                    HStack(spacing: 4) {
                                        Text(Restock.everyTitle(days))
                                        Image(systemName: "chevron.up.chevron.down").font(.system(size: 11, weight: .semibold))
                                    }
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(Palette.accentInk)
                                }
                            }
                            .padding(.horizontal, 16)
                            .frame(minHeight: 46)
                        }
                    }
                }
                .tint(Palette.herb)

                // Only offered by a server that keeps the date; an older one would drop it.
                if item.serverKnowsUseBy {
                    ListGroup {
                        ListRow("Use by", subtitle: useBy.map(UseByDate.reminder) ?? "Optional · plans use it up in time") {
                            Toggle("Use by", isOn: Binding(
                                get: { useBy != nil },
                                set: { useBy = $0 ? (useBy ?? UseByDate.inDays(3)) : nil }
                            ))
                            .labelsHidden()
                        }
                        if let date = useBy {
                            HStack {
                                Text("Date").font(.system(size: 15)).foregroundStyle(Palette.muted)
                                Spacer()
                                DatePicker("Date", selection: Binding(get: { date }, set: { useBy = $0 }),
                                           displayedComponents: .date)
                                    .labelsHidden()
                                    .tint(Palette.accent)
                            }
                            .padding(.horizontal, 16)
                            .frame(minHeight: 46)
                        }
                    }
                    .tint(Palette.herb)
                }

                if mergesWith != nil {
                    NoteBox("Renaming this to “\(named)” would merge it with the item you already have.",
                            tone: .sky, systemImage: "info.circle")
                }

                if let error {
                    Text(error).font(.footnote).foregroundStyle(Palette.danger)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 20)
        }
        .kitchenSheet([.large])
    }

    /// What to send for the date: nil when it hasn't changed, "" to clear it.
    private var useByChange: String? {
        guard item.serverKnowsUseBy else { return nil }
        let now = useBy.map(UseByDate.string) ?? ""
        return now == (item.useBy ?? "") ? nil : now
    }

    private func save() async {
        if sample {
            dismiss()
            return
        }
        guard let household = session.household?.id else { return }
        busy = true
        defer { busy = false }
        do {
            let exact = amount == .exact
            let modeChanged = exact != item.tracksQuantity
            var saved = try await APIClient.shared.editCupboard(
                household: household,
                item: item.id,
                // Only a change of letters is a rename: the capital is how it is shown anyway.
                name: named.lowercased() == item.name.lowercased() ? nil : named,
                staple: staple == item.staple ? nil : staple,
                trackQuantity: modeChanged ? exact : nil,
                quantity: exact ? quantity : nil,
                unit: exact ? unit.trimmingCharacters(in: .whitespaces) : nil,
                useBy: useByChange
            )
            if !exact, (amount == .low) != saved.runningLow {
                saved = try await APIClient.shared.updateCupboard(household: household, item: saved.id, runningLow: amount == .low)
            }
            let ingredient = saved.ingredientId ?? item.ingredientId
            // The aisle belongs to the ingredient — the new one, after a rename — so it goes last.
            if let aisle, aisle != item.categoryId, let ingredient {
                try await APIClient.shared.placeIngredient(household: household, ingredient: ingredient, category: aisle)
            }
            // Also after the rename, which takes the reminder along to the new name first.
            if everyDays != reminder?.everyDays, let ingredient {
                try await APIClient.shared.setRestock(household: household, ingredient: ingredient, everyDays: everyDays)
            }
            await onChanged()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Cupboard") {
    CupboardView(session: .preview, sample: SampleData.cupboardMockup, sampleCategories: SampleData.aisles,
                 sampleReminders: SampleData.groceryReminders)
}

#Preview("Cupboard — search miss, dark") {
    CupboardView(session: .preview, sample: SampleData.cupboardMockup, sampleCategories: SampleData.aisles,
                 sampleReminders: SampleData.groceryReminders, sampleQuery: "tahini")
        .preferredColorScheme(.dark)
}

#Preview("Cupboard item") {
    Color.clear.sheet(isPresented: .constant(true)) {
        CupboardItemSheet(item: SampleData.cupboardMockup[0], others: SampleData.cupboardMockup,
                          categories: SampleData.aisles, reminder: nil, session: .preview, sample: true) {}
    }
}

/// The date on a packet, as the server keeps it ("2026-10-08") and as the sheet says it.
enum UseByDate {
    private static let wire: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func date(_ string: String) -> Date? { wire.date(from: string) }
    static func string(_ date: Date) -> String { wire.string(from: date) }

    static func inDays(_ days: Int) -> Date {
        Calendar.current.date(byAdding: .day, value: days, to: Calendar.current.startOfDay(for: .now)) ?? .now
    }

    /// Under the switch, beside a date picker that already shows the date: what it means.
    static func reminder(_ date: Date) -> String {
        switch shown(date) {
        case "Past its date": return "Past its date"
        case "Today": return "Use it today"
        case "Tomorrow": return "Use it by tomorrow"
        default: return "Plans use it up in time"
        }
    }

    /// "Sun, 4 Oct", or "Today" / "Tomorrow" / "Past its date".
    static func shown(_ date: Date) -> String {
        let calendar = Calendar.current
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: .now),
                                           to: calendar.startOfDay(for: date)).day ?? 0
        if days < 0 { return "Past its date" }
        if days == 0 { return "Today" }
        if days == 1 { return "Tomorrow" }
        return date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
    }
}
