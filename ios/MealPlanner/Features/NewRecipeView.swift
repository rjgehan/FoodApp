import SwiftUI
#if canImport(FoundationModels)
import FoundationModels
#endif

/// A recipe nobody has saved yet: fields read off a link or a paste, to start the editor from.
struct RecipeDraft: Hashable {
    struct Ingredient: Hashable {
        var quantity: Double?
        var unit: String
        var name: String
        var notes: String? = nil
        var optional = false

        init(quantity: Double?, unit: String, name: String, notes: String? = nil, optional: Bool = false) {
            self.quantity = quantity
            self.unit = unit
            self.name = name
            self.notes = notes
            self.optional = optional
        }

        /// A line as a person wrote it — "1/3 cup parmesan, grated" — split the way the rest of
        /// the phone splits one.
        init(line: String) {
            let amount = Amount(line)
            self.init(
                quantity: amount.quantity,
                unit: amount.unit ?? "",
                name: amount.name.isEmpty ? line.trimmingCharacters(in: .whitespaces) : amount.name,
                notes: amount.notes,
                optional: amount.optional
            )
        }
    }

    var name: String
    var description: String?
    var servings: Int
    var prep: Int
    var cook: Int
    var instructions: String
    var ingredients: [Ingredient]
    var links: [SourceLink] = []
    /// Where it came from and what is worth checking, said above the editor.
    var note: String? = nil
    /// The picture the link came with, already saved on the server.
    var coverImageId: UUID? = nil
    /// The saved link it is being made from, which saving it takes off Saved links.
    var savedLinkId: UUID? = nil
}

extension RecipeDraft {
    /// What the server read off a link. The link goes in Links — the server sends it back as the
    /// first one; a server from before the list did not, and the link typed is the same page.
    init(imported: ImportedRecipe, link: String) {
        let typed = link.trimmingCharacters(in: .whitespacesAndNewlines)
        self.init(
            name: imported.name,
            description: imported.description,
            servings: imported.servings > 0 ? imported.servings : 4,
            prep: imported.prepTimeMinutes ?? 0,
            cook: imported.cookTimeMinutes ?? 0,
            instructions: imported.instructions ?? "",
            ingredients: imported.ingredients.map {
                Ingredient(quantity: $0.quantity, unit: $0.unit ?? "", name: $0.ingredientName)
            },
            links: imported.links ?? (typed.lowercased().hasPrefix("http") ? [SourceLink(url: typed, label: nil)] : []),
            note: imported.methodWasSpoken
                ? "The steps were pieced together from what’s said in the video. Give them a read, then save."
                : "Read from the page itself. Check the amounts, change anything, then save.",
            coverImageId: imported.coverImageId
        )
    }
}

/**
 New recipe (the mockup's 3.13): three ways in, as cards — type it out, read it off a link, or
 paste one from an AI — the same as the web's. Every way ends in the ordinary editor, "Check
 recipe", looked at before anything is saved.

 Started from inside a drawer or a group, every way starts filed there — the drawer picked and
 the group ticked, both still yours to change — and the page says where.
*/
struct NewRecipeView: View {
    enum Mode: String, CaseIterable, Identifiable {
        case type, link, paste
        var id: String { rawValue }
        var title: String {
            switch self {
            case .type: "New recipe"
            case .link: "From a link"
            case .paste: "Paste from an AI"
            }
        }
    }

    var session: Session?
    var initialSection: RecipeSection? = nil
    var initialGroups: [String] = []
    var onSaved: (Recipe) -> Void

    @Environment(\.dismiss) private var dismiss
    /// The way in on screen; nil for the choice of ways.
    @State private var mode: Mode?
    /// Every way opened so far stays alive behind the others, so going back to the choices and
    /// into another way does not throw away a half-typed recipe, its cover photo, or a paste.
    @State private var opened: [Mode] = []
    /// A link or a paste that has been read, open in the editor for checking.
    @State private var draft: RecipeDraft?
    /// A link pasted into Paste, carried over to From a link.
    @State private var handedLink = ""
    /// A link or a paste being read. The way in stays put until it is done.
    @State private var reading = false

