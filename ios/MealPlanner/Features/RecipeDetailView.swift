import PhotosUI
import SwiftUI

/**
 A recipe (the mockup's 3.7, Option 1): the photo hero with its name on it, then Ingredients,
 Method and Photos as tabs that stick under the status bar as you scroll, and Add to plan along
 the bottom between the previous and next recipe. Everything else — organising it, its photos
 and links, sharing, editing, deleting — waits behind the ••• on the photo.
 */
struct RecipeDetailView: View {
    @State var recipe: Recipe
    var session: Session?

    enum Tab: Hashable { case ingredients, method, photos }
    enum Sheet: Identifiable, Hashable {
        case options, plan, organise, media, edit
        var id: Self { self }
    }

    @State private var tab: Tab = .ingredients
    /// How many the amounts are shown for: the recipe's own number until the stepper moves.
    @State private var servings: Int?
    @State private var sheet: Sheet?
    @State private var sharing = false
    @State private var confirmingDelete = false
    /// The catalogue in name order, for previous and next.
    @State private var siblings: [Recipe] = []
    @State private var toast: String?
    @State private var picked: [PhotosPickerItem] = []
    @State private var addingPhotos = false
    /// The hero has scrolled out of sight, so the status bar gets the page behind it.
    @State private var heroGone = false
    @Environment(\.dismiss) private var dismissDetail

    private var mine: Bool { !recipe.shared }

