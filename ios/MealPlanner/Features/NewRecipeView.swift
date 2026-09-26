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
                : "Read from the page itself. Check the amounts, change anything, then save."
        )
    }
}

/**
 Three ways in, the same as the web's New recipe: type it out, read it off a link, or paste one.
 Every way ends in the ordinary editor, checked before anything is saved.

 Started from inside a drawer or a group, every way starts filed there — the drawer picked and
 the group ticked, both still yours to change.
*/
struct NewRecipeView: View {
    enum Mode: String, CaseIterable, Identifiable {
        case type, link, paste
        var id: String { rawValue }
        var title: String {
            switch self {
            case .type: "Type it out"
            case .link: "From a link"
            case .paste: "Paste"
            }
        }
    }

    var session: Session?
    var initialSection: RecipeSection? = nil
    var initialGroups: [String] = []
    var onSaved: (Recipe) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var mode: Mode
    /// A link or a paste that has been read, open in the editor for checking.
    @State private var draft: RecipeDraft?
    /// A link pasted into Paste, carried over to From a link.
    @State private var handedLink = ""
    /// A link or a paste being read. The way in stays put until it is done, or the editor
    /// would slide in over whichever page had been switched to meanwhile.
    @State private var reading = false

    init(session: Session?, initialSection: RecipeSection? = nil, initialGroups: [String] = [],
         onSaved: @escaping (Recipe) -> Void) {
        self.session = session
        self.initialSection = initialSection
        self.initialGroups = initialGroups
        self.onSaved = onSaved
        #if DEBUG
        // -mp_debug_new link|paste opens on that way in, for screenshot runs.
        _mode = State(initialValue: UserDefaults.standard.string(forKey: "mp_debug_new").flatMap(Mode.init) ?? .type)
        #else
        _mode = State(initialValue: .type)
        #endif
    }

