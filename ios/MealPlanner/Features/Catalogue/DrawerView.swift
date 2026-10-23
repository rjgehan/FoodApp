import SwiftUI

/**
 One drawer (the mockup's 3.3 and 3.4, flattened): every recipe in it as photo cards, with the
 drawer's tags as a row of chips over them — tap one to see only those, tap two to see what has
 both. The machines its recipes need are a second row, for "what can I make in the air fryer",
 led by Can make: only what this household's kitchen has the machines for (KitchenMachine.missing).

 A drawer is one level now. A tag is a sticker on a recipe rather than a shelf it lives on, so a
 recipe can be Chicken and Quick at once and nothing has to be opened to be found — the web's
 drawer page, the same chips in the same order.

 Tagging is quick on purpose: "+ Tag" makes one and goes straight to picking its recipes; Select
 tags or moves several at once; a card offers the obvious tag for recipes that have none. Each
 change is one request and the screen changes as it goes — nothing reloads the catalogue.
*/
struct DrawerView: View {
    var store: CatalogueStore
    let section: RecipeSection

    @State private var query = ""
    /// The tags being shown — a recipe has to wear every one of them.
    @State private var chosen: Set<UUID>
    /// Only recipes with no tag at all. Never together with tags: "untagged and Chicken" is nothing.
    @State private var untaggedOnly = false
    @State private var machines: Set<String> = []
    /// Only what the kitchen can make. Says nothing while the kitchen has not said what it has.
    @State private var canMakeChosen = false
    @State private var naming = false
    @State private var newTag = ""
    @FocusState private var typing: Bool
    @State private var selecting = false
    /// A tag just made with "+ Tag": select mode picks its recipes, and Done tags them.
    @State private var pickingFor: RecipeCategory?
    @State private var picked: Set<UUID> = []
    @State private var sheet: DrawerSheet?
    @State private var editingTags = false
    @State private var addingRecipe = false
    @State private var busy = false
    @State private var error: String?
    @State private var toast: String?
    @State private var dismissed: Set<String> = TagSuggestions.dismissed()

    private enum DrawerSheet: Identifiable {
        case tag, move
        var id: Self { self }
    }

    /// `tag` opens the drawer with that tag already chosen.
    init(store: CatalogueStore, section: RecipeSection, tag: UUID? = nil) {
        self.store = store
        self.section = section
        _chosen = State(initialValue: tag.map { [$0] } ?? [])
    }

    /// Sample data only, for the Gallery and previews: the drawer on its own, with `tag` chosen.
    init(section: RecipeSection, recipes: [Recipe], categories: [RecipeCategory], tag: String? = nil) {
        store = CatalogueStore(session: nil, sample: recipes, sampleCategories: categories)
        self.section = section
        let id = categories.first { $0.section == section && $0.name == tag }?.id
        _chosen = State(initialValue: id.map { [$0] } ?? [])
    }

    // MARK: - What is shown

    private var all: [Recipe] { store.recipes(in: section) }
    private var tags: [RecipeCategory] { store.tags(in: section) }
    private var chosenTags: [RecipeCategory] { tags.filter { chosen.contains($0.id) } }

    private func isUntagged(_ recipe: Recipe) -> Bool {
        !tags.contains { store.has(recipe, $0) }
    }

    private var untagged: [Recipe] { all.filter(isUntagged) }

    /// How many of the drawer's recipes need each machine.
    private var machineCounts: [String: Int] {
        var counts: [String: Int] = [:]
        // A machine this build has never heard of (a newer server's) is left out, not shown blank.
        for key in all.flatMap({ $0.appliances ?? [] }) where KitchenMachine.named(key) != nil {
            counts[key, default: 0] += 1
        }
        return counts
    }

    /// The machines in this household's kitchen; nil while it has not said.
    private var kitchen: [String]? { store.session?.kitchen }
    private var canOnly: Bool { canMakeChosen && kitchen != nil }

    /// How many of the drawer's recipes the kitchen can make.
    private var makeable: Int {
        let kitchen = self.kitchen
        return all.filter { KitchenMachine.canMake($0.appliances ?? [], kitchen: kitchen) }.count
    }

