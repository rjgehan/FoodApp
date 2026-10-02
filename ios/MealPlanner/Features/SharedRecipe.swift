import SwiftUI
#if canImport(FoundationModels)
import FoundationModels
#endif

/*
 Paste a recipe from anywhere — a website, a message, an AI chat — and get the structured thing
 the app stores: a name, servings, ingredients with amounts, and steps.

 This is extraction, not invention, which is what a 3B on-device model is actually good at. The
 shape is fixed by @Generable, so the model fills in fields rather than writing prose that then
 has to be parsed. It runs on the phone: no key, no quota, no round trip.
 */

#if canImport(FoundationModels)
@available(iOS 26.0, *)
@Generable
struct ParsedRecipe {
    @Guide(description: "What the dish is called, without the word recipe.")
    var name: String

    @Guide(description: "How many people it serves. 4 when the text does not say.")
    var servings: Int

    @Guide(description: "Minutes of preparation. 0 when the text does not say.")
    var prepMinutes: Int

    @Guide(description: "Minutes of cooking. 0 when the text does not say.")
    var cookMinutes: Int

    /*
     One line per ingredient, copied out rather than interpreted.

     Asking the model for a number and a unit produced "1/3 cup parmesan cheese" as a
     quantity of 1 in units of parmesan cheese, and "1 tbsp sugar or to taste" as 1 of 1 —
     a 3B model cannot do the arithmetic and will fill a free-text unit with whatever is
     nearby. Copying a line is something it does reliably, and Amount does the rest exactly.
    */
    @Guide(description: "Each ingredient exactly as written in the text, one per entry, amount and all.")
    var ingredientLines: [String]

    @Guide(description: "The method, one entry per step, in order.")
    var steps: [String]
}

/// The on-device read of a pasted recipe, shared by the share sheet's screen and New recipe ›
/// Paste so the two read a paste the same way.
@available(iOS 26.0, *)
enum OnDeviceRecipe {
    /// Whether the model is on this phone and ready now — not merely whether the OS has it.
    static var isReady: Bool { SystemLanguageModel.default.availability == .available }

    static func read(_ text: String) async throws -> ParsedRecipe {
        let model = LanguageModelSession(instructions: instructions)
        return try await model.respond(to: text, generating: ParsedRecipe.self).content
    }

    private static let instructions = """
        You turn a pasted recipe into structured data.

        Copy, do not interpret. Each ingredient line comes across exactly as written, \
        including its amount — do not convert fractions, do not split off the unit, do \
        not tidy the wording. Keep the steps as written. Never invent an ingredient, a \
        step or a time. If the text is not a recipe, return an empty name and no \
        ingredients rather than making something up.
        """
}

/*
 What to call a dish whose caption never said.

 A caption that opens on a hook — "is it time?" — names the recipe after the hook. The video
 never states a title, but the steps show what it makes.
*/
@available(iOS 26.0, *)
@Generable
struct DishName {
    @Guide(description: "What these steps make, as you would write it at the top of a recipe. A few words. Not the word recipe.")
    var name: String
}

/*
 One sentence of the transcript, judged on its own.

 Asked to pick the cooking out of a whole transcript in one go, the model partitions the
 input instead of selecting from it — measured: it returned every line in contiguous pairs,
 hook and sign-off included. Asked about one sentence at a time it is reliable, because
 "is this an instruction" is a judgement and "which of these thirty lines" is a search.
 Thirty small calls cost about fifteen seconds, and a wrong answer costs one line.
*/
@available(iOS 26.0, *)
@Generable
struct LineVerdict {
    @Guide(description: "True when this sentence tells the cook to do something. False when it is chat, a hook, an aside, or asking you to follow.")
    var isAStep: Bool
}

/// A handful of lines rewritten together. Small chunks and a fresh session each time:
/// measured, a long run truncates its own head, and carrying context between chunks makes
/// the model repeat the previous step verbatim instead of writing the next one.
@available(iOS 26.0, *)
@Generable
struct RewrittenLines {
    @Guide(description: "One instruction per line you were given, in the same order, using only that line's own words.")
    var steps: [String]
}
#endif

/// A recipe the page published about itself, in schema.org form. No model involved: these
/// are the site's own ingredient and step lists.
struct StructuredRecipe: Codable {
    var name: String
    var servings: Int
    var prep: Int
    var cook: Int
    var ingredients: [String]
    var steps: [String]
    /// The page it came from, kept as the recipe's first link. Absent from a share extension
    /// built before it sent one.
    var url: String? = nil
    /// The picture the link came with, already saved on the server, to be the cover.
    var coverImageId: UUID? = nil
}

