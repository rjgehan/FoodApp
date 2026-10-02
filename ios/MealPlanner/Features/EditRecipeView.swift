import PhotosUI
import SwiftUI
#if canImport(ImagePlayground)
import ImagePlayground
#endif

/// Writing a recipe down, or fixing one you already have: the fields worth changing on a
/// phone, and the ingredient list, which is the part that actually gets corrected while
/// cooking ("that was 3 cloves, not 2").
///
/// A nil recipe is a new one. Same form either way — there is nothing about writing a recipe
/// that wants a different screen from editing it. A new one can start from a draft read off a
/// link or a paste, which is checked here before anything is saved.
struct EditRecipeView: View {
    let recipe: Recipe?
    var session: Session?
    /// Inside New recipe's own navigation — as its "Type it out" page, or pushed to check a
    /// draft — rather than a sheet of its own. That screen owns Cancel and closes itself on save.
    var embedded = false
    /// False while New recipe keeps this page alive behind another way in, so its Save is not
    /// in the bar over a link or a paste.
    var showsSave = true
    /// Offers Delete at the foot of the form, for a recipe that exists; called once it is gone.
    var onDeleted: (() -> Void)? = nil
    var onSaved: (Recipe) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var summary: String
    @State private var servings: Int
    /// Nil until somebody types a time, so an empty field shows its faint "–", not a made-up 0.
    @State private var prep: Int?
    @State private var cook: Int?
    @State private var instructions: String
    @State private var ingredients: [Draft]
    @State private var links: [LinkDraft]
    @State private var coverImageId: UUID?
    @State private var cover = CoverPhotoFlow()
    @State private var section: RecipeSection
    @State private var groups: Set<String>
    /// Ticked groups set aside when the drawer changed — see `moveToDrawer`.
    @State private var parked: Set<String> = []
    @State private var allGroups: [RecipeCategory] = []
    @State private var choosingPhoto = false
    @State private var pickedPhoto: PhotosPickerItem?
    @State private var confirmingDelete = false
    @FocusState private var focus: Focus?
    @State private var busy = false
    @State private var error: String?
    /// The household already has this one: which, so the question can name it.
    @State private var duplicate: DuplicateRecipe?
    /// Where a draft came from and what to check, said above the form.
    private let draftNote: String?
    /// The saved link this new recipe is being made from: saving it takes the link off Saved
    /// links, and meals planned with the link move over to the recipe.
    private let savedLinkId: UUID?

    /// Where the keyboard is: the fields, and each ingredient line's three boxes.
    enum Focus: Hashable {
        case name, prep, cook, serves, summary, method
        case ingredient(UUID), amount(UUID), unit(UUID)
    }

    /// An ingredient being edited: amounts are text while you type, numbers only on save.
    struct Draft: Identifiable, Hashable {
        let id = UUID()
        var amount: String
        var unit: String
        var name: String
        var optional: Bool
        /// "minced", "or to taste": not on screen, but carried through so a save does not drop it.
        var notes: String? = nil
    }