    private var q: String { query.trimmingCharacters(in: .whitespaces).lowercased() }

    /// The chips, the machines and the search, all at once.
    private var shown: [Recipe] {
        let wanted = chosenTags
        let onlyUntagged = untaggedOnly
        let typed = q
        let kitchen = canOnly ? self.kitchen : nil
        return all.filter { recipe in
            if onlyUntagged {
                guard isUntagged(recipe) else { return false }
            } else {
                guard wanted.allSatisfy({ store.has(recipe, $0) }) else { return false }
            }
            guard machines.allSatisfy({ (recipe.appliances ?? []).contains($0) }) else { return false }
            guard KitchenMachine.canMake(recipe.appliances ?? [], kitchen: kitchen) else { return false }
            return matches(recipe, typed)
        }
    }

    /// The search: the name, a tag, or an ingredient.
    private func matches(_ recipe: Recipe, _ typed: String) -> Bool {
        if typed.isEmpty || recipe.name.lowercased().contains(typed) { return true }
        if recipe.categories.contains(where: { $0.lowercased().contains(typed) }) { return true }
        return recipe.ingredients.contains { $0.ingredientName.lowercased().contains(typed) }
    }

    /// The likeliest tag for the untagged recipes, unless it was waved away — the drawer's own
    /// spelling when it has one ("Veggie" rather than a second tag called Vegetarian).
    private var suggestion: CategoryKinds.TagSuggestion? {
        CategoryKinds.suggestTags(untagged, existing: tags.map(\.name))
            .first { !dismissed.contains(TagSuggestions.key(store.household, section, $0.name)) }
    }

    private var title: String {
        guard selecting else { return section.title }
        if let pickingFor { return "Pick recipes for \(pickingFor.name)" }
        return picked.isEmpty ? "Select recipes" : "\(picked.count) selected"
    }