    init(session: Session?, initialSection: RecipeSection? = nil, initialGroups: [String] = [],
         onSaved: @escaping (Recipe) -> Void) {
        self.session = session
        self.initialSection = initialSection
        self.initialGroups = initialGroups
        self.onSaved = onSaved
        #if DEBUG
        // -mp_debug_new type|link|paste opens on that way in, for screenshot runs.
        let start = UserDefaults.standard.string(forKey: "mp_debug_new").flatMap(Mode.init)
        _mode = State(initialValue: start)
        _opened = State(initialValue: start.map { [$0] } ?? [])
        #endif
    }

    var body: some View {
        NavigationStack {
            ZStack {
                chooser.opacity(mode == nil ? 1 : 0).allowsHitTesting(mode == nil)
                ForEach(opened) { way in
                    shown(way) { page(way) }
                }
            }
            .pageBackground()
            .centeredTitle(mode?.title ?? "New recipe")
            .toolbar {
                if mode == nil {
                    BarTextButton("Cancel", placement: .topBarLeading) { dismiss() }
                } else {
                    BarTextButton("New", placement: .topBarLeading, back: true, disabled: reading) { mode = nil }
                }
            }
            .navigationDestination(item: $draft) { draft in
                EditRecipeView(
                    recipe: nil,
                    session: session,
                    draft: draft,
                    embedded: true,
                    initialSection: initialSection,
                    initialGroups: initialGroups
                ) { saved in finish(saved) }
                // "Cancel" as in the mockup's 3.16 and on the web: back to the link or the paste
                // it was read from, to try again. Swiping back still works.
                .navigationBarBackButtonHidden(true)
                .toolbar { BarTextButton("Cancel", placement: .topBarLeading) { self.draft = nil } }
            }
        }
    }

    /// The three ways in as cards, and where the recipe will be filed.
    private var chooser: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let initialSection {
                    HStack(spacing: 6) {
                        Image(systemName: "folder").font(.system(size: 13))
                        Text("Will be filed in ") + Text(([initialSection.title] + initialGroups).joined(separator: " › "))
                            .fontWeight(.semibold).foregroundColor(Palette.text)
                    }
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.muted)
                }
                card(.type, "pencil", .accent, "Type it out",
                     "Ingredients and method, line by line. \"2 cups flour\" splits itself.")
                card(.link, "link", .sky, "From a link",
                     "Recipe websites, TikTok, YouTube or Instagram. Reads the site's own recipe data or the video caption. No AI.")
                card(.paste, "sparkles", .plum, "Paste from an AI",
                     "We give you a ready-made question for any chatbot. Paste its answer back.")
                HStack(spacing: 12) {
                    Tile("square.and.arrow.up", tone: .herb, size: 36)
                    Text("You can also share a page or TikTok straight into Meal Planner from any app.")
                        .font(.system(size: 13)).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(16)
                .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 24)
        }
    }

    private func card(_ way: Mode, _ symbol: String, _ tone: Tone, _ title: String, _ detail: String) -> some View {
        Button { open(way) } label: {
            HStack(alignment: .top, spacing: 14) {
                Tile(symbol, tone: tone, size: 48)
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).titleFont(20).foregroundStyle(Palette.text)
                    Text(detail).font(.system(size: 14)).foregroundStyle(Palette.muted)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Palette.faint)
                    .padding(.top, 14)
            }
            .padding(18)
            .cardSurface()
            .multilineTextAlignment(.leading)
        }
        .buttonStyle(PressFade())
    }

    @ViewBuilder private func page(_ way: Mode) -> some View {
        switch way {
        case .type:
            EditRecipeView(
                recipe: nil,
                session: session,
                embedded: true,
                showsSave: mode == .type,
                initialSection: initialSection,
                initialGroups: initialGroups
            ) { saved in finish(saved) }
        case .link:
            FromALinkPage(session: session, link: handedLink, active: mode == .link, busy: $reading,
                          onRead: { draft = $0 }, onSaved: finish, onTypeInstead: { open(.type) })
        case .paste:
            PastePage(busy: $reading) { draft = $0 } onLink: { link in
                handedLink = link
                open(.link)
            }
        }
    }

    private func open(_ way: Mode) {
        if !opened.contains(way) { opened.append(way) }
        mode = way
    }

    private func shown(_ which: Mode, @ViewBuilder _ content: () -> some View) -> some View {
        let on = mode == which
        return content()
            .opacity(on ? 1 : 0)
            .allowsHitTesting(on)
            .accessibilityHidden(!on)
    }

    private func finish(_ saved: Recipe) {
        onSaved(saved)
        dismiss()
    }
}