    var body: some View {
        NavigationStack {
            page
                // Above the page rather than in the bar: three words each need the width, and
                // the bar already holds Cancel and Save.
                .safeAreaInset(edge: .top, spacing: 0) {
                    Picker("How", selection: $mode) {
                        ForEach(Mode.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .disabled(reading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Color(.systemGroupedBackground))
                }
                .navigationTitle("New recipe")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
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
                }
        }
    }

    /*
     All three stay alive and only the chosen one shows: the picker sits right above the first
     field, and a stray tap on it should not throw away a half-typed recipe, its cover photo, or
     a paste.
    */
    private var page: some View {
        ZStack {
            shown(.type) {
                EditRecipeView(
                    recipe: nil,
                    session: session,
                    embedded: true,
                    showsSave: mode == .type,
                    initialSection: initialSection,
                    initialGroups: initialGroups
                ) { saved in finish(saved) }
            }
            shown(.link) {
                FromALinkPage(session: session, link: handedLink, active: mode == .link, busy: $reading,
                              onRead: { draft = $0 }, onSaved: finish)
            }
            shown(.paste) {
                PastePage(busy: $reading) { draft = $0 } onLink: { link in
                    handedLink = link
                    mode = .link
                }
            }
        }
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
 A link in, a recipe out. The server does the reading, the same one the web asks: a website's own
 recipe data, which is exact, or a TikTok's or a Reel's caption (and, failing that, what is said
 in it). Nothing is saved until the editor has been looked at.
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

    @State private var link: String
    @State private var readingSince: Date?
    @State private var error: String?
    @FocusState private var focused: Bool

    init(session: Session?, link: String = "", active: Bool = true, busy: Binding<Bool> = .constant(false),
         onRead: @escaping (RecipeDraft) -> Void, onSaved: ((Recipe) -> Void)? = nil) {
        self.session = session
        self.handed = link
        self.active = active
        _busy = busy
        self.onRead = onRead
        self.onSaved = onSaved
        _link = State(initialValue: link)
    }

    private var canRead: Bool {
        readingSince == nil && !link.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        Form {
            Section {
                TextField("https://…", text: $link)
                    .keyboardType(.URL)
                    .textContentType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .focused($focused)
                    .onSubmit { if canRead { Task { await read() } } }
                    .accessibilityLabel("A link to a recipe")
                // Said where it cannot be missed, not in the grey under the section: what it can
                // read is the one thing to know before pasting.
                Label("Works with TikTok, Instagram and recipe websites.", systemImage: "checkmark.circle")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                if let since = readingSince {
                    // A video can take a while — its caption, then perhaps what is said in it —
                    // so the wait counts real seconds rather than looking stuck.
                    TimelineView(.periodic(from: since, by: 1)) { context in
                        HStack(spacing: 10) {
                            ProgressView()
                            Text("Reading the link…")
                            Spacer()
                            Text("\(Int(context.date.timeIntervalSince(since)))s")
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                        }
                    }
                } else {
                    Button("Get the recipe", systemImage: "arrow.down.doc") { Task { await read() } }
                        .disabled(!canRead)
                }
            } footer: {
                Text("A website’s own recipe comes through exactly as they wrote it. A video’s is read from its caption or what’s said in it, so give it a look. Either way it opens in the editor before anything is saved.")
            }

            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
        .onChange(of: handed) { _, next in
            link = next
            error = nil
        }
        .onChange(of: active) { _, now in
            if now && link.isEmpty { focused = true }
            if !now { focused = false }
        }
        .onChange(of: readingSince) { _, since in busy = since != nil }
        .onAppear {
            if active && link.isEmpty { focused = true }
            #if DEBUG
            // -mp_debug_link "<url>" fills the box and reads it, for screenshot runs.
            if link.isEmpty, let seeded = UserDefaults.standard.string(forKey: "mp_debug_link") {
                link = seeded
                focused = false
                Task { await read() }
            }
            #endif
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
            onRead(RecipeDraft(imported: imported, link: typed))
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
        Form {
            if onDevice {
                pasteSection
                askSection(title: "Or ask an AI for one")
            } else {
                askSection(title: "Ask an AI")
                pasteSection
            }
            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
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

    private var pasteSection: some View {
        Section {
            if !onDevice {
                FormatWarning()
            }
            TextEditor(text: $text)
                .frame(minHeight: 180)
                .font(.callout)
                .overlay(alignment: .topLeading) {
                    if text.isEmpty {
                        Text(onDevice ? "Paste a recipe here" : "Paste the AI’s answer here")
                            .foregroundStyle(.tertiary)
                            .padding(.top, 8)
                            .padding(.leading, 5)
                            .allowsHitTesting(false)
                    }
                }
                .accessibilityLabel("The recipe to read")
            Button(reading ? "Reading…" : "Read it", systemImage: onDevice ? "apple.intelligence" : "text.viewfinder") {
                Task { await read() }
            }
            .disabled(reading || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        } header: {
            Text(onDevice ? "Paste a recipe" : "Paste the answer")
        } footer: {
            Text(onDevice
                 ? "Apple Intelligence reads it on this phone, so paste it however it’s written — a whole recipe page, a message, an AI’s answer, your own notes. Nothing leaves the phone, and you’ll see it in the editor before anything is saved."
                 : "You’ll see it in the editor before anything is saved.")
        }
    }

    private func askSection(title: String) -> some View {
        Section {
            TextField("What do you want to make? (optional)", text: $dish)
            Stepper("Serves \(servings)", value: $servings, in: 1...40)
            Button(copied ? "Copied" : "Copy the question", systemImage: copied ? "checkmark" : "doc.on.doc") {
                UIPasteboard.general.string = RecipeText.question(dish: dish, servings: servings)
                copied = true
                Task {
                    try? await Task.sleep(for: .seconds(2))
                    copied = false
                }
            }
        } header: {
            Text(title)
        } footer: {
            Text("Paste the question into whichever AI you use, then paste its answer \(onDevice ? "above" : "below").")
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
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Palette.accent)
            VStack(alignment: .leading, spacing: 4) {
                Text("You can’t paste just anything here.").font(.subheadline.weight(.semibold))
                Text("It only reads a recipe laid out the way the question asks: the name at the top, a line saying “Ingredients” with one ingredient per line under it, then a line saying “Instructions” with the steps. A recipe written as a paragraph won’t come through, and one copied off a website needs those two headings — or use From a link for the website itself.")
                    .font(.subheadline)
            }
        }
        .padding(.vertical, 4)
        .listRowBackground(Palette.accentSoft)
        .accessibilityElement(children: .combine)
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
