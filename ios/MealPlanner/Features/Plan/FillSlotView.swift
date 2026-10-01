import SwiftUI

/// What a fill screen is for: a meal on a day, and the dish it replaces if it is a swap.
struct SlotTarget: Identifiable, Hashable {
    let date: String
    let meal: MealType
    var replacing: MealPlanEntry?
    /// What a recipe picked here becomes: the meal's main, or a side to it.
    var side = false
    var id: String { "\(date):\(meal.rawValue):\(replacing?.id.uuidString ?? (side ? "side" : "main"))" }
}

/**
 Filling a slot (the mockup's 2.5 and 2.7): a screen of its own, "Dinner · Thu 1" across the top
 and Cancel to back out. Eat in or eat out, two tabs rather than one list: when you have decided
 you are not cooking tonight, scrolling past forty recipes to reach "Chinese" is the wrong shape.

 Eat in is one search across recipes, saved links and the cupboard, or anything typed — which can
 also become a recipe right here. Eat out picks a place, or makes one from a new name, with an
 optional time for a booking or a pickup.
*/
struct FillSlotView: View {
    let store: PlanStore
    let target: SlotTarget

    @Environment(\.dismiss) private var dismiss
    @State private var out: Bool
    @State private var query = ""
    @State private var filter: Filter = .all
    @State private var busy = false
    @State private var error: String?
    @State private var asking: Recipe?
    @State private var creating: String?
    // Eat out
    @State private var picked: UUID?
    @State private var newPlace = false
    @State private var timed: Bool
    @State private var time: Date

    enum Filter: Hashable { case all, mains, sides, cupboard, links, group(String) }

    init(store: PlanStore, target: SlotTarget) {
        self.store = store
        self.target = target
        let swappingOut = target.replacing?.placeId != nil
        _out = State(initialValue: swappingOut)
        _picked = State(initialValue: target.replacing?.placeId)
        _timed = State(initialValue: swappingOut && target.replacing?.time != nil)
        let parts = (target.replacing?.time ?? "19:00").split(separator: ":").compactMap { Int($0) }
        _time = State(initialValue: Calendar.current.date(bySettingHour: parts.first ?? 19, minute: parts.dropFirst().first ?? 0,
                                                         second: 0, of: Date()) ?? Date())
    }