// MARK: - From a link

/**
 A link in, a recipe out (the mockup's 3.14). The server does the reading, the same one the web
 asks: a website's own recipe data, which is exact, or a TikTok's or a Reel's caption (and,
 failing that, what is said in it). What comes back is a draft — its picture, its name, how much
 was found — and Review draft opens it in the editor. Nothing is saved until it has been looked at.

 A link that cannot be read is still worth keeping, so the ways on — keep it as a saved link, or
 type it out — are right under the reason.
*/
struct FromALinkPage: View {
    var session: Session?
    /// A link handed over from Paste, to fill the box with.
    var handed: String
    /// On screen, rather than kept alive behind another way in — the box is focused then.
    var active: Bool
    @Binding var busy: Bool
    var onRead: (RecipeDraft) -> Void
    /// A recipe from one of this app's own public links, already saved as a copy.
    var onSaved: ((Recipe) -> Void)? = nil
    /// "Type it out" under a link that cannot be read; not offered without it.
    var onTypeInstead: (() -> Void)? = nil

    @State private var link: String
    @State private var readingSince: Date?
    @State private var error: String?
    /// What the server read, shown as a draft before the editor.
    @State private var draft: RecipeDraft?
    @State private var spoken = false
    /// The link the draft was read from: editing the box away from it drops the draft.
    @State private var draftLink: String?
    /// Keeping it in Saved links instead of reading it.
    @State private var keeping = false
    @State private var keepError: String?
    @State private var kept: SavedLink?
    @FocusState private var focused: Bool

    init(session: Session?, link: String = "", active: Bool = true, busy: Binding<Bool> = .constant(false),
         onRead: @escaping (RecipeDraft) -> Void, onSaved: ((Recipe) -> Void)? = nil,
         onTypeInstead: (() -> Void)? = nil) {
        self.session = session
        self.handed = link
        self.active = active
        _busy = busy
        self.onRead = onRead
        self.onSaved = onSaved
        self.onTypeInstead = onTypeInstead
        _link = State(initialValue: link)
    }