    var body: some View {
        let visible = shown
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                // There while picking a tag's recipes too: in a drawer of eighty, typing "chick"
                // finds them faster than scrolling past every card. Picks the search hides stay picked.
                if !all.isEmpty {
                    SearchBox(text: $query, prompt: "Search \(section.title)")
                }
                if let pickingFor {
                    Text("Tap every recipe that is \(pickingFor.name), then \(picked.isEmpty ? "Done" : "Tag").")
                        .font(.system(size: 14)).foregroundStyle(Palette.muted)
                } else {
                    tagRow
                    let counts = machineCounts
                    if !counts.isEmpty || canOnly { machineRow(counts) }
                    // About the untagged recipes, so not while looking at a tag or a machine.
                    if !selecting, q.isEmpty, chosenTags.isEmpty, machines.isEmpty, !canOnly, let suggestion {
                        QuickTagCard(name: suggestion.name, count: suggestion.recipeIds.count, busy: busy) {
                            Task { await quickTag(suggestion) }
                        } onDismiss: {
                            withAnimation { dismissed = TagSuggestions.dismiss(store.household, section, suggestion.name) }
                        }
                    }
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Palette.danger)
                }
                content(visible)
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.immediately)
        .pageBackground()
        .centeredTitle(title)
        .textBackButton("Recipes")
        .toolbar { toolbar }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if selecting { selectBar }
        }
        .overlay(alignment: .bottom) {
            if let toast {
                RecipeToast(text: toast).padding(.horizontal, 16).padding(.bottom, selecting ? 76 : 16)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.2), value: toast)
        .refreshable { await store.load() }
        .navigationDestination(isPresented: $editingTags) {
            EditTagsView(store: store, section: section)
        }
        .sheet(item: $sheet) { which in
            let chosenRecipes = all.filter { picked.contains($0.id) }
            switch which {
            case .tag:
                TagRecipesSheet(store: store, section: section, recipes: chosenRecipes) { said in say(said) }
            case .move:
                MoveRecipesSheet(store: store, section: section, recipes: chosenRecipes) { said in
                    stopSelecting()
                    say(said)
                }
            }
        }
        .sheet(isPresented: $addingRecipe) {
            // All three ways in, each with the drawer picked and the chosen tags ticked, both still
            // changeable in the editor.
            NewRecipeView(session: store.session, initialSection: section, initialTags: addTags) { saved in
                store.saved(saved)
            }
        }
        #if DEBUG
        .task { debugOpen() }
        #endif
    }

    /// A recipe started in here starts with the tags you were looking at.
    private var addTags: [String] {
        #if DEBUG
        if chosenTags.isEmpty, let name = UserDefaults.standard.string(forKey: "mp_debug_tag") { return [name] }
        #endif
        return chosenTags.map(\.name)
    }

    // MARK: - Chips

    /**
     All, Untagged, then each tag with its count — one row that scrolls sideways rather than
     wrapping into five rows on a phone — and "+ Tag" held at its end, outside the scrolling, as
     the web's is. Behind a drawer's eight seeded tags, Untagged and "+ Tag" started two screens off
     to the right, and they are the two ways to sort out the recipes nobody has tagged.
    */
    private var tagRow: some View {
        HStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    // Chosen tags count only while they exist: one deleted in Manage tags is not "on".
                    TagChip(title: "All", count: all.count, isOn: chosenTags.isEmpty && !untaggedOnly) {
                        chosen = []
                        untaggedOnly = false
                    }
                    let loose = untagged.count
                    if loose > 0 {
                        TagChip(title: "Untagged", count: loose, isOn: untaggedOnly) {
                            untaggedOnly.toggle()
                            if untaggedOnly { chosen = [] }
                        }
                    }
                    ForEach(tags) { tag in
                        TagChip(title: tag.name, iconKey: tag.iconKey, count: store.count(tag), isOn: chosen.contains(tag.id)) {
                            untaggedOnly = false
                            if chosen.contains(tag.id) { chosen.remove(tag.id) } else { chosen.insert(tag.id) }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 1)
            }
            .fadesAtTrailingEdge()
            if naming {
                newTagField.padding(.trailing, 20)
            } else if !selecting {
                AddTagChip { naming = true }.padding(.trailing, 20)
            }
        }
        .padding(.horizontal, -20)
    }

    /// "+ Tag" turned into a box: Return makes the tag, an empty box closes again.
    private var newTagField: some View {
        HStack(spacing: 6) {
            TextField("New tag", text: $newTag)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Palette.text)
                .focused($typing)
                .submitLabel(.done)
                .onSubmit { Task { await makeTag() } }
                .frame(width: 130)
                // A field that has only just appeared can miss focus set on the same pass.
                .task {
                    try? await Task.sleep(for: .milliseconds(150))
                    typing = true
                }
            Button {
                newTag = ""
                naming = false
            } label: {
                Image(systemName: "xmark").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.muted)
            }
            .buttonStyle(PressFade())
            .accessibilityLabel("Cancel the new tag")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(Palette.surface, in: Capsule())
        .overlay(Capsule().strokeBorder(Palette.accent, lineWidth: 1.5))
        .onChange(of: typing) { _, focused in
            if !focused && newTag.trimmingCharacters(in: .whitespaces).isEmpty { naming = false }
        }
    }

    /// The machines this drawer's recipes need, in the catalogue's order, each a filter of its own —
    /// after Can make, once the kitchen has said what it has.
    private func machineRow(_ counts: [String: Int]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if kitchen != nil {
                    let count = makeable
                    Button { canMakeChosen = !canOnly } label: {
                        CanMakePill(count: count, isOn: canOnly)
                    }
                    .buttonStyle(PressFade())
                    .accessibilityLabel("Can make, \(count)")
                    .accessibilityHint("Only what your kitchen can make")
                    .accessibilityAddTraits(canOnly ? .isSelected : [])
                }
                ForEach(KitchenMachine.ordered(counts.keys)) { machine in
                    let on = machines.contains(machine.key)
                    let count = counts[machine.key] ?? 0
                    Button {
                        if on { machines.remove(machine.key) } else { machines.insert(machine.key) }
                    } label: {
                        MachinePill(machine: machine, count: count, isOn: on)
                    }
                    .buttonStyle(PressFade())
                    .accessibilityLabel("\(machine.label), \(count)")
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 1)
        }
        .fadesAtTrailingEdge()
        .padding(.horizontal, -20)
    }

    // MARK: - Recipes

    @ViewBuilder
    private func content(_ shown: [Recipe]) -> some View {
        if !store.loaded {
            ProgressView().frame(maxWidth: .infinity).padding(.vertical, 32)
        } else if all.isEmpty {
            VStack(spacing: 14) {
                Text("Nothing filed in \(section.title) yet.")
                    .font(.system(size: 15)).foregroundStyle(Palette.muted)
                Button { addingRecipe = true } label: { Label("Add a recipe", systemImage: "plus") }
                    .buttonStyle(.kitchen(.soft, size: .small))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 32)
        } else if shown.isEmpty {
            nothingMatches
        } else if selecting {
            SelectableRecipeGrid(recipes: shown, picked: $picked)
        } else {
            RecipePhotoGrid(recipes: shown, session: store.session)
        }
    }

    /// Said for what is chosen — "Nothing tagged Chicken + Quick" — with a way to fix it.
    private var nothingMatches: some View {
        let names = chosenTags.map(\.name).joined(separator: " + ")
        let needs = KitchenMachine.ordered(machines)
        // The web's words: "Nothing tagged Chicken needs the oven and air fryer.", and with Can
        // make on, "Nothing here your kitchen can make."
        let needed: String = needs.isEmpty ? "" : " needs the \(KitchenMachine.words(needs))"
        var machineWords = needed
        if canOnly {
            machineWords = needed.isEmpty ? " your kitchen can make" : "\(needed) and can be made in your kitchen"
        }
        let line: String
        if !q.isEmpty {
            line = "Nothing in \(section.title) matches that."
        } else if untaggedOnly {
            line = machineWords.isEmpty ? "Every recipe here has a tag." : "No untagged recipe\(machineWords)."
        } else if !names.isEmpty {
            line = "Nothing tagged \(names)\(machineWords)."
        } else {
            line = "Nothing here\(machineWords)."
        }
        return VStack(spacing: 14) {
            Text(line).font(.system(size: 15)).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
            if q.isEmpty, machines.isEmpty, !canOnly, chosenTags.count == 1, let tag = chosenTags.first {
                Button { startPicking(tag) } label: { Label("Tag recipes", systemImage: "tag") }
                    .buttonStyle(.kitchen(.soft, size: .small))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }

    // MARK: - Bars

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        BareToolbarItem(placement: .topBarTrailing) {
            if !selecting {
                HStack(spacing: 16) {
                    Button("Select") { startSelecting() }
                        .font(.system(size: 17))
                        .disabled(all.isEmpty)
                    Button { editingTags = true } label: {
                        Image(systemName: "pencil.line").font(.system(size: 19, weight: .medium))
                    }
                    .accessibilityLabel("Edit tags")
                    Button { addingRecipe = true } label: {
                        Image(systemName: "plus").font(.system(size: 20, weight: .medium))
                    }
                    .accessibilityLabel("Add recipe")
                }
                .foregroundStyle(Palette.accentInk)
                .fixedSize()
            }
        }
    }

    /// Select mode's bar along the bottom: how many, Tag, Move and Done — or, picking a new tag's
    /// recipes, Cancel and the button that tags them.
    private var selectBar: some View {
        HStack(spacing: 10) {
            if let tag = pickingFor {
                Button("Cancel") { stopSelecting() }
                    .buttonStyle(.kitchen(.secondary, size: .small, fill: false))
                    .fixedSize()
                Spacer(minLength: 0)
                // First call on the room, so a long tag's name is cut short at its end ("Tag 3
                // Grandma's Sunday…") rather than the bar sharing it out and leaving "Tag 3 Gr…".
                Button(pickingTitle(tag)) {
                    Task { await finishPicking(tag) }
                }
                .buttonStyle(.kitchen(.primary, size: .small, fill: false))
                .layoutPriority(1)
                .disabled(busy)
            } else {
                Text("\(picked.count) selected")
                    .font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Button { sheet = .tag } label: { Label("Tag", systemImage: "tag") }
                    .buttonStyle(.kitchen(.secondary, size: .small, fill: false))
                    .disabled(picked.isEmpty)
                Button { sheet = .move } label: { Label("Move", systemImage: "arrow.right.square") }
                    .buttonStyle(.kitchen(.secondary, size: .small, fill: false))
                    .disabled(picked.isEmpty)
                Button("Done") { stopSelecting() }
                    .buttonStyle(.kitchen(.primary, size: .small, fill: false))
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(Palette.bg)
        .overlay(alignment: .top) { Rectangle().fill(Palette.border).frame(height: 1) }
    }

    /// Picking a new tag's recipes: "Tag 3 Chicken", or Done with none picked.
    private func pickingTitle(_ tag: RecipeCategory) -> String {
        if busy { return "Tagging…" }
        return picked.isEmpty ? "Done" : "Tag \(picked.count) \(tag.name)"
    }

    // MARK: - Behaviour

    private func startSelecting() {
        naming = false
        picked = []
        pickingFor = nil
        withAnimation(.snappy(duration: 0.2)) { selecting = true }
    }

    private func stopSelecting() {
        // A search made while picking a tag's recipes was only for finding them.
        if pickingFor != nil { query = "" }
        withAnimation(.snappy(duration: 0.2)) {
            selecting = false
            pickingFor = nil
            picked = []
        }
    }

    /// Straight into choosing a tag's recipes, every recipe in the drawer on show and the ones
    /// already wearing it picked.
    private func startPicking(_ tag: RecipeCategory) {
        chosen = []
        untaggedOnly = false
        machines = []
        canMakeChosen = false
        query = ""
        pickingFor = tag
        picked = Set(all.filter { store.has($0, tag) }.map(\.id))
        withAnimation(.snappy(duration: 0.2)) { selecting = true }
    }

    /// "+ Tag", Return: the tag is made at once, then its recipes are picked. A name the drawer
    /// has already goes to picking that tag's recipes rather than failing on the name.
    private func makeTag() async {
        let name = newTag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else {
            naming = false
            return
        }
        if let existing = store.tag(named: name, in: section) {
            newTag = ""
            naming = false
            startPicking(existing)
            return
        }
        busy = true
        defer { busy = false }
        do {
            error = nil
            let made = try await store.createTag(name, in: section)
            newTag = ""
            naming = false
            startPicking(made)
        } catch {
            // Another phone made it a moment ago: the store has fetched the tags again, so it is
            // here now — on to picking its recipes, as for a name the drawer already had.
            if let there = store.tag(named: name, in: section) {
                newTag = ""
                naming = false
                startPicking(there)
                return
            }
            self.error = "Could not make \(name). \(error.localizedDescription)"
        }
    }

    /// Done while picking a tag's recipes: one request puts it on (and takes it off) the lot,
    /// then the drawer shows that tag.
    private func finishPicking(_ picking: RecipeCategory) async {
        let tag = store.categories.first { $0.id == picking.id } ?? picking
        let had = Set(all.filter { store.has($0, tag) }.map(\.id))
        let add = picked.subtracting(had), remove = had.subtracting(picked)
        if !add.isEmpty || !remove.isEmpty {
            busy = true
            defer { busy = false }
            do {
                error = nil
                try await store.tagRecipes(tag, add: add, remove: remove)
            } catch {
                self.error = "Could not tag those. \(error.localizedDescription)"
                return
            }
            if !add.isEmpty { say("Tagged \(add.count) \(add.count == 1 ? "recipe" : "recipes") \(tag.name)") }
        }
        stopSelecting()
        chosen = [tag.id]
    }

    /// The quick-tag card's one tap: onto the drawer's tag of that name if it has one (a seeded
    /// "Chicken", or "Veggie" for Vegetarian), otherwise a new tag made with them on it — one
    /// request either way, and one more if another phone made that tag a moment ago.
    private func quickTag(_ suggestion: CategoryKinds.TagSuggestion) async {
        let ids = Set(suggestion.recipeIds)
        busy = true
        defer { busy = false }
        do {
            error = nil
            if let existing = store.tag(named: suggestion.name, in: section) {
                try await store.tagRecipes(existing, add: ids, remove: [])
            } else {
                do {
                    try await store.createTag(suggestion.name, in: section, recipeIds: ids)
                } catch {
                    guard let there = store.tag(named: suggestion.name, in: section) else { throw error }
                    try await store.tagRecipes(there, add: ids, remove: [])
                }
            }
            say("Tagged \(ids.count) \(ids.count == 1 ? "recipe" : "recipes") \(suggestion.name)")
        } catch {
            self.error = "Could not tag those. \(error.localizedDescription)"
        }
    }

    private func say(_ text: String) {
        toast = text
        Task {
            try? await Task.sleep(for: .seconds(3))
            if toast == text { toast = nil }
        }
    }

    #if DEBUG
    @MainActor private static var debugOpened = false

    /**
     For screenshot runs, with `-mp_debug_drawer`: `-mp_debug_screen add` opens the new-recipe
     form here (with `-mp_debug_tag` ticked), `tags` Manage tags, `newtag` the "+ Tag" box,
     `select` select mode, `tag-sheet` and `move-sheet` the Tag and Move sheets for the first two
     recipes, and `pick` picking the recipes for `-mp_debug_tag` (or the first tag).
    */
    private func debugOpen() {
        let defaults = UserDefaults.standard
        // Once per launch: coming back from a recipe must not open it all again.
        guard !Self.debugOpened, defaults.string(forKey: "mp_debug_drawer")?.uppercased() == section.rawValue else { return }
        Self.debugOpened = true
        let named = defaults.string(forKey: "mp_debug_tag").flatMap { store.tag(named: $0, in: section) }
        switch defaults.string(forKey: "mp_debug_screen") {
        case "add": addingRecipe = true
        case "tags": editingTags = true
        case "newtag": naming = true
        case "select": startSelecting()
        case "tag-sheet", "move-sheet":
            startSelecting()
            picked = Set(all.prefix(2).map(\.id))
            sheet = defaults.string(forKey: "mp_debug_screen") == "tag-sheet" ? .tag : .move
        case "pick":
            if let tag = named ?? tags.first { startPicking(tag) }
        default: break
        }
    }
    #endif
}

private extension View {
    /// A sideways row of chips running off the screen: its last few points fade out, so a row cut
    /// short by the edge reads as one that scrolls rather than one that has ended.
    func fadesAtTrailingEdge() -> some View {
        mask {
            HStack(spacing: 0) {
                Color.black
                LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
                    .frame(width: 28)
            }
        }
    }
}

/**
 Quick-tag suggestions somebody closed, remembered on this phone per household, drawer and tag
 name — "not now" should not come back on the next visit. Capped, as the web's is.
*/
enum TagSuggestions {
    private static let defaultsKey = "mp_dismissedTagSuggestions"

    static func key(_ household: UUID?, _ section: RecipeSection, _ name: String) -> String {
        "\(household?.uuidString.lowercased() ?? "sample"):\(section.rawValue):\(name.lowercased())"
    }

    static func dismissed() -> Set<String> {
        Set(UserDefaults.standard.stringArray(forKey: defaultsKey) ?? [])
    }

    /// Remembers one more, and answers with every one remembered.
    static func dismiss(_ household: UUID?, _ section: RecipeSection, _ name: String) -> Set<String> {
        var list = UserDefaults.standard.stringArray(forKey: defaultsKey) ?? []
        let entry = Self.key(household, section, name)
        if !list.contains(entry) { list.append(entry) }
        list = Array(list.suffix(200))
        UserDefaults.standard.set(list, forKey: defaultsKey)
        return Set(list)
    }
}

#Preview("Dinner drawer") {
    NavigationStack {
        DrawerView(section: .dinner, recipes: SampleData.recipes, categories: SampleData.recipeCategories)
    }
}

#Preview("Dinner drawer — Chicken, dark") {
    NavigationStack {
        DrawerView(section: .dinner, recipes: SampleData.recipes, categories: SampleData.recipeCategories, tag: "Chicken")
    }
    .preferredColorScheme(.dark)
}