    private var day: Date { Day.date(target.date) ?? Date() }
    private var title: String { "\(target.meal.title) · \(PlanText.shortDay(day))" }

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                SegmentedControl(selection: $out, options: [(false, "Eat in"), (true, "Eat out")])
                    .padding(.horizontal, 20)
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Palette.danger).padding(.horizontal, 20)
                }
                if out { eatOut } else { eatIn }
            }
            .padding(.top, 4)
            .pageBackground()
            .centeredTitle(title)
            .toolbar {
                // Plain accent text, as the mockup's nav bar has it — not a glass bubble.
                BareToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .font(.system(size: 17))
                        .foregroundStyle(Palette.accentInk)
                        .buttonStyle(PressFade())
                }
            }
        }
        .task { if store.recipes.isEmpty || store.cupboard.isEmpty { await store.loadPickings() } }
        .sheet(item: $asking) { recipe in
            ExtrasSheet(recipe: recipe, selected: Set(target.replacing?.recipeId == recipe.id
                                                     ? target.replacing?.includedOptionalIngredientIds ?? [] : [])) { extras in
                await put(.recipe(recipe.id, extras: extras))
            }
        }
        .sheet(item: Binding(get: { creating.map(NameKey.init) }, set: { creating = $0?.name })) { key in
            CreateFromSlotSheet(store: store, initialName: key.name, meal: target.meal, day: day) { filling in
                await put(filling)
            }
        }
    }

    // MARK: - Eat in

    private var groups: [String] {
        Set(store.recipes.flatMap(\.categories)).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }
    private func isMain(_ g: String) -> Bool { g.range(of: "main", options: .caseInsensitive) != nil }
    private func isSide(_ g: String) -> Bool { g.range(of: "side", options: .caseInsensitive) != nil }
    private var q: String { query.trimmingCharacters(in: .whitespaces).lowercased() }

    private var shownRecipes: [Recipe] {
        switch filter {
        case .cupboard, .links: return []
        default: break
        }
        return store.recipes
            .filter { q.isEmpty || $0.name.lowercased().contains(q) }
            .filter {
                switch filter {
                case .mains: return $0.categories.contains(where: isMain)
                case .sides: return $0.categories.contains(where: isSide)
                case .group(let g): return $0.categories.contains(g)
                default: return true
                }
            }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
    private var shownLinks: [SavedLink] {
        guard filter == .all || filter == .links else { return [] }
        return store.links.filter { q.isEmpty || $0.name.lowercased().contains(q) }
    }
    /// The cupboard is long, and "eggs" is something you type, not scroll to.
    private var shownCupboard: [CupboardItem] {
        guard filter == .cupboard || (filter == .all && !q.isEmpty) else { return [] }
        let all = store.cupboard.filter { q.isEmpty || $0.name.lowercased().contains(q) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        return filter == .cupboard ? all : Array(all.prefix(5))
    }

    private var eatIn: some View {
        let typed = query.trimmingCharacters(in: .whitespaces)
        let exactRecipe = store.recipes.contains { $0.name.lowercased() == q }
        let exactItem = store.cupboard.contains { $0.name.lowercased() == q }
        return VStack(spacing: 12) {
            SearchBox(text: $query, prompt: "Search, or type anything")
                .padding(.horizontal, 20)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    chip(.all, "All")
                    if groups.contains(where: isMain) { chip(.mains, "Mains") }
                    if groups.contains(where: isSide) { chip(.sides, "Sides") }
                    if !store.cupboard.isEmpty { chip(.cupboard, "Cupboard") }
                    if !store.links.isEmpty { chip(.links, "Links") }
                    ForEach(groups.filter { !isMain($0) && !isSide($0) }, id: \.self) { chip(.group($0), $0) }
                }
                .padding(.horizontal, 20)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !shownRecipes.isEmpty {
                        section("Recipes") {
                            ForEach(shownRecipes) { recipe in
                                Button { pick(recipe) } label: {
                                    rowFace(title: highlight(recipe.name), subtitle: filing(recipe)) {
                                        RecipePhotoPlaceholder(hue: .of(recipe.id.uuidString.lowercased()),
                                                               systemImage: PlanText.icon(section: recipe.section, meal: target.meal),
                                                               size: 40, radius: 10)
                                    } trailing: {
                                        if recipe.id == target.replacing?.recipeId {
                                            CheckCircle(isOn: true)
                                        } else {
                                            Pill(target.side ? "Side" : "Main", tone: target.side ? .mustard : .accent)
                                        }
                                    }
                                }
                                .buttonStyle(PressFade())
                                .accessibilityLabel(recipe.name)
                            }
                        }
                    }
                    if !shownLinks.isEmpty {
                        section("Saved links") {
                            ForEach(shownLinks) { link in
                                Button { Task { await put(.link(link.id)) } } label: {
                                    rowFace(title: highlight(link.name),
                                            subtitle: [link.sourceLabel, link.mine ? nil : link.savedByName.map { "saved by \($0)" }]
                                                .compactMap { $0 }.joined(separator: " · ")) {
                                        LinkPicture(link: link)
                                    } trailing: { EmptyView() }
                                }
                                .buttonStyle(PressFade())
                                .accessibilityLabel(link.name)
                            }
                        }
                    }
                    if !shownCupboard.isEmpty {
                        section("Cupboard") {
                            ForEach(shownCupboard) { item in
                                Button { Task { await put(.item(item.name)) } } label: {
                                    rowFace(title: highlight(item.name), subtitle: cupboardLine(item)) {
                                        Tile("cabinet", tone: .sky, size: 40)
                                    } trailing: { EmptyView() }
                                }
                                .buttonStyle(PressFade())
                                .accessibilityLabel(item.name)
                            }
                        }
                    }
                    if !typed.isEmpty && !exactRecipe {
                        ListGroup {
                            if !exactItem {
                                Button { Task { await put(.item(typed)) } } label: {
                                    ListRow("Use “\(typed)” as typed", subtitle: "Just text in the slot", tile: ("pencil", .mustard))
                                }
                                .buttonStyle(PressFade())
                            }
                            Button { creating = typed } label: {
                                ListRow("Create recipe “\(typed)”", subtitle: "Name only, type it, from a link or paste",
                                        chevron: true, tile: ("plus", .accent))
                            }
                            .buttonStyle(PressFade())
                        }
                    }
                    if typed.isEmpty && shownRecipes.isEmpty && shownLinks.isEmpty && shownCupboard.isEmpty {
                        VStack(spacing: 12) {
                            Text(store.recipes.isEmpty ? "No recipes yet." : "Nothing here.")
                                .foregroundStyle(Palette.muted)
                            Button("Make one") { creating = "" }.buttonStyle(.kitchen(.soft, size: .small, fill: false))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .disabled(busy)
    }

    private func chip(_ f: Filter, _ title: String) -> some View {
        Chip(title, isOn: filter == f) { filter = (filter == f && f != .all) ? .all : f }
    }

    private func section<C: View>(_ label: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(label).padding(.bottom, 6)
            ListGroup { content() }
        }
    }

    /// A row with a bold match in its title — "<b>Chick</b>en tikka traybake".
    private func rowFace<L: View, T: View>(title: Text, subtitle: String?, @ViewBuilder leading: () -> L,
                                           @ViewBuilder trailing: () -> T) -> some View {
        HStack(spacing: 12) {
            leading()
            titled(title, subtitle)
            trailing()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func titled(_ title: Text, _ subtitle: String?) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            title.font(.system(size: 16)).foregroundStyle(Palette.text).lineLimit(1)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle).font(.rowSubtitle).foregroundStyle(Palette.muted).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func highlight(_ name: String) -> Text {
        guard !q.isEmpty, let r = name.lowercased().range(of: q) else { return Text(name).fontWeight(.medium) }
        let start = name.distance(from: name.startIndex, to: r.lowerBound)
        let a = name.index(name.startIndex, offsetBy: start)
        let b = name.index(a, offsetBy: q.count)
        return Text(name[..<a]).fontWeight(.medium) + Text(name[a..<b]).fontWeight(.bold) + Text(name[b...]).fontWeight(.medium)
    }

    private func filing(_ recipe: Recipe) -> String {
        let drawer = recipe.section?.title
        let groups = recipe.categories.joined(separator: " · ")
        let line = [drawer, groups.isEmpty ? nil : groups].compactMap { $0 }.joined(separator: " › ")
        return line.isEmpty ? "Serves \(recipe.servings)" : line
    }

    private func cupboardLine(_ item: CupboardItem) -> String {
        if item.staple { return "Always have" }
        if item.runningLow { return "Running low" }
        if let q = item.quantity { return "Have \(q == q.rounded() ? String(Int(q)) : String(q))\(item.unit.map { " \($0)" } ?? "")" }
        return "In the cupboard"
    }

    private func pick(_ recipe: Recipe) {
        if recipe.ingredients.contains(where: \.optional) {
            asking = recipe
        } else {
            Task { await put(.recipe(recipe.id, extras: [])) }
        }
    }

    // MARK: - Eat out

    private var eatOut: some View {
        let typed = query.trimmingCharacters(in: .whitespaces)
        let shown = store.places.filter { typed.isEmpty || $0.name.lowercased().contains(typed.lowercased()) }
        let canCreate = !typed.isEmpty && !store.places.contains { $0.name.caseInsensitiveCompare(typed) == .orderedSame }
        let chosenName: String? = newPlace && canCreate ? typed : store.places.first { $0.id == picked }?.name
        return VStack(spacing: 12) {
            SearchBox(text: $query, prompt: "Search or add a place")
                .padding(.horizontal, 20)
                .onChange(of: query) { if newPlace { newPlace = false } }
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !shown.isEmpty || canCreate {
                        section("Places we eat") {
                            ForEach(Array(shown.enumerated()), id: \.element.id) { index, place in
                                Button {
                                    picked = place.id
                                    newPlace = false
                                } label: {
                                    ListRow(place.name, subtitle: place.notes, leading: {
                                        Tile("storefront", tone: Self.placeTones[index % Self.placeTones.count], size: 40)
                                    }) { CheckCircle(isOn: !newPlace && picked == place.id) }
                                }
                                .buttonStyle(PressFade())
                                .accessibilityAddTraits(!newPlace && picked == place.id ? .isSelected : [])
                            }
                            if canCreate {
                                Button { newPlace = true } label: {
                                    ListRow("Add “\(typed)”", subtitle: "A new place, saved for next time", leading: {
                                        Tile("plus", tone: .accent, size: 40)
                                    }) { CheckCircle(isOn: newPlace) }
                                }
                                .buttonStyle(PressFade())
                            }
                        }
                    } else {
                        Text("Nowhere saved yet — type a name to add one.")
                            .foregroundStyle(Palette.muted)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 24)
                    }

                    Card(spacing: 12) {
                        Toggle(isOn: $timed) {
                            Label("Time", systemImage: "clock")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Palette.text)
                        }
                        .toggleStyle(.herb)
                        if timed {
                            HStack {
                                Text(day.formatted(.dateTime.weekday(.wide))).font(.system(size: 15)).foregroundStyle(Palette.text)
                                Spacer()
                                DatePicker("Time", selection: $time, displayedComponents: .hourAndMinute).labelsHidden()
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        Text("For a booking or a pickup. Leave it off if there isn’t one.")
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.muted)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 16)
            }
            Button {
                Task { await planOut(typed: typed, create: newPlace && canCreate) }
            } label: {
                Text(chosenName.map { "Plan \($0)" } ?? "Pick a place")
            }
            .buttonStyle(.primary)
            .disabled(busy || chosenName == nil)
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
        }
    }

    private static let placeTones: [Tone] = [.plum, .accent, .mustard, .herb, .sky]

    private func planOut(typed: String, create: Bool) async {
        busy = true
        defer { busy = false }
        do {
            let id: UUID
            if create { id = try await store.place(named: typed).id } else if let picked { id = picked } else { return }
            await put(.place(id, time: timed ? TimeSheet.hhmm(time) : nil))
        } catch {
            self.error = "Could not add that place."
        }
    }

    // MARK: - Saving

    /// Puts it in the slot (or swaps the dish), then closes: the day sheet underneath has it.
    private func put(_ filling: Filling) async {
        busy = true
        defer { busy = false }
        do {
            error = nil
            try await store.fill(date: target.date, meal: target.meal, with: filling, replacing: target.replacing)
            asking = nil
            creating = nil
            dismiss()
        } catch {
            self.error = (error as? APIError)?.status == 409 ? "That’s already on this meal." : "Could not add that."
        }
    }
}

/// A saved link's cover, or its drawn plate with a play button (a video) or a globe (a site).
private struct LinkPicture: View {
    let link: SavedLink

    var body: some View {
        let plate = RecipePhotoPlaceholder(hue: .of(link.id.uuidString.lowercased()),
                                           systemImage: link.source == .web ? "globe" : "play", size: 40, radius: 10)
        if let id = link.coverImageId, let url = APIClient.shared.imageURL(id) {
            AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { plate }
                .frame(width: 40, height: 40)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        } else {
            plate
        }
    }
}

/// `sheet(item:)` needs something Identifiable; a typed name is not.
private struct NameKey: Identifiable {
    let name: String
    var id: String { name }
}

#Preview("Fill a slot") {
    FillSlotView(store: PlanStore(session: .preview, sample: SampleData.plan),
                 target: SlotTarget(date: Day.iso(Date()), meal: .dinner))
}