    private var canRead: Bool {
        readingSince == nil && !link.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var isVideo: Bool { SourceLink(url: link, label: nil).isVideo }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 10) {
                    Image(systemName: "link").font(.system(size: 17)).foregroundStyle(Palette.muted).frame(width: 22)
                    TextField("", text: $link, prompt: Text("Paste a link — https://…").foregroundStyle(Palette.faint))
                        .font(.system(size: 16))
                        .foregroundStyle(Palette.text)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.go)
                        .focused($focused)
                        .onSubmit { if canRead { Task { await read() } } }
                        .accessibilityLabel("A link to a recipe")
                    if draft != nil {
                        Image(systemName: "checkmark").font(.system(size: 15, weight: .bold)).foregroundStyle(Palette.herb)
                            .accessibilityLabel("Read")
                    }
                }
                .padding(.horizontal, 14)
                .frame(minHeight: 52)
                .fieldSurface(focused: focused)
                .contentShape(Rectangle())
                .onTapGesture { focused = true }

                if let draft {
                    draftCard(draft)
                    Button { onRead(draft) } label: { Label("Review draft", systemImage: "arrow.right") }
                        .buttonStyle(.primary)
                    Button(keeping ? "Saving…" : "Just save the link") { Task { await keep() } }
                        .buttonStyle(.ghost)
                        .disabled(keeping)
                } else if let kept {
                    keptCard(kept)
                } else {
                    // What it can read is the one thing to know before pasting.
                    Label("Works with TikTok, Instagram and recipe websites.", systemImage: "checkmark")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Palette.text)
                        .labelStyle(TightIconLabel(tint: Palette.herb))
                    if let error { cannotRead(error) }
                    if let keepError {
                        Text(keepError).font(.system(size: 14)).foregroundStyle(Palette.danger)
                    }
                    if let since = readingSince {
                        // A video can take a while — its caption, then perhaps what is said in
                        // it — so the wait counts real seconds rather than looking stuck.
                        TimelineView(.periodic(from: since, by: 1)) { context in
                            HStack(spacing: 10) {
                                ProgressView()
                                Text("Reading the link…").font(.system(size: 15, weight: .medium))
                                Spacer()
                                Text("\(Int(context.date.timeIntervalSince(since)))s").monospacedDigit()
                                    .foregroundStyle(Palette.muted)
                            }
                        }
                    } else {
                        Button("Get the recipe") { Task { await read() } }
                            .buttonStyle(error == nil ? .primary : .secondary)
                            .disabled(!canRead || keeping)
                        if error == nil {
                            // Quietly, always: for a link you only want to keep.
                            Button(keeping ? "Saving…" : "Just save the link") { Task { await keep() } }
                                .buttonStyle(.ghost)
                                .disabled(!canRead || keeping)
                        }
                    }
                    Text("A website’s own recipe comes through exactly as they wrote it. A video’s is read from its caption or what’s said in it, so give it a look. Either way it opens in the editor before anything is saved. No AI.")
                        .font(.system(size: 13)).foregroundStyle(Palette.muted)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: handed) { _, next in
            link = next
            error = nil
            kept = nil
            draft = nil
        }
        .onChange(of: link) { _, _ in
            keepError = nil
            if kept != nil { kept = nil }
            if readingSince == nil, link != draftLink { draft = nil }
        }
        .onChange(of: active) { _, now in
            if now && link.isEmpty { focused = true }
            if !now { focused = false }
        }
        .onChange(of: readingSince) { _, since in busy = since != nil }
        .onAppear {
            if active && link.isEmpty { focused = true }
            #if DEBUG
            // -mp_debug_link "<url>" fills the box and reads it, for screenshot runs; with
            // -mp_debug_draft 1 it shows a sample draft instead, as though the server had read it.
            if link.isEmpty, let seeded = UserDefaults.standard.string(forKey: "mp_debug_link") {
                link = seeded
                focused = false
                if UserDefaults.standard.bool(forKey: "mp_debug_draft") {
                    draftLink = seeded
                    draft = RecipeDraft(name: "Creamy tuscan gnocchi", description: nil, servings: 4, prep: 10, cook: 20,
                                        instructions: "Brown the gnocchi.\nMake the sauce.\nStir in the spinach.",
                                        ingredients: [.init(line: "500 g potato gnocchi"), .init(line: "2 tbsp butter"),
                                                      .init(line: "1 cup cream"), .init(line: "1 handful basil"),
                                                      .init(line: "2 cups spinach")],
                                        links: [SourceLink(url: seeded, label: nil)])
                } else {
                    Task { await read() }
                }
            }
            #endif
        }
    }

    /// The draft before the editor: its picture, where it was read from, and how much was found.
    private func draftCard(_ draft: RecipeDraft) -> some View {
        let steps = draft.instructions.split(whereSeparator: \.isNewline).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.count
        return VStack(alignment: .leading, spacing: 0) {
            Group {
                if let id = draft.coverImageId, let url = APIClient.shared.imageURL(id) {
                    Color.clear.overlay {
                        AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Palette.surface2 }
                    }
                } else {
                    RecipePhotoPlaceholder(hue: .of(draft.name), systemImage: isVideo ? "play" : "fork.knife", radius: 0)
                }
            }
            .frame(height: 170)
            .frame(maxWidth: .infinity)
            .clipped()
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Pill(spoken ? "Read from what’s said" : isVideo ? "Read from video caption" : "Read from the page",
                         tone: .herb, systemImage: "checkmark")
                    Pill("Draft", tone: .mustard)
                }
                Text(draft.name.isEmpty ? "Untitled recipe" : draft.name).titleFont(22).foregroundStyle(Palette.text)
                Text("Found \(count(draft.ingredients.count, "ingredient")) and \(count(steps, "step")). You'll check them on the next page.")
                    .font(.system(size: 13)).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 16)
        }
        .cardSurface()
    }

    private func count(_ n: Int, _ noun: String) -> String { "\(n) \(noun)\(n == 1 ? "" : "s")" }

    /// The reason a link could not be read, and the ways on from there.
    private func cannotRead(_ reason: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.circle").foregroundStyle(Palette.mustard)
                Text("This link can’t be read").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
            }
            Text(reason).font(.system(size: 13)).foregroundStyle(Palette.muted)
            Text("Keep it in Saved links instead, with its name and picture, and make it a recipe whenever you like.")
                .font(.system(size: 13)).foregroundStyle(Palette.muted)
            HStack(spacing: 8) {
                Button { Task { await keep() } } label: { Label(keeping ? "Saving…" : "Keep as saved link", systemImage: "bookmark") }
                    .buttonStyle(.kitchen(.secondary, size: .small))
                    .disabled(keeping)
                if let onTypeInstead {
                    Button { onTypeInstead() } label: { Label("Type it out", systemImage: "pencil") }
                        .buttonStyle(.kitchen(.secondary, size: .small))
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private func keptCard(_ kept: SavedLink) -> some View {
        HStack(spacing: 12) {
            PlannedLinkPicture(imageId: kept.coverImageId)
            VStack(alignment: .leading, spacing: 2) {
                Label(kept.alreadySaved == true ? "Already in Saved links" : "Saved to Saved links", systemImage: "checkmark.circle.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Palette.herb)
                Text(kept.name).lineLimit(2).foregroundStyle(Palette.text)
                Text(kept.sourceLabel).font(.system(size: 13)).foregroundStyle(Palette.muted)
                Text("Find it under Recipes › Saved links.").font(.system(size: 13)).foregroundStyle(Palette.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(16)
        .cardSurface()
    }

    /// Keeps the link in Saved links. The server reads the page for its name and picture, and
    /// never refuses over them.
    private func keep() async {
        guard let household = session?.household?.id else {
            keepError = "No household to save it to."
            return
        }
        focused = false
        keeping = true
        keepError = nil
        defer { keeping = false }
        do {
            // From a draft, the name and picture already read go with it, so the page is not
            // fetched a second time.
            kept = try await APIClient.shared.saveLink(
                household: household, url: link.trimmingCharacters(in: .whitespacesAndNewlines),
                name: draft?.name, coverImageId: draft?.coverImageId)
            draft = nil
            error = nil
        } catch {
            keepError = error.localizedDescription
        }
    }

    private func read() async {
        guard let household = session?.household?.id else {
            error = "No household to read it into."
            return
        }
        focused = false
        error = nil
        readingSince = Date()
        defer { readingSince = nil }
        do {
            // As typed: the server finds the link in a pasted share-sheet sentence and puts
            // https:// on "tiktok.com/…", the same for the phone and the web.
            let typed = link.trimmingCharacters(in: .whitespacesAndNewlines)
            // Somebody's Meal Planner link is the web app's page, which the importer would find
            // empty: it is saved as a copy, pictures and all, as the web page's Save does.
            if let onSaved, let token = SharedRecipeLink.token(in: typed) {
                onSaved(try await SharedRecipeLink.save(token: token, household: household))
                return
            }
            let imported = try await APIClient.shared.importRecipe(household: household, url: typed)
            // Shown as a draft first; Review draft opens it in the editor.
            spoken = imported.methodWasSpoken
            draftLink = link
            draft = RecipeDraft(imported: imported, link: typed)
        } catch {
            // The server says why in a sentence — a private post, a page with no recipe on it.
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Paste

/**
 A recipe pasted in. With Apple Intelligence on the phone it is read by the on-device model,
 which copes with a recipe however it is written — a whole web page, a message, notes. Without
 it, it is read by the same rules as the web, which need the layout the "ask an AI" question
 asks for, and the screen says so before the paste rather than after it fails.
*/
struct PastePage: View {
    @Binding var busy: Bool
    var onRead: (RecipeDraft) -> Void
    /// A paste that was only a link, for From a link to read.
    var onLink: (String) -> Void

    @State private var text = ""
    @State private var dish = ""
    @State private var servings = 4
    @State private var copied = false
    @State private var reading = false
    @State private var error: String?
    @FocusState private var typing: Bool

    /// The model's context is a few thousand words; a longer paste is cut here, and said so,
    /// rather than failing with a message about tokens.
    private static let limit = 5000

    init(busy: Binding<Bool> = .constant(false), onRead: @escaping (RecipeDraft) -> Void,
         onLink: @escaping (String) -> Void) {
        _busy = busy
        self.onRead = onRead
        self.onLink = onLink
    }

    /// Whether Apple Intelligence can read the paste on this phone right now.
    private var onDevice: Bool {
        #if DEBUG
        // -mp_debug_rules 1 shows the rules-only screen on a phone that has the model.
        if UserDefaults.standard.bool(forKey: "mp_debug_rules") { return false }
        #endif
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) { return OnDeviceRecipe.isReady }
        #endif
        return false
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                step(1, "Copy this question") {
                    HStack(spacing: 8) {
                        TextField("", text: $dish, prompt: Text("Dish (optional)").foregroundStyle(Palette.faint))
                            .font(.system(size: 15))
                            .padding(.horizontal, 12)
                            .frame(height: 40)
                            .fieldSurface()
                            .accessibilityLabel("What do you want to make?")
                        ServingsStepper(value: $servings, label: true)
                    }
                    // A glimpse of the question, run together; Copy takes it whole.
                    Text(RecipeText.question(dish: dish, servings: servings)
                        .replacingOccurrences(of: #"\s*\n+\s*"#, with: " ", options: .regularExpression))
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundStyle(Palette.muted)
                        .lineLimit(5)
                        .lineSpacing(3)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    Button {
                        UIPasteboard.general.string = RecipeText.question(dish: dish, servings: servings)
                        copied = true
                        Task {
                            try? await Task.sleep(for: .seconds(2))
                            copied = false
                        }
                    } label: {
                        Label(copied ? "Copied" : "Copy question", systemImage: copied ? "checkmark" : "doc.on.doc")
                    }
                    .buttonStyle(.kitchen(.soft, size: .small))
                }

                step(2, "Ask an AI — any chatbot you use") { EmptyView() }

                step(3, onDevice ? "Paste the answer, or any recipe" : "Paste the answer") {
                    TextEditor(text: $text)
                        .font(.system(size: 15))
                        .scrollContentBackground(.hidden)
                        .focused($typing)
                        .frame(minHeight: 150)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .overlay(alignment: .topLeading) {
                            if text.isEmpty {
                                Text(onDevice ? "Paste a recipe here" : "Paste the AI’s answer here")
                                    .foregroundStyle(Palette.faint)
                                    .padding(.top, 16)
                                    .padding(.leading, 15)
                                    .allowsHitTesting(false)
                            }
                        }
                        .fieldSurface(focused: typing, radius: 18)
                        .accessibilityLabel("The recipe to read")
                    if onDevice {
                        Text("Apple Intelligence reads it on this phone, so paste it however it’s written — a whole recipe page, a message, your own notes. Nothing leaves the phone.")
                            .font(.system(size: 13)).foregroundStyle(Palette.muted)
                    } else {
                        FormatWarning()
                    }
                }

                if let error {
                    Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
                }
                Button {
                    Task { await read() }
                } label: {
                    if reading { ProgressView().tint(Palette.onAccent) } else { Label("Read into form", systemImage: "sparkles") }
                }
                .buttonStyle(.primary)
                .disabled(reading || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Text("You’ll see it in the editor before anything is saved.")
                    .font(.system(size: 13)).foregroundStyle(Palette.muted)
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: reading) { _, now in busy = now }
        #if DEBUG
        // -mp_debug_paste "<text>" fills the box, and -mp_debug_autoparse 1 reads it, so a
        // screenshot run can test a paste without a keyboard.
        .onAppear {
            guard text.isEmpty, let seeded = UserDefaults.standard.string(forKey: "mp_debug_paste") else { return }
            text = seeded
            if UserDefaults.standard.bool(forKey: "mp_debug_autoparse") { Task { await read() } }
        }
        #endif
    }

    /// One of the three steps: its number, what to do, and whatever it needs underneath.
    private func step(_ n: Int, _ title: String, @ViewBuilder content: () -> some View) -> some View {
        HStack(alignment: .top, spacing: 12) {
            StepNumber(number: n)
            VStack(alignment: .leading, spacing: 8) {
                Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.text)
                    .padding(.top, 2)
                content()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func read() async {
        error = nil
        let input = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { return }

        // A link on its own is not a recipe to read, but it is one to fetch.
        if !input.contains(where: \.isWhitespace), input.lowercased().hasPrefix("http") {
            onLink(input)
            return
        }

        if onDevice {
            await readOnDevice(input)
        } else {
            readByRules(input)
        }
    }

    private func readByRules(_ input: String) {
        do {
            onRead(byRules(try RecipeText.parse(input)))
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// An answer to the question, filed at the serving count it was asked for — the same as the
    /// web, and whatever the reply itself claims.
    private func byRules(_ draft: RecipeDraft) -> RecipeDraft {
        var draft = draft
        draft.servings = servings
        draft.note = "Read from the pasted answer. Check the amounts, change anything, then save."
        return draft
    }

    private func readOnDevice(_ input: String) async {
        #if canImport(FoundationModels)
        guard #available(iOS 26.0, *) else { return readByRules(input) }
        // An answer to the question reads exactly by rule, amounts split on its "|" and its
        // description kept; the model is for the pastes the rules cannot read.
        if let answer = RecipeText.answer(input) { return onRead(byRules(answer)) }
        reading = true
        defer { reading = false }
        let cut = input.count > Self.limit
        do {
            let parsed = try await OnDeviceRecipe.read(String(input.prefix(Self.limit)))
            guard !parsed.ingredientLines.isEmpty else {
                // A recipe with an Ingredients line reads by rule when the model found nothing.
                if let draft = try? RecipeText.parse(input) { return onRead(byRules(draft)) }
                error = "No recipe found in that text — nothing was invented to fill the gap."
                return
            }
            onRead(noted(RecipeDraft(parsed: parsed), cut: cut))
        } catch {
            // The model can still say no — the guardrails, or weights not downloaded yet. An
            // answer in the question's layout does not need it.
            if let draft = try? RecipeText.parse(input) { return onRead(byRules(draft)) }
            self.error = "Apple Intelligence couldn’t read that. \(SharedRecipeView.explain(error))"
        }
        #else
        readByRules(input)
        #endif
    }

    private func noted(_ draft: RecipeDraft, cut: Bool) -> RecipeDraft {
        var draft = draft
        draft.note = "Read by Apple Intelligence on this phone. Check the amounts, change anything, then save."
            + (cut ? " It was a long paste, so only the first \(Self.limit) characters were read." : "")
        return draft
    }
}

#if canImport(FoundationModels)
extension RecipeDraft {
    /// What the on-device model read. It copies ingredient lines rather than splitting them,
    /// and RecipeText and Amount do the arithmetic — see ParsedRecipe.
    @available(iOS 26.0, *)
    init(parsed: ParsedRecipe) {
        self.init(
            name: parsed.name,
            description: nil,
            servings: parsed.servings > 0 ? parsed.servings : 4,
            prep: max(parsed.prepMinutes, 0),
            cook: max(parsed.cookMinutes, 0),
            instructions: parsed.steps.joined(separator: "\n"),
            // Through the same reader as a paste, so a line copied as "2 | cup | flour" splits.
            ingredients: parsed.ingredientLines.map(RecipeText.ingredient).filter { !$0.name.isEmpty }
        )
    }
}
#endif

/**
 What the rules really need, said before the paste rather than after it fails: a name at the top,
 an "Ingredients" line with one ingredient per line under it, then an "Instructions" (or Method,
 Steps, Directions) line with the steps. Bullets, numbering and bold are fine. The web says the
 same beside its box.
*/
private struct FormatWarning: View {
    var body: some View {
        NoteBox(text: Text("You can’t paste just anything here. ").bold()
                + Text("It reads a recipe laid out the way the question asks: the name at the top, a line saying “Ingredients” with one per line under it, then “Instructions” with the steps. For a recipe website, use From a link."),
                tone: .mustard, systemImage: "exclamationmark.circle")
            .accessibilityElement(children: .combine)
    }
}

/// An icon in its own colour beside the title, 6pt apart.
private struct TightIconLabel: LabelStyle {
    var tint: Color

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.icon.foregroundStyle(tint).font(.system(size: 13, weight: .bold))
            configuration.title
        }
    }
}

#Preview("New recipe") {
    NewRecipeView(session: .preview) { _ in }
}

#Preview("From a link") {
    NavigationStack { FromALinkPage(session: .preview) { _ in } }
}

#Preview("Paste") {
    NavigationStack { PastePage { _ in } onLink: { _ in } }
}
