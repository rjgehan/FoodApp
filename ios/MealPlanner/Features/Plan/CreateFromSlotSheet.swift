import SwiftUI

/**
 Making the recipe you were about to plan without leaving the plan (the mockup's 2.6). The four
 ways in as cards; just the name is the quick one — mid-planning you rarely want to type a whole
 recipe — at the cost of it adding nothing to Groceries until the ingredients go in, which the
 plan then points out. Whichever way, the new recipe goes straight into the slot.

 Type it out, From a link and Paste from an AI are the same pages New recipe uses — Paste reads
 the answer with Apple Intelligence on a phone that has it, and by rule on one that does not.
*/
struct CreateFromSlotSheet: View {
    let store: PlanStore
    let initialName: String
    let meal: MealType
    let day: Date
    var onFill: (Filling) async -> Void

    enum Way: String, CaseIterable, Identifiable, Hashable {
        case name, type, link, paste
        var id: String { rawValue }
    }

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var way: Way = .name
    @State private var going: Way?
    @State private var draft: RecipeDraft?
    @State private var handedLink = ""
    @State private var reading = false
    @State private var busy = false
    @State private var error: String?
    /// The sheet is as tall as what is in it, with the slot still showing behind (the mockup's
    /// 2.6); going on to Type it out, a link or Paste needs the whole screen.
    @State private var height: CGFloat = 560
    @State private var detent: PresentationDetent = .height(560)

    init(store: PlanStore, initialName: String, meal: MealType, day: Date, onFill: @escaping (Filling) async -> Void) {
        self.store = store
        self.initialName = initialName
        self.meal = meal
        self.day = day
        self.onFill = onFill
        _name = State(initialValue: initialName)
    }

    private var slotName: String { "\(day.formatted(.dateTime.weekday(.wide))) \(meal.title.lowercased())" }
    private var section: RecipeSection { PlanText.sectionFor(meal) }
    private var trimmed: String { name.trimmingCharacters(in: .whitespaces) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SheetHeader("New recipe", subtitle: "It goes straight into \(slotName).", onClose: { dismiss() })
                    FieldBox("Name", text: $name, prompt: "Chicken pot pie").autofocused()
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        card(.name, "pencil", .accent, "Just the name", "Fill it in later")
                        card(.type, "list.bullet", .herb, "Type it out", "Ingredients + method")
                        card(.link, "link", .sky, "From a link", "Site, TikTok, YouTube")
                        card(.paste, "doc.on.clipboard", .plum, "Paste from an AI", "We give you the prompt")
                    }
                    if let error {
                        Text(error).font(.footnote).foregroundStyle(Palette.danger)
                    }
                    Button {
                        if way == .name { Task { await saveName() } } else { going = way }
                    } label: {
                        Text(busy ? "Saving…" : way == .name ? "Add to \(slotName)" : "Continue")
                    }
                    .buttonStyle(.primary)
                    .disabled(busy || ((way == .name || way == .type) && trimmed.isEmpty))
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 16)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { measured in
                    height = measured + 12
                    if going == nil { detent = .height(height) }
                }
            }
            .scrollBounceBehavior(.basedOnSize)
            .pageBackground()
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(item: $going) { way in
                Group {
                    switch way {
                    case .type:
                        EditRecipeView(recipe: nil, session: store.session,
                                       draft: RecipeDraft(name: trimmed, description: nil, servings: store.defaultServings, prep: 0, cook: 0,
                                                          instructions: "", ingredients: []),
                                       embedded: true, initialSection: section) { saved in Task { await made(saved) } }
                    case .link:
                        FromALinkPage(session: store.session, link: handedLink, busy: $reading,
                                      onRead: { draft = $0 }, onSaved: { saved in Task { await made(saved) } })
                            .kitchenList()
                    default:
                        PastePage(busy: $reading) { draft = $0 } onLink: { link in
                            handedLink = link
                            going = .link
                        }
                        .kitchenList()
                    }
                }
                .centeredTitle(way == .type ? "Type it out" : way == .link ? "From a link" : "Paste from an AI")
                .navigationDestination(item: $draft) { draft in
                    EditRecipeView(recipe: nil, session: store.session, draft: draft, embedded: true,
                                   initialSection: section) { saved in Task { await made(saved) } }
                }
            }
        }
        .presentationDetents([.height(height), .large], selection: $detent)
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(28)
        .presentationBackground(Palette.bg)
        .onChange(of: going) { detent = going == nil ? .height(height) : .large }
    }

    private func card(_ w: Way, _ symbol: String, _ tone: Tone, _ title: String, _ detail: String) -> some View {
        let on = way == w
        return Button { way = w } label: {
            VStack(alignment: .leading, spacing: 8) {
                Tile(symbol, tone: tone, size: 36)
                Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
                Text(detail).font(.system(size: 12)).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.85)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface()
            .overlay {
                if on {
                    RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.accent, lineWidth: 1.5)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 18))
        }
        .buttonStyle(PressFade())
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }

    private func saveName() async {
        guard let household = store.household else { return }
        busy = true
        defer { busy = false }
        do {
            error = nil
            let saved = try await APIClient.shared.createNamedRecipe(household: household, name: trimmed,
                                                                    section: section, servings: store.defaultServings)
            await made(saved)
        } catch {
            self.error = (error as? APIError)?.status == 409 ? "There is already a recipe called that." : "Could not save that."
        }
    }

    /// However it was made, it goes in the slot — and the fill screen behind closes with it.
    private func made(_ recipe: Recipe) async {
        store.recipeMade(recipe)
        await onFill(.recipe(recipe.id, extras: []))
        dismiss()
    }
}

#Preview("New recipe from a slot") {
    Color.clear.sheet(isPresented: .constant(true)) {
        CreateFromSlotSheet(store: PlanStore(session: .preview, sample: SampleData.plan), initialName: "Chicken pot pie",
                            meal: .dinner, day: Date()) { _ in }
    }
}