    /// `initialSection` and `initialGroups` file a new recipe where it was started from — the
    /// drawer, and the group you were in — the way the web's `?section=&group=` does.
    init(recipe: Recipe?, session: Session?, draft: RecipeDraft? = nil, embedded: Bool = false,
         showsSave: Bool = true, initialSection: RecipeSection? = nil, initialGroups: [String] = [],
         onDeleted: (() -> Void)? = nil, onSaved: @escaping (Recipe) -> Void) {
        self.recipe = recipe
        self.session = session
        self.embedded = embedded
        self.showsSave = showsSave
        self.onDeleted = onDeleted
        self.onSaved = onSaved
        // A draft only ever starts a new recipe; an existing one is edited as it is.
        let draft = recipe == nil ? draft : nil
        draftNote = draft?.note
        savedLinkId = draft?.savedLinkId
        // Dinner is what the web defaults a new recipe to.
        _section = State(initialValue: recipe?.section ?? initialSection ?? .dinner)
        _groups = State(initialValue: Set(recipe?.categories ?? initialGroups))
        _name = State(initialValue: recipe?.name ?? draft?.name ?? "")
        _summary = State(initialValue: recipe?.description ?? draft?.description ?? "")
        _servings = State(initialValue: recipe?.servings ?? draft.map { min(max($0.servings, 1), 40) } ?? 4)
        // A draft says 0 for a time it did not find; that is no time, not a time of 0.
        _prep = State(initialValue: recipe?.prepTimeMinutes ?? draft.flatMap { $0.prep > 0 ? $0.prep : nil })
        _cook = State(initialValue: recipe?.cookTimeMinutes ?? draft.flatMap { $0.cook > 0 ? $0.cook : nil })
        _instructions = State(initialValue: recipe?.instructions ?? draft?.instructions ?? "")
        _coverImageId = State(initialValue: recipe?.coverImageId ?? draft?.coverImageId)
        _links = State(initialValue: (recipe?.allLinks ?? draft?.links ?? []).map { LinkDraft($0) })
        // One empty row when there are none — a new recipe, or one planned as just a name and
        // opened from "Add ingredients" — so there is somewhere to start typing. Blank rows
        // are dropped on save.
        let written = { (q: Double?) in q.map(chipAmount) ?? "" }
        let existing = recipe.map { recipe in
            recipe.ingredients.map {
                Draft(amount: written($0.quantity), unit: $0.unit ?? "", name: $0.ingredientName,
                      optional: $0.optional, notes: $0.notes)
            }
        } ?? (draft?.ingredients ?? []).map {
            Draft(amount: written($0.quantity), unit: $0.unit, name: $0.name, optional: $0.optional, notes: $0.notes)
        }
        _ingredients = State(initialValue: existing.isEmpty
            ? [Draft(amount: "", unit: "", name: "", optional: false)]
            : existing)
    }

    var body: some View {
        if embedded {
            editor
        } else {
            NavigationStack { editor }
        }
    }

    private var title: String {
        if recipe != nil { return "Edit recipe" }
        return draftNote != nil ? "Check recipe" : "New recipe"
    }