    /// One step per line, the way it was written.
    private var steps: [String] {
        (recipe.instructions ?? "")
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .map { $0.replacingOccurrences(of: #"^(\d+[.)]|[-*•])\s*"#, with: "", options: .regularExpression) }
            .filter { !$0.isEmpty }
    }

    private var pictures: [UUID] {
        var seen = Set<UUID>()
        return ([recipe.coverImageId].compactMap { $0 } + (recipe.photoIds ?? [])).filter { seen.insert($0).inserted }
    }

    private var index: Int? { siblings.firstIndex { $0.id == recipe.id } }
    private var previous: Recipe? { index.flatMap { $0 > 0 ? siblings[$0 - 1] : nil } }
    private var next: Recipe? { index.flatMap { $0 + 1 < siblings.count ? siblings[$0 + 1] : nil } }

    var body: some View {
        GeometryReader { outer in
            let top = outer.safeAreaInsets.top
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                    RecipeHero(recipe: recipe, topInset: top, back: { dismissDetail() }, share: mine ? { sharing = true } : nil,
                               options: { sheet = .options })
                        .padding(.top, -top)
                        .background {
                            GeometryReader { geo in
                                Color.clear.preference(key: HeroBottom.self, value: geo.frame(in: .global).maxY)
                            }
                        }
                    Section {
                        panel.padding(.horizontal, 20).padding(.top, 14).padding(.bottom, 24)
                    } header: {
                        RecipeTabBar(tab: $tab, counts: (recipe.ingredients.count, steps.count, pictures.count))
                    }
                }
            }
            .onPreferenceChange(HeroBottom.self) { bottom in heroGone = bottom < top + 60 }
            .overlay(alignment: .top) {
                // Under the status bar once the photo has gone, so the tabs do not seem to float.
                Palette.bg.frame(height: top).ignoresSafeArea(edges: .top).opacity(heroGone ? 1 : 0)
                    .allowsHitTesting(false)
            }
        }
        .pageBackground()
        .safeAreaInset(edge: .bottom, spacing: 0) { bottomBar }
        .toolbar(.hidden, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        // The bar is hidden here, but its title is what Share's back button says.
        .navigationTitle("Recipe")
        .overlay(alignment: .bottom) {
            if let toast {
                RecipeToast(text: toast).padding(.horizontal, 16).padding(.bottom, 92)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.2), value: toast)
        .kitchenAlert(isPresented: $confirmingDelete) {
            DeleteRecipeCard(recipe: recipe, session: session) { deleted in
                confirmingDelete = false
                if deleted { dismissDetail() }
            }
        }
        .navigationDestination(isPresented: $sharing) {
            RecipeShareSheet(recipe: $recipe)
        }
        .sheet(item: $sheet) { which in
            switch which {
            case .options:
                RecipeOptionsSheet(recipe: recipe, sharedCount: recipe.sharedWith?.count ?? 0) { pick($0) }
            case .plan:
                AddToPlanSheet(recipe: recipe, session: session) { when in say("On the plan for \(when)") }
            case .organise:
                OrganiseSheet(recipe: recipe, session: session) { saved in
                    let moved = recipe.shared && recipe.section == nil
                    recipe = saved
                    say(moved ? "Moved into your recipes" : "Filed")
                }
            case .media:
                PhotosLinksSheet(recipe: recipe, session: session) { recipe = $0 }
            case .edit:
                EditRecipeView(recipe: recipe, session: session, onDeleted: {
                    sheet = nil
                    dismissDetail()
                }) { saved in
                    recipe = saved
                }
            }
        }
        .onChange(of: picked) { _, items in
            guard !items.isEmpty else { return }
            Task { await addPhotos(items) }
        }
        .task { await loadSiblings() }
        #if DEBUG
        // -mp_debug_screen share|recipe-options|recipe-plan|recipe-delete|recipe-method|recipe-edit
        // opens that on this recipe, for screenshot runs.
        .task {
            try? await Task.sleep(for: .milliseconds(600))
            switch UserDefaults.standard.string(forKey: "mp_debug_screen") {
            case "share" where mine: sharing = true
            case "recipe-options": sheet = .options
            case "recipe-plan": sheet = .plan
            case "recipe-delete" where mine: confirmingDelete = true
            case "recipe-method": tab = .method
            case "recipe-edit" where mine: sheet = .edit
            default: break
            }
        }
        #endif
    }

    // MARK: Tabs

    @ViewBuilder private var panel: some View {
        switch tab {
        case .ingredients: ingredientsPanel
        case .method: methodPanel
        case .photos: photosPanel
        }
    }

    private var ingredientsPanel: some View {
        let shown = servings ?? recipe.servings
        let scale = recipe.servings > 0 ? Double(shown) / Double(recipe.servings) : 1
        return VStack(alignment: .leading, spacing: 14) {
            // Somebody else's, and not in a drawer of yours yet: the way to keep it is right
            // here, as well as behind •••.
            // Stacked, so the action is never cut short; the hero's pill already says who shared it.
            if recipe.shared && recipe.section == nil {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Only \(recipe.ownerName ?? "the household that shared it") can change it.")
                        .font(.system(size: 13)).foregroundStyle(Palette.plum)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button { sheet = .organise } label: { Label("Move into my recipes", systemImage: "arrow.right") }
                        .buttonStyle(.kitchen(.secondary, size: .small, fill: true))
                }
                .padding(12)
                .background(Palette.plumSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            if let description = recipe.description, !description.isEmpty {
                Text(description).font(.system(size: 15)).foregroundStyle(Palette.muted)
            }
            HStack(alignment: .top, spacing: 8) {
                let links = recipe.allLinks.filter { $0.destination != nil }
                if links.isEmpty {
                    if mine {
                        Button { sheet = .media } label: { Label("Add link", systemImage: "plus") }
                            .buttonStyle(.kitchen(.ghost, size: .small, fill: false))
                            .padding(.leading, -12)
                    }
                } else {
                    // Wrapped, as on the web: a chip that does not fit goes onto the next line
                    // rather than ending cut through its border against the stepper.
                    ChipFlow {
                        ForEach(Array(links.enumerated()), id: \.offset) { _, link in
                            Link(destination: link.destination!) {
                                Label(chipName(link), systemImage: link.isVideo ? "play" : "link")
                                    .lineLimit(1)
                            }
                            .buttonStyle(.kitchen(.secondary, size: .small, fill: false))
                            .accessibilityLabel(link.name)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                Spacer(minLength: 0)
                ServingsStepper(value: Binding(get: { shown }, set: { servings = $0 }))
            }
            if recipe.ingredients.isEmpty {
                empty("No ingredients yet — until they're in, planning this adds nothing to Groceries.")
            } else {
                VStack(spacing: 0) {
                    ForEach(recipe.ingredients) { ingredient in ingredientRow(ingredient, scale: scale) }
                }
            }
        }
    }

    private func ingredientRow(_ item: RecipeIngredient, scale: Double) -> some View {
        // "2 packs", as the grocery list says it.
        let amount = AmountColumn(quantity: item.quantity.map { fraction($0 * scale) }, unit: CountUnits.unit(item.unit, for: item.quantity.map { $0 * scale }))
        var name = Text(item.ingredientName)
        if let notes = item.notes, !notes.isEmpty { name = name + Text(", \(notes)").foregroundColor(Palette.muted) }
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            amount
            name.font(.system(size: 15)).frame(maxWidth: .infinity, alignment: .leading)
            if item.optional { Pill("Optional", tone: .mustard) }
        }
        .foregroundStyle(Palette.text)
        .padding(.vertical, 9)
        .overlay(alignment: .bottom) { Rectangle().fill(Palette.border).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }

    private var methodPanel: some View {
        VStack(alignment: .leading, spacing: 16) {
            if steps.isEmpty {
                empty(mine ? "No method written down yet. Add the steps in Edit." : "No method written down yet.")
            }
            ForEach(Array(steps.enumerated()), id: \.offset) { i, step in
                HStack(alignment: .top, spacing: 12) {
                    StepNumber(number: i + 1)
                    StepText(step: step, names: recipe.ingredients.map(\.ingredientName))
                        .font(.system(size: 16))
                        .foregroundStyle(Palette.text)
                        .lineSpacing(3)
                        .padding(.top, 1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private var photosPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            if pictures.isEmpty {
                empty("No photos yet.")
            } else {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(pictures, id: \.self) { id in
                        Color.clear.aspectRatio(1, contentMode: .fit)
                            .overlay {
                                AsyncImage(url: APIClient.shared.imageURL(id)) { image in
                                    image.resizable().scaledToFill()
                                } placeholder: { Palette.surface2 }
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                }
            }
            if mine {
                PhotosPicker(selection: $picked, maxSelectionCount: 10, matching: .images, photoLibrary: .shared()) {
                    Label(addingPhotos ? "Adding…" : "Add photos", systemImage: "photo.badge.plus")
                }
                .buttonStyle(.secondary)
                .disabled(addingPhotos)
            }
        }
    }

    private func empty(_ text: String) -> some View {
        Text(text).font(.system(size: 15)).foregroundStyle(Palette.muted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 24)
    }

    /// "TikTok" with a play mark, "Website"-style names for pages: short, as on the photo's buttons.
    private func chipName(_ link: SourceLink) -> String {
        if let label = link.label?.trimmingCharacters(in: .whitespaces), !label.isEmpty { return label }
        return link.site ?? link.url
    }

    // MARK: Bottom bar

    private var bottomBar: some View {
        HStack(spacing: 10) {
            stepButton("chevron.left", "Previous recipe", previous)
            // The one filled button on the screen: the step the whole app is built around.
            Button { sheet = .plan } label: { Label("Add to plan", systemImage: "calendar") }
                .buttonStyle(.primary)
                .disabled(session?.household == nil)
            stepButton("chevron.right", "Next recipe", next)
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background(Palette.bg)
        .overlay(alignment: .top) { Rectangle().fill(Palette.border).frame(height: 1) }
    }

    private func stepButton(_ symbol: String, _ label: String, _ target: Recipe?) -> some View {
        Button {
            guard let target else { return }
            // Flipped in place: Back still goes where the recipe was opened from.
            recipe = target
            tab = .ingredients
            servings = nil
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(Palette.text)
                .frame(width: 52, height: 52)
                .background(Palette.surface, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
        }
        .buttonStyle(PressFade())
        .disabled(target == nil)
        .opacity(target == nil ? 0.4 : 1)
        .accessibilityLabel(label)
    }

    // MARK: Behaviour

    private func pick(_ option: RecipeOption) {
        switch option {
        case .organise, .move: sheet = .organise
        case .media: sheet = .media
        case .share: sharing = true
        case .edit: sheet = .edit
        case .delete: confirmingDelete = true
        }
    }

    private func say(_ text: String) {
        toast = text
        Task {
            try? await Task.sleep(for: .seconds(3))
            if toast == text { toast = nil }
        }
    }

    private func loadSiblings() async {
        guard let household = session?.household?.id,
              let all = try? await APIClient.shared.recipes(household: household) else { return }
        siblings = all.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private func addPhotos(_ items: [PhotosPickerItem]) async {
        guard let household = session?.household?.id else { return }
        addingPhotos = true
        defer {
            addingPhotos = false
            picked = []
        }
        var ids = recipe.photoIds ?? []
        for item in items {
            guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data),
                  let jpeg = await Task.detached(priority: .userInitiated, operation: { image.jpegForUpload() }).value,
                  let id = try? await APIClient.shared.uploadImage(household: household, jpeg: jpeg) else { continue }
            ids.append(id)
        }
        if let saved = try? await APIClient.shared.setImages(recipeId: recipe.id, coverImageId: recipe.coverImageId ?? ids.first,
                                                            photoIds: ids) {
            recipe = saved
        }
    }
}

private struct HeroBottom: PreferenceKey {
    static let defaultValue: CGFloat = .infinity
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

#Preview("Recipe") {
    NavigationStack { RecipeDetailView(recipe: SampleData.recipes[0], session: .preview) }
}

#Preview("Recipe — dark") {
    NavigationStack { RecipeDetailView(recipe: SampleData.recipes[1], session: .preview) }
        .preferredColorScheme(.dark)
}

/**
 An ingredient's amount in the recipe page's bold left column ("1 lb", "2 tbsp"). A long unit
 such as "tablespoons" is wider than the column: rather than be broken mid-word ("tablespoo" /
 "n"), it goes under the number and shrinks to fit on its one line.
 */
struct AmountColumn: View {
    var quantity: String?
    var unit: String?

    var body: some View {
        let parts = [quantity, unit].compactMap { $0 }.filter { !$0.isEmpty }
        ViewThatFits(in: .horizontal) {
            Text(parts.joined(separator: " ")).lineLimit(1).fixedSize()
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                    Text(part).lineLimit(1).minimumScaleFactor(0.6)
                }
            }
        }
        .font(.system(size: 15, weight: .semibold)).monospacedDigit()
        .frame(width: 74, alignment: .leading)
    }
}