struct SharedRecipeView: View {
    var session: Session
    /// Handed in by the share extension; typed by hand otherwise.
    var incoming: String?
    /// The page's own recipe data, when it had some. Skips the model entirely.
    var structured: StructuredRecipe?
    /// What the share sheet handed over, for the import log. Sent from here rather than
    /// from the URL handler, because that runs before the session has been restored.
    var diagnostic: String?
    /// The page the shared text was on, when the share sheet said. Saved as the recipe's link.
    var link: String?
    /// Previews and the Gallery: draw it from what was handed in, and send nothing.
    var sample = false

    /// Read as recipe, or keep as a saved link — the share sheet's two ways (7.6).
    enum Way: Hashable { case recipe, link }

    @State private var text = ""
    @State private var busy = false
    @State private var note: String?
    @State private var error: String?
    @State private var saved: String?
    /// A save on its way: the button goes quiet so a second tap cannot make a second recipe.
    @State private var savingRecipe = false
    /// The household already has this one — asked about before a second copy is made.
    @State private var duplicate: DuplicateRecipe?
    /// Which way in was being saved when that question came up, to finish it the same way.
    @State private var retry: (() async -> Void)?
    @State private var fromPage: StructuredRecipe?
    @State private var tidying = false
    /// Which line is being read, so a slow pass looks like progress and not a hang.
    @State private var tidyProgress: String?
    /// The server said the method came off a transcript rather than out of a recipe.
    @State private var methodWasSpoken = false
    /// Kept so the model's rewrite can be undone — it is a guess about wording, and the
    /// steps underneath it are the ones the cook actually said.
    @State private var spokenSteps: [String]?
    /// What was said in the video, sentence by sentence: what the rewrite was made from.
    @State private var spokenLines: [String]?
    /// A recipe sent as one of this app's own public links, saved as a copy — to open from here.
    @State private var copy: Recipe?
    /// The link the server was asked to read, so it can be kept when it could not be.
    @State private var readLink: String?
    /// Kept in Saved links, instead of or as well as reading it.
    @State private var kept: SavedLink?
    @State private var keeping = false

    /// Read as a recipe, or kept as a link. Chosen in the share sheet, changeable here.
    @State private var way: Way
    /// Where it goes: which household, which drawer, and (a recipe only) which group.
    @State private var target: UUID?
    @State private var section: RecipeSection = .dinner
    @State private var group: String?
    @State private var groups: [RecipeCategory] = []

    @Environment(\.dismiss) private var dismiss

    init(session: Session, incoming: String? = nil, structured: StructuredRecipe? = nil, diagnostic: String? = nil,
         link: String? = nil, keepAsLink: Bool = false, sample: Bool = false) {
        self.session = session
        self.incoming = incoming
        self.structured = structured
        self.diagnostic = diagnostic
        self.link = link
        self.sample = sample
        _way = State(initialValue: keepAsLink ? .link : .recipe)
        _target = State(initialValue: session.household?.id)
    }

    /// What "Keep as saved link" would keep: the link read, or the page the share sheet came from.
    private var linkToKeep: String? {
        // The share extension marks "all I got was a link" with a 🔗, which is the link itself.
        let marked = text.hasPrefix("\u{1F517}")
            ? String(text.dropFirst()).trimmingCharacters(in: .whitespacesAndNewlines) : nil
        let candidate = readLink ?? link ?? fromPage?.url ?? marked
        guard let candidate, candidate.lowercased().hasPrefix("http") else { return nil }
        return candidate
    }

    #if canImport(FoundationModels)
    @State private var parsedStore: Any?
    @available(iOS 26.0, *)
    private var parsed: ParsedRecipe? { parsedStore as? ParsedRecipe }
    #endif