    /*
     Laid out as the mockup's "Check recipe" (3.16): the picture beside the name, the times and
     servings in a row, each ingredient as one line — amount and unit as small chips, the name,
     a leaf that makes it optional — then the method, the links and the filing as chips.
    */
    private var editor: some View {
        ScrollViewReader { scroller in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let draftNote {
                        NoteBox(draftNote, tone: .herb, systemImage: "checklist")
                    }

                    HStack(spacing: 12) {
                        coverTile
                        TextField("Recipe name", text: $name)
                            .font(.system(size: 17))
                            .padding(.horizontal, 14)
                            .frame(height: 46)
                            .fieldSurface(focused: focus == .name)
                            .focused($focus, equals: .name)
                            .accessibilityLabel("Name")
                    }
                    if cover.uploading {
                        HStack(spacing: 8) { ProgressView(); Text("Saving the photo…").foregroundStyle(Palette.muted) }
                            .font(.system(size: 14))
                    }
                    if let coverError = cover.error {
                        Text(coverError).font(.system(size: 13)).foregroundStyle(Palette.danger)
                    }

                    // The quick facts the recipe page shows on its photo, in the same order.
                    HStack(spacing: 8) {
                        factField("clock", value: $prep, suffix: "min prep", label: "Prep, minutes", field: .prep)
                        factField("flame", value: $cook, suffix: "cook", label: "Cook, minutes", field: .cook)
                        factField("person.2", value: Binding(get: { servings }, set: { servings = $0 ?? servings }),
                                  suffix: nil, label: "Serves", field: .serves)
                            .frame(width: 74)
                    }

                    TextField("A line about it (optional)", text: $summary, axis: .vertical)
                        .font(.system(size: 15))
                        .lineLimit(1...3)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .fieldSurface(focused: focus == .summary)
                        .focused($focus, equals: .summary)
                        .accessibilityLabel("Description")

                    SectionLabel("Ingredients", trailing: "Leaf = optional").padding(.top, 4)
                    VStack(spacing: 6) {
                        ForEach($ingredients) { $row in
                            ingredientLine($row)
                        }
                    }
                    Button {
                        let row = Draft(amount: "", unit: "", name: "", optional: false)
                        ingredients.append(row)
                        focus = .ingredient(row.id)
                    } label: { Label("Add ingredient", systemImage: "plus") }
                        .buttonStyle(.kitchen(.ghost, size: .small, fill: false))
                        .padding(.leading, -12)

                    SectionLabel("Method").padding(.top, 4)
                    TextField("One step per line", text: $instructions, axis: .vertical)
                        .font(.system(size: 15))
                        .lineLimit(5...20)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .fieldSurface(focused: focus == .method)
                        .focused($focus, equals: .method)
                        .accessibilityLabel("Method")

                    SectionLabel("Links").padding(.top, 4)
                    linksEditor

                    SectionLabel("Filing").padding(.top, 4)
                    FilingPicker(section: $section, groups: $groups, allGroups: allGroups) { name in
                        await addGroup(named: name)
                    }

                    if let error {
                        Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
                    }

                    if recipe != nil, onDeleted != nil {
                        // The rarest thing on the page, and the last; it asks first.
                        Button { confirmingDelete = true } label: { Label("Delete this recipe", systemImage: "trash") }
                            .buttonStyle(.kitchen(.ghost, size: .small, fill: true))
                            .padding(.top, 8)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.interactively)
            #if DEBUG
            // -mp_debug_scroll links (with -mp_debug_screen edit) scrolls down to the links, and
            // "filing" to the drawer and groups, so a screenshot run can see them without a
            // finger to scroll with.
            .task {
                let target = UserDefaults.standard.string(forKey: "mp_debug_scroll")
                guard target == "links" || target == "filing" else { return }
                try? await Task.sleep(for: .milliseconds(900))
                withAnimation {
                    scroller.scrollTo(target == "links" ? LinksSection.anchor : "filing", anchor: .top)
                }
            }
            #endif
        }
        .pageBackground()
        .coverPhotoFlow(cover, session: session, coverImageId: $coverImageId)
        .photosPicker(isPresented: $choosingPhoto, selection: $pickedPhoto, matching: .images, photoLibrary: .shared())
        .onChange(of: pickedPhoto) { _, item in
            guard let item else { return }
            Task {
                defer { pickedPhoto = nil }
                guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
                    cover.error = "Could not read that photo."
                    return
                }
                await upload(image, into: $coverImageId, session: session, flow: cover)
            }
        }
        .task { await loadGroups() }
        .onChange(of: section) { _, next in moveToDrawer(next) }
        .confirmationDialog(
            "You already have “\(duplicate?.name ?? "")”",
            isPresented: Binding(get: { duplicate != nil }, set: { if !$0 { duplicate = nil } }),
            titleVisibility: .visible
        ) {
            Button("Save another copy") { Task { await save(anotherCopy: true) } }
            Button("Don't save", role: .cancel) { duplicate = nil }
        } message: {
            Text("It's already in your recipes — the same link or the same name.")
        }
        .kitchenAlert(isPresented: $confirmingDelete) {
            if let recipe {
                DeleteRecipeCard(recipe: recipe, session: session) { deleted in
                    confirmingDelete = false
                    if deleted { onDeleted?() }
                }
            }
        }
        .centeredTitle(title)
        .toolbar {
            if !embedded {
                BarTextButton("Cancel", placement: .topBarLeading) { dismiss() }
            }
            if showsSave {
                BarTextButton("Save", placement: .topBarTrailing, bold: true,
                              disabled: busy || name.trimmingCharacters(in: .whitespaces).isEmpty) {
                    Task { await save() }
                }
            }
        }
    }

    /// The picture beside the name: tap it for the ways to get one — made on the phone from the
    /// name, taken, or chosen — or to take it away.
    private var coverTile: some View {
        Menu {
            if canGenerate {
                Button {
                    cover.ask = .generate(name.trimmingCharacters(in: .whitespacesAndNewlines))
                } label: {
                    Label(coverImageId == nil ? "Generate a photo" : "Generate a different one", systemImage: "apple.intelligence")
                }
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            Button { cover.ask = .camera } label: { Label("Take my own photo", systemImage: "camera") }
            Button { choosingPhoto = true } label: { Label("Choose from my photos", systemImage: "photo.on.rectangle") }
            if coverImageId != nil {
                Button(role: .destructive) { coverImageId = nil } label: { Label("Remove the photo", systemImage: "trash") }
            }
        } label: {
            ZStack {
                if let coverImageId, let url = APIClient.shared.imageURL(coverImageId) {
                    AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Palette.surface2 }
                } else {
                    RecipePhotoPlaceholder(hue: recipe.map { .of($0.id.uuidString.lowercased()) } ?? (name.isEmpty ? .tomato : .of(name)),
                                           systemImage: "photo", radius: 0)
                }
                if cover.uploading { ProgressView().tint(.white) }
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .disabled(cover.uploading)
        .accessibilityLabel(coverImageId == nil ? "Add a photo" : "Change the photo")
    }

    /// Hidden rather than disabled when the device cannot do it.
    private var canGenerate: Bool {
        #if canImport(ImagePlayground)
        if #available(iOS 18.1, *) { return ImagePlaygroundViewController.isAvailable }
        #endif
        return false
    }

    /// "⏱ 10 min prep": a small number field with its icon and what the number means.
    private func factField(_ symbol: String, value: Binding<Int?>, suffix: String?, label: String, field: Focus) -> some View {
        HStack(spacing: 6) {
            Image(systemName: symbol).font(.system(size: 15)).foregroundStyle(Palette.muted)
            TextField("–", value: value, format: .number)
                .keyboardType(.numberPad)
                .font(.system(size: 14))
                .fixedSize()
                .focused($focus, equals: field)
                .accessibilityLabel(label)
            if let suffix {
                Text(suffix).font(.system(size: 14)).foregroundStyle(Palette.muted).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10)
        .frame(height: 42)
        .frame(maxWidth: .infinity)
        .fieldSurface(focused: focus == field)
        .contentShape(Rectangle())
        .onTapGesture { focus = field }
    }

    /// One ingredient as one line: the amount and unit as chips, the name, the leaf.
    private func ingredientLine(_ row: Binding<Draft>) -> some View {
        let id = row.wrappedValue.id
        let focused = focus == .ingredient(id) || focus == .amount(id) || focus == .unit(id)
        return HStack(spacing: 6) {
            TextField("qty", text: row.amount)
                .keyboardType(.decimalPad)
                .modifier(IngredientChip(tone: .sky))
                .focused($focus, equals: .amount(id))
                .accessibilityLabel("Amount")
            // A line with no unit ("6 eggs") shows just its amount, as in the mockup; the faint
            // "unit" box is there on the line being typed, and on a new empty one.
            let blank = row.wrappedValue.amount.isEmpty && row.wrappedValue.name.isEmpty
            if focused || blank || !row.wrappedValue.unit.isEmpty {
                TextField("unit", text: row.unit)
                    .textInputAutocapitalization(.never)
                    .modifier(IngredientChip(tone: .herb))
                    .focused($focus, equals: .unit(id))
                    .accessibilityLabel("Unit")
            }
            TextField("ingredient", text: row.name)
                .font(.system(size: 15))
                .submitLabel(.next)
                .focused($focus, equals: .ingredient(id))
                .onSubmit { splitTyped(id, addLine: true) }
                .onChange(of: focus) { old, _ in
                    if old == .ingredient(id) { splitTyped(id, addLine: false) }
                }
            Button {
                row.wrappedValue.optional.toggle()
            } label: {
                if row.wrappedValue.optional {
                    Pill("Opt.", tone: .mustard)
                } else {
                    Image(systemName: "leaf").font(.system(size: 15)).foregroundStyle(Palette.faint)
                        .frame(width: 28, height: 28)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Optional")
            .accessibilityValue(row.wrappedValue.optional ? "On" : "Off")
            .accessibilityAddTraits(row.wrappedValue.optional ? .isSelected : [])
            Button {
                ingredients.removeAll { $0.id == id }
                if ingredients.isEmpty { ingredients = [Draft(amount: "", unit: "", name: "", optional: false)] }
            } label: {
                Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
                    .frame(width: 24, height: 28)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove \(row.wrappedValue.name.isEmpty ? "ingredient" : row.wrappedValue.name)")
        }
        .padding(.leading, 10)
        .padding(.trailing, 6)
        .frame(minHeight: 44)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(focused ? Palette.accent : Palette.border, lineWidth: focused ? 1.5 : 1)
        }
    }

    /**
     "2 cups flour" typed into the name, with the amount and unit still empty, is split into
     them — the way it is written on the card is faster than hopping between three boxes. Return
     at the end of the last line starts a new one.
    */
    private func splitTyped(_ id: UUID, addLine: Bool) {
        guard let i = ingredients.firstIndex(where: { $0.id == id }) else { return }
        let row = ingredients[i]
        if row.amount.isEmpty && row.unit.isEmpty && !row.name.isEmpty {
            let line = RecipeDraft.Ingredient(line: row.name)
            if line.quantity != nil {
                let q = line.quantity!
                ingredients[i].amount = chipAmount(q)
                ingredients[i].unit = line.unit
                ingredients[i].name = line.name
                if let notes = line.notes, !notes.isEmpty { ingredients[i].notes = notes }
            }
        }
        if addLine, i == ingredients.count - 1, !ingredients[i].name.trimmingCharacters(in: .whitespaces).isEmpty {
            let next = Draft(amount: "", unit: "", name: "", optional: false)
            ingredients.append(next)
            focus = .ingredient(next.id)
        }
    }

    /// The links, a row each with a name under it once there is an address, and "Add link".
    private var linksEditor: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach($links) { $link in
                VStack(spacing: 0) {
                    HStack(spacing: 8) {
                        Image(systemName: SourceLink(url: link.url, label: nil).isVideo ? "play" : "link")
                            .font(.system(size: 15)).foregroundStyle(Palette.muted)
                        TextField("https://…", text: $link.url)
                            .keyboardType(.URL)
                            .textContentType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .font(.system(size: 15))
                            .accessibilityLabel("Link")
                        Button {
                            links.removeAll { $0.id == link.id }
                        } label: {
                            Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
                                .frame(width: 24, height: 28)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Remove link")
                    }
                    .frame(minHeight: 44)
                    if !link.url.trimmingCharacters(in: .whitespaces).isEmpty {
                        Rectangle().fill(Palette.border).frame(height: 1)
                        // Named after the site unless somebody says otherwise, and the placeholder says which.
                        TextField(SourceLink.siteName(of: link.url).map { "Name (optional) — \($0)" } ?? "Name (optional)",
                                  text: $link.label)
                            .font(.system(size: 14))
                            .frame(minHeight: 38)
                            .accessibilityLabel("Link name")
                            .onChange(of: link.label) { _, label in
                                if label.count > LinkDraft.maxLabel { link.label = String(label.prefix(LinkDraft.maxLabel)) }
                            }
                    }
                }
                .padding(.horizontal, 12)
                .background(Palette.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
            }
            Button {
                links.append(LinkDraft())
            } label: { Label("Add link", systemImage: "plus") }
                .buttonStyle(.kitchen(.ghost, size: .small, fill: false))
                .padding(.leading, -12)
                // The server keeps up to twenty; past that the button would only lead to a refusal.
                .disabled(links.count >= LinkDraft.maxLinks)
                .id(LinksSection.anchor)
        }
    }

    /**
     Groups belong to a drawer, and the server files a recipe by group name, making any it cannot
     find. So a group ticked in the old drawer — Veggie, when the recipe was started from inside
     Dinner › Veggie and then moved to Lunch — would drop out of sight here and come back as a
     new, empty Veggie in Lunch. It is set aside instead, and ticked again if the recipe moves
     back to a drawer that has it: the same as the web's form. A name the household has no group
     for anywhere goes wherever the recipe goes.
    */
    private func moveToDrawer(_ next: RecipeSection) {
        func same(_ a: String, _ b: String) -> Bool { a.caseInsensitiveCompare(b) == .orderedSame }
        func inDrawer(_ name: String) -> Bool {
            allGroups.contains { same($0.name, name) && ($0.section == nil || $0.section == next) }
        }
        func isKnown(_ name: String) -> Bool { allGroups.contains { same($0.name, name) } }

        let setAside = groups.filter { isKnown($0) && !inDrawer($0) }
        let back = parked.filter { name in inDrawer(name) && !groups.contains { same($0, name) } }
        groups.subtract(setAside)
        groups.formUnion(back)
        parked.subtract(back)
        parked.formUnion(setAside)
    }

    private func loadGroups() async {
        guard let household = session?.household?.id else { return }
        allGroups = (try? await APIClient.shared.recipeCategories(household: household)) ?? []
    }

    private func addGroup(named wanted: String) async {
        guard !wanted.isEmpty, let household = session?.household?.id else { return }
        do {
            let made = try await APIClient.shared.createRecipeCategory(
                household: household, name: wanted, section: section)
            allGroups.append(made)
            groups.insert(made.name)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save(anotherCopy: Bool = false) async {
        busy = true
        defer { busy = false }

        // The backend takes the whole recipe back, so anything not on this screen is sent as
        // it came: the section and groups this household filed it under, and its photos.
        let rows: [[String: Any]] = ingredients
            .filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }
            .map { row in
                var out: [String: Any] = [
                    "ingredientName": row.name.trimmingCharacters(in: .whitespaces),
                    "optional": row.optional,
                ]
                // A blank amount is left out, which the server keeps as none: "salt and pepper"
                // is "some", not 1 of it. "1,5", "1/2" and "1½" are read the way the rest of the
                // phone reads them.
                if let amount = Amount.quantity(row.amount) {
                    out["quantity"] = amount
                }
                let unit = row.unit.trimmingCharacters(in: .whitespaces)
                if !unit.isEmpty { out["unit"] = unit }
                if let notes = row.notes, !notes.isEmpty { out["notes"] = notes }
                return out
            }

        var body: [String: Any] = [
            "name": name.trimmingCharacters(in: .whitespaces),
            "servings": servings,
            "categories": Array(groups),
            "ingredients": rows,
        ]
        body["section"] = section.rawValue
        let trimmedSummary = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedSummary.isEmpty { body["description"] = trimmedSummary }
        let trimmedSteps = instructions.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedSteps.isEmpty { body["instructions"] = trimmedSteps }
        if let prep, prep > 0 { body["prepTimeMinutes"] = prep }
        if let cook, cook > 0 { body["cookTimeMinutes"] = cook }
        // Explicitly null rather than absent, so removing the photo actually removes it.
        // `nil as Any` would not do — JSONSerialization refuses it.
        body["coverImageId"] = coverImageId.map { $0.uuidString as Any } ?? NSNull()
        // The server replaces the photo list with whatever arrives, so the ones this screen
        // does not show still have to be sent. Leaving them out deleted them on every edit.
        body["photoIds"] = (recipe?.photoIds ?? []).map(\.uuidString)
        // The whole list, every time. Before the phone knew about links it sent none, and the
        // server took that as "none" — every save from here wiped the recipe's links.
        body["links"] = LinkDraft.body(links)
        // Ignored by a server that knows about links; kept by one that does not yet.
        let legacy = LinkDraft.legacyFields(links)
        body["sourceUrl"] = legacy.sourceUrl ?? NSNull()
        body["videoUrl"] = legacy.videoUrl ?? NSNull()
        if recipe == nil, let savedLinkId { body["savedLinkId"] = savedLinkId.uuidString }

        do {
            let saved: Recipe
            if let recipe {
                saved = try await APIClient.shared.updateRecipe(recipe, body: body)
            } else if let household = session?.household?.id {
                saved = try await APIClient.shared.createRecipe(household: household, body: body,
                                                                allowDuplicate: anotherCopy)
            } else {
                error = "No household to save it to."
                return
            }
            onSaved(saved)
            // Embedded, the screen around it closes itself — a dismiss here would only pop back
            // to the link or the paste it came from.
            if !embedded { dismiss() }
        } catch let apiError as APIError where apiError.duplicateRecipe != nil {
            duplicate = apiError.duplicateRecipe
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/**
 An amount as the line's chip shows it: "½" and "1¼" as on the recipe page, not "0.5". Only an
 exact fraction becomes a glyph, so saving a line nobody touched never rounds its amount.
 */
func chipAmount(_ value: Double) -> String {
    if value == value.rounded() { return String(Int(value)) }
    let whole = Int(value.rounded(.down))
    let rest = value - Double(whole)
    let marks: [(Double, String)] = [(0.125, "⅛"), (0.25, "¼"), (1.0 / 3, "⅓"), (0.375, "⅜"), (0.5, "½"),
                                     (0.625, "⅝"), (2.0 / 3, "⅔"), (0.75, "¾"), (0.875, "⅞")]
    guard let mark = marks.first(where: { abs(rest - $0.0) < 0.0005 }) else { return String(value) }
    return whole > 0 ? "\(whole)\(mark.1)" : mark.1
}

/// The ingredient line's amount and unit, drawn as the mockup's small chips.
private struct IngredientChip: ViewModifier {
    var tone: Tone

    func body(content: Content) -> some View {
        content
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(tone.ink)
            .multilineTextAlignment(.center)
            .fixedSize()
            .frame(minWidth: 22)
            .padding(.horizontal, 8)
            .frame(height: 26)
            .background(tone.soft, in: Capsule())
    }
}

#Preview("Edit") {
    EditRecipeView(recipe: SampleData.recipes[0], session: .preview) { _ in }
}

#Preview("New") {
    EditRecipeView(recipe: nil, session: .preview) { _ in }
}

#Preview("New, from a group") {
    EditRecipeView(recipe: nil, session: .preview, initialSection: .dinner, initialGroups: ["Veggie"]) { _ in }
}