    /// A name for the card: what was read, or where it came from while it is being read.
    private var readName: String? {
        if let fromPage { return fromPage.name }
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), let parsed { return parsed.name }
        #endif
        return nil
    }

    private var hasRead: Bool { readName != nil }

    /// Something arrived (or was pasted and read): the card and its choices are worth showing.
    private var arrived: Bool { incoming != nil || structured != nil || link != nil || hasRead || copy != nil }

    /// How the reading went, after the source on the card.
    private var status: String {
        if tidying { return "\(tidyProgress ?? "reading the video")…" }
        if busy { return "reading…" }
        if copy != nil { return "shared from Meal Planner" }
        if fromPage != nil {
            if methodWasSpoken { return "spoken in the video" }
            return SharedItemCard.isVideo(linkToKeep) ? "caption found" : "recipe found"
        }
        if hasRead { return "read on this phone" }
        if error != nil { return "no recipe read" }
        return way == .link ? "link" : ""
    }

    /// A Save that does what the two ways and the chips say — once.
    private var canSave: Bool {
        guard target != nil, !savingRecipe, !keeping, saved == nil, kept == nil, copy == nil else { return false }
        return way == .link ? linkToKeep != nil : hasRead
    }

    private var finished: Bool { saved != nil || kept != nil || copy != nil }

    /// A long paste will not fit the context window, and the failure is unhelpful, so it is
    /// cut here and said out loud.
    private static let limit = 5000

    /*
     The mockup's 7.6, as the app's half of the share sheet: Cancel, the app's name and Save across
     the top; a card for what arrived; Read as recipe or Keep as saved link; and chips for where it
     goes — the household, the drawer and, for a recipe, a group. What was read follows, to check
     before saving, with a method rewritten on the phone shown as 7.7 does.
    */
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if !arrived { pasteBox }

                if arrived {
                    SharedItemCard(
                        title: kept?.name ?? copy?.name ?? readName ?? SharedItemCard.source(of: linkToKeep) ?? "Shared text",
                        source: SharedItemCard.source(of: linkToKeep),
                        status: status,
                        coverImageId: kept?.coverImageId ?? fromPage?.coverImageId,
                        isVideo: SharedItemCard.isVideo(linkToKeep),
                        busy: busy || tidying
                    )
                    if linkToKeep != nil, copy == nil, !finished {
                        SegmentedControl(selection: $way, options: [(.recipe, "Read as recipe"), (.link, "Keep as saved link")])
                    }
                    if copy == nil, !finished { filing }
                }

                if let note {
                    Text(note).font(.system(size: 13)).foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let error {
                    NoteBox(error, tone: .accent, systemImage: "exclamationmark.circle")
                    // Could not be read, and a link is all there is: keep it rather than lose it.
                    if way == .recipe, fromPage == nil, copy == nil, kept == nil, linkToKeep != nil {
                        Button { way = .link } label: { Label("Keep it as a saved link instead", systemImage: "link") }
                            .buttonStyle(.kitchen(.soft, size: .small, fill: false))
                    }
                }
                if let saved {
                    Label(saved, systemImage: "checkmark.circle.fill")
                        .font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.herb)
                }
                if let kept {
                    Label(kept.alreadySaved == true ? "Already in Saved links" : "Saved to Saved links",
                          systemImage: "checkmark.circle.fill")
                        .font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.herb)
                    Text("Find it under Recipes › Saved links, to make into a recipe whenever you like.")
                        .font(.system(size: 13)).foregroundStyle(Palette.muted)
                }
                if let copy {
                    NavigationLink {
                        RecipeDetailView(recipe: copy, session: session)
                    } label: {
                        ListRow(copy.name, subtitle: "Saved to \(session.household?.name ?? "your recipes")", chevron: true,
                                leading: { CheckCircle(isOn: true) }, trailing: { EmptyView() })
                            .cardSurface()
                    }
                    .buttonStyle(PressFade())
                    Text("A copy of your own: it stays as it is if they change theirs or turn the link off.")
                        .font(.system(size: 13)).foregroundStyle(Palette.muted)
                }

                if way == .recipe { whatWasRead }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .scrollDismissesKeyboard(.interactively)
        .pageBackground()
        .navigationBarTitleDisplayMode(.inline)
        // The mockup's bar (7.6): plain "Cancel", the app's tile and name, bold "Save" — bare text in
        // the accent's ink, with no glass capsules round them.
        .toolbar {
            if !finished {
                BarTextButton("Cancel", placement: .topBarLeading) { dismiss() }
            }
            ToolbarItem(placement: .principal) { ShareSheetTitle() }
            if finished {
                BarTextButton("Done", placement: .topBarTrailing, bold: true) { dismiss() }
            } else {
                BarTextButton(savingRecipe || keeping ? "Saving…" : "Save", placement: .topBarTrailing, bold: true,
                              disabled: !canSave) { Task { await saveTapped() } }
            }
        }
        .confirmationDialog(
            "You already have “\(duplicate?.name ?? "")”",
            isPresented: Binding(get: { duplicate != nil }, set: { if !$0 { duplicate = nil } }),
            titleVisibility: .visible
        ) {
            Button("Save another copy") { Task { await retry?() } }
            Button("Don't save", role: .cancel) {
                duplicate = nil
                saved = "Not saved — it's already in your recipes."
            }
        } message: {
            Text("It's already in your recipes — the same link or the same name.")
        }
        .task(id: target) { await loadGroups() }
        .task {
            if sample {
                if let structured, fromPage == nil { fromPage = structured }
                return
            }
            #if DEBUG
            if let diagnostic { await session.noteShare(diagnostic) }
            #endif
            // A page of this app's own, shared from Safari: its words would be read as a recipe
            // otherwise, and saved as a new one with none of its pictures.
            if copy == nil, error == nil, let token = SharedRecipeLink.token(in: link) {
                await saveCopy(token)
                return
            }
            if let structured, fromPage == nil {
                fromPage = structured
                note = "Read straight from the page's own recipe data — nothing was guessed."
                return
            }
            if let incoming, text.isEmpty {
                text = incoming
                // Kept as a link from the share sheet: nothing to read now. The server reads the
                // page for its name and picture when it is kept.
                if way == .link, incoming.hasPrefix("\u{1F517}") { return }
                await parse()
            }
        }
        .onChange(of: way) { _, now in
            // Changed their mind towards reading it: read it now, if nothing has been.
            if now == .recipe, !hasRead, !busy, error == nil, !text.isEmpty { Task { await parse() } }
        }
        #if DEBUG
        // -mp_debug_paste "<text>" fills the box, so a screenshot run can test the parse
        // without a keyboard. Add -mp_debug_autoparse 1 to read it straight away.
        .task {
            guard text.isEmpty, let seeded = UserDefaults.standard.string(forKey: "mp_debug_paste") else { return }
            text = seeded
            if UserDefaults.standard.bool(forKey: "mp_debug_autoparse") { await parse() }
        }
        #endif
    }

    /// Typed or pasted by hand, when nothing came from the share sheet.
    private var pasteBox: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Paste")
            TextEditor(text: $text)
                .font(.system(size: 15))
                .scrollContentBackground(.hidden)
                .frame(minHeight: 160)
                .padding(8)
                .fieldSurface()
                .overlay(alignment: .topLeading) {
                    if text.isEmpty {
                        Text("Paste a recipe here")
                            .font(.system(size: 15))
                            .foregroundStyle(Palette.faint)
                            .padding(.horizontal, 13)
                            .padding(.vertical, 16)
                            .allowsHitTesting(false)
                    }
                }
            Button {
                Task { await parse() }
            } label: {
                Label(busy ? "Reading…" : "Read it", systemImage: "wand.and.stars")
            }
            .buttonStyle(.secondary)
            .disabled(busy || text.trimmingCharacters(in: .whitespaces).isEmpty)
            Text("Pasted text is read on this phone and never leaves it. A shared link is read by your server.")
                .font(.system(size: 12)).foregroundStyle(Palette.muted)
        }
    }

    /// Where it goes (7.6): each household as a chip, the drawer, and a group for a recipe.
    private var filing: some View {
        let houses = session.households.isEmpty ? [session.household].compactMap { $0 } : session.households
        let inDrawer = groups.filter { $0.section == section }
        return ChipFlow(spacing: 8) {
            ForEach(houses, id: \.id) { house in
                Button { target = house.id; group = nil } label: { ChipFace(title: house.name, isOn: target == house.id) }
                    .buttonStyle(PressFade())
                    .accessibilityAddTraits(target == house.id ? .isSelected : [])
            }
            Menu {
                Picker("Drawer", selection: $section) {
                    ForEach(RecipeSection.allCases, id: \.self) { Text($0.title).tag($0) }
                }
            } label: {
                ChipFace(title: section.title, isOn: true)
            }
            .accessibilityLabel("Drawer: \(section.title)")
            .onChange(of: section) { _, _ in group = nil }
            if way == .recipe {
                Menu {
                    Button("No group") { group = nil }
                    ForEach(inDrawer) { category in
                        Button(category.name) { group = category.name }
                    }
                } label: {
                    ChipFace(title: group ?? "+ Group", isOn: group != nil)
                }
                .disabled(inDrawer.isEmpty && group == nil)
                .accessibilityLabel(group.map { "Group: \($0)" } ?? "Add to a group")
            }
        }
    }

    /// What was read, to check before saving: the facts, the ingredients and the method.
    @ViewBuilder private var whatWasRead: some View {
        if let fromPage {
            readOut(name: fromPage.name, servings: fromPage.servings, prep: fromPage.prep, cook: fromPage.cook,
                    ingredients: fromPage.ingredients) {
                if let spokenSteps {
                    RewrittenMethod(
                        steps: fromPage.steps,
                        original: spokenLines?.joined(separator: " "),
                        mentions: fromPage.ingredients.map { Amount($0).name },
                        onUndo: {
                            self.fromPage?.steps = spokenSteps
                            self.spokenSteps = nil
                        })
                } else {
                    NumberedSteps(steps: fromPage.steps, mentions: fromPage.ingredients.map { Amount($0).name })
                    if methodWasSpoken {
                        Text("Transcribed from the video and tidied by rule. Apple Intelligence did not rewrite these.")
                            .font(.system(size: 12)).foregroundStyle(Palette.muted)
                    }
                }
            }
        }
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), fromPage == nil, let parsed {
            readOut(name: parsed.name, servings: parsed.servings, prep: parsed.prepMinutes, cook: parsed.cookMinutes,
                    ingredients: parsed.ingredientLines) {
                NumberedSteps(steps: parsed.steps)
            }
        }
        #endif
    }

    private func readOut<Method: View>(name: String, servings: Int, prep: Int, cook: Int, ingredients: [String],
                                       @ViewBuilder method: () -> Method) -> some View {
        let facts = [servings > 0 ? "Serves \(servings)" : nil, prep > 0 ? "\(prep) min prep" : nil,
                     cook > 0 ? "\(cook) min cook" : nil].compactMap { $0 }
        return VStack(alignment: .leading, spacing: 16) {
            if !facts.isEmpty {
                Text(facts.joined(separator: " · ")).font(.system(size: 14)).foregroundStyle(Palette.muted)
            }
            if !ingredients.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Ingredients", trailing: "\(ingredients.count)")
                    ListGroup {
                        ForEach(Array(ingredients.enumerated()), id: \.offset) { _, line in
                            let row = Amount(line)
                            ListRow(row.name.isEmpty ? line : row.name, detail: written(row),
                                    leading: { EmptyView() }) {
                                if row.optional { Pill("optional", tone: .neutral) }
                            }
                        }
                    }
                }
            }
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel("Method")
                method()
            }
        }
    }

    /// Save, the way the two choices and the chips say.
    private func saveTapped() async {
        if way == .link {
            await keep(name: readName, cover: fromPage?.coverImageId)
            return
        }
        if let fromPage {
            await savePage(fromPage)
            return
        }
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), let parsed { await save(parsed) }
        #endif
    }

    /// The groups of the household it is going to, for the group chip.
    private func loadGroups() async {
        guard !sample, let target else { return }
        groups = (try? await APIClient.shared.recipeCategories(household: target)) ?? []
    }

    /**
     One of this app's own public links (/r/…), which somebody sent. It is not a recipe page the
     importer could read — it is the web app's — so it is saved as a copy, pictures and all, the
     same as that page's "Save to my recipes", into the household the app is on.
    */
    private func saveCopy(_ token: String) async {
        guard let household = session.household?.id else { return }
        busy = true
        error = nil
        saved = nil
        defer { busy = false }
        note = "A recipe shared from Meal Planner. Saving a copy…"
        do {
            copy = try await SharedRecipeLink.save(token: token, household: household)
            note = nil
        } catch {
            note = nil
            self.error = error.localizedDescription
        }
    }

    /// Keeps the link in Saved links. What was already read goes with it, so the page is not
    /// fetched twice; otherwise the server reads it for a name and a picture.
    private func keep(name: String?, cover: UUID?) async {
        guard let household = target, let url = linkToKeep, !keeping else { return }
        keeping = true
        defer { keeping = false }
        if sample { return }
        do {
            kept = try await APIClient.shared.saveLink(household: household, url: url, name: name, section: section,
                                                       coverImageId: cover)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Asks the server to read a link. It knows about structured data and about TikTok, and
    /// being one implementation means the phone and the web agree on what a page says.
    private func importLink(_ link: String) async {
        guard let household = session.household?.id else { return }
        readLink = link
        note = "Reading \(link)…"
        do {
            let imported = try await APIClient.shared.importRecipe(household: household, url: link)
            fromPage = StructuredRecipe(
                name: imported.name,
                servings: imported.servings,
                prep: imported.prepTimeMinutes ?? 0,
                cook: imported.cookTimeMinutes ?? 0,
                ingredients: imported.ingredients.map { row in
                    [row.quantity.map { $0 == $0.rounded() ? String(Int($0)) : String($0) }, row.unit, row.ingredientName]
                        .compactMap { $0 }
                        .joined(separator: " ")
                },
                steps: (imported.instructions ?? "").split(separator: "\n").map(String.init),
                // The server hands the page back as a link; an older one did not, and the
                // link that was shared is the same page.
                url: imported.links?.first?.url ?? link,
                coverImageId: imported.coverImageId
            )
            note = "Read from the page itself — nothing was guessed."

            // Steps a publisher wrote are exact and stay exactly as they are. Steps pieced
            // together out of somebody narrating a video are a reconstruction, and reading
            // like one, so they get rewritten here on the phone.
            methodWasSpoken = imported.methodWasSpoken
            if imported.methodWasSpoken {
                note = "The recipe was spoken in the video, not written down. Reading it back…"
                await tidyTheMethod(said: imported.spokenLines ?? [])
            } else {
                // A caption can carry the whole recipe and still be titled "Hitting protein
                // goals without the protein powder >>>". The steps know what it makes.
                await nameItIfTheCaptionDidNot()
            }
        } catch {
            note = nil
            self.error = error.localizedDescription
        }
    }

    /**
     Turns what was said in the video into a method, on device.

     The server sends two lists of the same length: the step as its rules wrote it, and the
     raw sentence the cook actually said. The model rewrites the raw sentence, because a step
     that has already been tidied has had the evidence tidied out of it — rewriting those was
     measured to change one step in sixteen, and rewriting the speech changes half of them.

     Each rewrite is then checked against its own sentence, and a rewrite that fails falls
     back to the rules' version of that same step. So the worst this can do is nothing.

     Free, unlimited and private, so the only cost is about ten seconds.
    */
    private func tidyTheMethod(said: [String]) async {
        #if canImport(FoundationModels)
        guard #available(iOS 26.0, *) else { return }
        let floor = fromPage?.steps ?? []
        // One raw sentence per step, in step order. Without that pairing there is no floor
        // to fall back to, and a rewrite could only be taken on trust.
        guard said.count == floor.count, floor.count > 1 else { return }

        tidying = true
        defer { tidying = false; tidyProgress = nil }
        let started = Date()
        let shopping = (fromPage?.ingredients ?? []).map { Amount($0).name.lowercased() }
            .filter { !$0.isEmpty }

        var steps: [String] = []
        var rewrote = 0
        for start in stride(from: 0, to: said.count, by: Self.chunk) {
            let chunk = Array(said[start ..< min(start + Self.chunk, said.count)])
            tidyProgress = "step \(start + 1) of \(said.count)"
            let out = await rewrite(chunk)
            for (offset, sentence) in chunk.enumerated() {
                let candidate = offset < out.count ? out[offset] : nil
                if let candidate,
                   Self.saysOnlyWhatItsSourceSaid(candidate, source: sentence, shopping: shopping) {
                    steps.append(candidate)
                    if candidate != floor[start + offset] { rewrote += 1 }
                } else {
                    steps.append(floor[start + offset])
                }
            }
        }

        guard steps.count == floor.count else { return }
        spokenSteps = floor
        spokenLines = said
        fromPage?.steps = steps
        if let current = fromPage?.name,
           Self.isAHook(current, ingredients: fromPage?.ingredients.map { Amount($0).name } ?? []) {
            if let named = await dishName(from: steps) { fromPage?.name = named }
        }
        note = String(
            format: "Spoken in the video. %d of %d steps rewritten on this phone in %.0f s; the rest kept as they were said.",
            rewrote, steps.count, Date().timeIntervalSince(started)
        )
        #endif
    }

    /// Names the dish when the caption never did. The steps are the evidence, so this runs
    /// after they are settled, and only when the existing name is a hook.
    private func nameItIfTheCaptionDidNot() async {
        #if canImport(FoundationModels)
        guard #available(iOS 26.0, *), let page = fromPage, !page.steps.isEmpty else { return }
        let names = page.ingredients.map { Amount($0).name }
        guard Self.isAHook(page.name, ingredients: names) else { return }

        tidying = true
        defer { tidying = false; tidyProgress = nil }
        tidyProgress = "naming it"
        if let named = await dishName(from: page.steps) {
            fromPage?.name = named
            note = "The caption never said what this is called, so it was named from the steps, on this phone."
        }
        #endif
    }

    #if canImport(FoundationModels)
    /// Only asked when the caption's own name is unusable, because a creator's title beats
    /// a good guess every time.
    @available(iOS 26.0, *)
    private func dishName(from steps: [String]) async -> String? {
        do {
            let model = LanguageModelSession(instructions: """
                You are given the steps of a recipe. Say what the finished dish is called, \
                naming only things the steps actually mention.
                """)
            let out = try await model.respond(to: steps.joined(separator: "\n"), generating: DishName.self)
            let name = out.content.name.trimmingCharacters(in: .whitespacesAndNewlines)
            return Self.couldBeADishName(name) ? name : nil
        } catch {
            return nil
        }
    }

    @available(iOS 26.0, *)
    private func rewrite(_ lines: [String]) async -> [String] {
        let numbered = lines.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n")
        do {
            let model = LanguageModelSession(instructions: Self.rewriting)
            return try await model.respond(to: numbered, generating: RewrittenLines.self).content.steps
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        } catch {
            return []
        }
    }

    /// Five at a time. Measured: a long run truncates its own head, and carrying a line of
    /// context between chunks makes the model repeat it instead of writing the next step.
    private static let chunk = 5

    private static let rewriting = """
        You rewrite what a cook said into the steps of a recipe.

        Each numbered line is one sentence of an automatic transcript, so it is full of \
        speech — "then we can", "I'll", "you're gonna" — and the transcriber may have cut a \
        sentence in half or misheard a word.

        Return one instruction for each line you are given, in the same order, using only the \
        words of that line. Address the cook directly and drop the speaker. Keep every number, \
        weight, temperature and time exactly as it appears.

        Never add an ingredient, an amount, a temperature or a time that is not in the line, \
        and never write a step for something the line does not mention. If a line cannot be \
        made into an instruction, return it unchanged.
        """

    /**
     Is this rewrite worth having instead of the one the rules wrote?

     Four ways it can fail, all of them measured on real output from this model. It can invent
     — a competitor reading this same video produced "crown sugar" and "2 tbsp" from nothing.
     It can quietly drop half the step, turning a bowl of oil, salt and sugar into "cut into
     wedges". It can lose an ingredient, which is how the same competitor served beans it
     never told anybody to add. And it can put the speaker back in, undoing what the rules
     already did.

     Anything that fails keeps the rules' version, so being strict here is cheap.
    */
    private static func saysOnlyWhatItsSourceSaid(
        _ step: String, source: String, shopping: [String]
    ) -> Bool {
        if step.isEmpty || step.count > source.count * 2 + 40 { return false }

        // Every number in the step was said, and every number said is still in the step.
        let digits = { (text: String) in
            Set(text.components(separatedBy: CharacterSet.decimalDigits.inverted).filter { !$0.isEmpty })
        }
        if digits(step) != digits(source) { return false }

        let padded = " " + step.lowercased() + " "
        for speaker in [" i ", " i'", " we ", " we'", " my ", " our ", " gonna ", " let's ", " you're "] {
            if padded.contains(speaker) { return false }
        }

        let words = { (text: String) in
            Set(text.lowercased()
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { $0.count > 3 })
        }
        let sourceWords = words(source)
        let stepWords = words(step)
        if stepWords.isEmpty { return false }
        // Made of the cook's own words, and still carrying most of what was said.
        if Double(stepWords.intersection(sourceWords).count) / Double(stepWords.count) < 0.6 { return false }
        if Double(stepWords.intersection(sourceWords).count) / Double(sourceWords.count) < 0.5 { return false }

        // Whatever you have to buy has to survive the rewrite.
        for item in shopping {
            let parts = item.split(separator: " ").map(String.init)
            let named = parts.allSatisfy { source.lowercased().contains($0) }
            let kept = parts.contains { step.lowercased().contains($0) }
            if named && !kept { return false }
        }
        return true
    }
    #endif

    /**
     Did the caption open on a hook instead of naming the dish?

     A question is one tell. The better one is that a recipe is almost always named after
     something in it — salmon, squash, chicken — so a title that shares no word with its own
     ingredient list is describing something other than the food. Two real captions opened
     "is it time?" and "Hitting protein goals without the protein powder >>>", and neither
     names what you are about to cook.
    */
    private static func isAHook(_ name: String, ingredients: [String]) -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        // "This oven baked chicken parm is one of my favorite weeknight dinners! Full list
        // of ingredients below…" is a description. A title is short.
        if trimmed.isEmpty || trimmed.hasSuffix("?") || trimmed.count < 3 || trimmed.count > 60 {
            return true
        }

        let words = { (text: String) in
            Set(text.lowercased()
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { $0.count > 3 }
                .map { $0.hasSuffix("s") ? String($0.dropLast()) : $0 })
        }
        let named = words(trimmed)
        guard !named.isEmpty else { return true }
        for ingredient in ingredients where !words(ingredient).isDisjoint(with: named) {
            return false
        }
        return true
    }

    private static func couldBeADishName(_ name: String) -> Bool {
        !name.isEmpty && name.count <= 60 && !name.hasSuffix("?")
            && name.rangeOfCharacter(from: .letters) != nil
    }

    private static func plausible(_ rewritten: [String], from original: [String]) -> Bool {
        guard !rewritten.isEmpty, rewritten.count <= original.count + 2 else { return false }
        let before = original.joined(separator: " ").count
        let after = rewritten.joined(separator: " ").count
        return after >= before / 2 && after <= before * 3 / 2
    }

    /// The generic "operation couldn't be completed" hides the one failure that actually
    /// happens: availability says the model is there, but its weights are not on this
    /// machine. That is the normal state of the Simulator.
    static func explain(_ error: Error) -> String {
        let nsError = error as NSError
        let text = "\(nsError.domain) \(nsError.code): \(nsError.localizedDescription)"
        if nsError.domain.contains("UnifiedAsset") || nsError.localizedDescription.contains("modelcatalog") {
            return "The model's weights are not on this device yet. On the Simulator they never arrive; on a phone, wait for Apple Intelligence to finish downloading.\n\n\(text)"
        }
        return text
    }

    /// "1/3 cup" reads better than "0.333 cup"; the number itself stays exact underneath.
    private func written(_ row: Amount) -> String {
        guard let quantity = row.quantity else { return row.unit ?? "" }
        let number: String
        switch quantity {
        case let value where value == value.rounded(): number = String(Int(value))
        case 0.25: number = "¼"
        case 0.5: number = "½"
        case 0.75: number = "¾"
        case let value where abs(value - 1.0 / 3) < 0.01: number = "⅓"
        case let value where abs(value - 2.0 / 3) < 0.01: number = "⅔"
        default: number = String(format: "%g", quantity)
        }
        return [number, row.unit].compactMap { $0 }.joined(separator: " ")
    }

    // MARK: - Reading

    private func parse() async {
        if let token = SharedRecipeLink.token(in: text) {
            await saveCopy(token)
            return
        }
        #if canImport(FoundationModels)
        guard #available(iOS 26.0, *) else {
            error = "Needs iOS 26."
            return
        }
        busy = true
        error = nil
        saved = nil
        defer { busy = false }

        var input = text.trimmingCharacters(in: .whitespacesAndNewlines)
        var trimmed = false

        // The share extension marks "all I got was a link" with a 🔗. The server reads those:
        // a recipe site's own structured data, or TikTok's caption through oEmbed. Both are
        // exact and neither needs a model, so nothing below runs.
        if input.hasPrefix("\u{1F517}") {
            let link = String(input.dropFirst()).trimmingCharacters(in: .whitespaces)
            await importLink(link)
            return
        }

        let started = Date()
        do {
            let reply = try await OnDeviceRecipe.read(input)
            parsedStore = reply
            let seconds = Date().timeIntervalSince(started)
            note = String(
                format: "Read %d characters → %d ingredients, %d steps in %.1f s%@",
                input.count,
                reply.ingredientLines.count,
                reply.steps.count,
                seconds,
                trimmed ? " · cut to \(Self.limit) characters" : ""
            )
            if reply.ingredientLines.isEmpty {
                error = "No recipe found in that text — nothing was invented to fill the gap."
            }
        } catch let failure as LanguageModelSession.GenerationError {
            // The interesting failures: too long for the window, or the guardrails said no.
            error = "Model: \(failure.localizedDescription)"
        } catch {
            self.error = Self.explain(error)
        }
        #else
        error = "FoundationModels is not in this SDK."
        #endif
    }

    private func savePage(_ recipe: StructuredRecipe, anotherCopy: Bool = false) async {
        guard let household = target, !savingRecipe, !sample else { return }
        savingRecipe = true
        defer { savingRecipe = false }
        var body: [String: Any] = [
            "name": recipe.name,
            "servings": max(1, recipe.servings),
            "section": section.rawValue,
            "categories": group.map { [$0] } ?? [],
            "instructions": recipe.steps.joined(separator: "\n"),
            "prepTimeMinutes": recipe.prep,
            "cookTimeMinutes": recipe.cook,
            "ingredients": recipe.ingredients.compactMap { line -> [String: Any]? in
                let row = Amount(line)
                guard !row.name.isEmpty else { return nil }
                var out: [String: Any] = [
                    "ingredientName": row.name,
                    "optional": row.optional,
                ]
                // No amount on the line — "salt and pepper" — is sent as none, not 1.
                if let quantity = row.quantity { out["quantity"] = quantity }
                if let unit = row.unit { out["unit"] = unit }
                if let notes = row.notes { out["notes"] = notes }
                return out
            },
        ]
        // Read off a page, so the recipe keeps a way back to it.
        if let url = recipe.url, !url.isEmpty {
            body["links"] = [["url": url, "label": NSNull()]]
        }
        // The video's cover, until somebody picks their own.
        if let cover = recipe.coverImageId {
            body["coverImageId"] = cover.uuidString
        }
        do {
            let created = try await APIClient.shared.createRecipe(household: household, body: body,
                                                                  allowDuplicate: anotherCopy)
            saved = "Saved as \(created.name)"
        } catch let apiError as APIError where apiError.duplicateRecipe != nil {
            retry = { await savePage(recipe, anotherCopy: true) }
            duplicate = apiError.duplicateRecipe
        } catch {
            self.error = error.localizedDescription
        }
    }

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private func save(_ recipe: ParsedRecipe, anotherCopy: Bool = false) async {
        guard let household = target, !savingRecipe, !sample else { return }
        savingRecipe = true
        defer { savingRecipe = false }
        var body: [String: Any] = [
            "name": recipe.name,
            "servings": max(1, recipe.servings),
            "section": section.rawValue,
            "categories": group.map { [$0] } ?? [],
            "instructions": recipe.steps.joined(separator: "\n"),
            "prepTimeMinutes": recipe.prepMinutes,
            "cookTimeMinutes": recipe.cookMinutes,
            "ingredients": recipe.ingredientLines.compactMap { line -> [String: Any]? in
                let row = Amount(line)
                guard !row.name.isEmpty else { return nil }
                var out: [String: Any] = [
                    "ingredientName": row.name,
                    "optional": row.optional,
                ]
                // No amount on the line — "salt and pepper" — is sent as none, not 1.
                if let quantity = row.quantity { out["quantity"] = quantity }
                if let unit = row.unit { out["unit"] = unit }
                if let notes = row.notes { out["notes"] = notes }
                return out
            },
        ]
        // Shared from a page, so the recipe keeps a way back to it, as one read off the
        // page's own data does. Only a web page: the server refuses anything else, and would
        // refuse the whole recipe with it.
        if let link, link.lowercased().hasPrefix("http") {
            body["links"] = [["url": link, "label": NSNull()]]
        }
        do {
            let created = try await APIClient.shared.createRecipe(household: household, body: body,
                                                                  allowDuplicate: anotherCopy)
            saved = "Saved as \(created.name)"
        } catch let apiError as APIError where apiError.duplicateRecipe != nil {
            retry = { await save(recipe, anotherCopy: true) }
            duplicate = apiError.duplicateRecipe
        } catch {
            self.error = error.localizedDescription
        }
    }
    #endif
}

#Preview("Paste") {
    NavigationStack { SharedRecipeView(session: .preview) }
}
