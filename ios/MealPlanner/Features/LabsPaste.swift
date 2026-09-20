import SwiftUI
#if canImport(FoundationModels)
import FoundationModels
#endif

/*
 Paste a recipe from anywhere — a website, a message, ChatGPT — and get the structured thing
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
}

struct LabsPasteView: View {
    var session: Session
    /// Handed in by the share extension; typed by hand otherwise.
    var incoming: String?
    /// The page's own recipe data, when it had some. Skips the model entirely.
    var structured: StructuredRecipe?

    @State private var text = ""
    @State private var busy = false
    @State private var note: String?
    @State private var error: String?
    @State private var saved: String?
    @State private var fromPage: StructuredRecipe?
    @State private var tidying = false
    /// Which line is being read, so a slow pass looks like progress and not a hang.
    @State private var tidyProgress: String?
    /// The server said the method came off a transcript rather than out of a recipe.
    @State private var methodWasSpoken = false
    /// Kept so the model's rewrite can be undone — it is a guess about wording, and the
    /// steps underneath it are the ones the cook actually said.
    @State private var spokenSteps: [String]?

    #if canImport(FoundationModels)
    @State private var parsedStore: Any?
    @available(iOS 26.0, *)
    private var parsed: ParsedRecipe? { parsedStore as? ParsedRecipe }
    #endif

    /// A long paste will not fit the context window, and the failure is unhelpful, so it is
    /// cut here and said out loud.
    private static let limit = 5000

    var body: some View {
        List {
            Section {
                TextEditor(text: $text)
                    .frame(minHeight: 160)
                    .font(.callout)
                    .overlay(alignment: .topLeading) {
                        if text.isEmpty {
                            Text("Paste a recipe here")
                                .foregroundStyle(.tertiary)
                                .padding(.top, 8)
                                .allowsHitTesting(false)
                        }
                    }
                Button(busy ? "Reading…" : "Read it", systemImage: "wand.and.stars") {
                    Task { await parse() }
                }
                .buttonStyle(.borderless)
                .disabled(busy || text.trimmingCharacters(in: .whitespaces).isEmpty)
            } header: {
                Text("Paste")
            } footer: {
                Text("Runs on the phone. Nothing is sent anywhere, and there is no daily limit.")
            }

            if let note {
                Section { Text(note).font(.footnote).foregroundStyle(.secondary) }
            }
            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }

            if let fromPage {
                Section("What the page published") {
                    LabeledContent("Name", value: fromPage.name)
                    if fromPage.servings > 0 { LabeledContent("Serves", value: "\(fromPage.servings)") }
                    if fromPage.prep > 0 { LabeledContent("Prep", value: "\(fromPage.prep) min") }
                    if fromPage.cook > 0 { LabeledContent("Cook", value: "\(fromPage.cook) min") }
                }
                Section("Ingredients · \(fromPage.ingredients.count)") {
                    ForEach(Array(fromPage.ingredients.enumerated()), id: \.offset) { _, line in
                        let row = Amount(line)
                        LabeledContent(row.name.isEmpty ? line : row.name) {
                            Text(written(row)).foregroundStyle(.secondary)
                        }
                    }
                }
                if !fromPage.steps.isEmpty {
                    Section {
                        ForEach(Array(fromPage.steps.enumerated()), id: \.offset) { index, step in
                            (Text("\(index + 1). ") + IngredientMentions.text(
                                step, names: fromPage.ingredients.map { Amount($0).name })
                            ).font(.callout)
                        }
                        if let spokenSteps {
                            Button("Use the original wording", systemImage: "arrow.uturn.backward") {
                                self.fromPage?.steps = spokenSteps
                                self.spokenSteps = nil
                            }
                            .buttonStyle(.borderless)
                            .font(.footnote)
                        }
                    } header: {
                        HStack(spacing: 6) {
                            Text("Steps · \(fromPage.steps.count)")
                            // Which of the two you are looking at, said where it cannot be
                            // scrolled past: the steps themselves look much the same either way.
                            if tidying {
                                ProgressView().controlSize(.mini)
                                Text("· \(tidyProgress ?? "reading the video")…").textCase(nil)
                            } else if spokenSteps != nil {
                                Text("· rewritten here").textCase(nil)
                            } else if methodWasSpoken {
                                Text("· as spoken").textCase(nil)
                            }
                        }
                    } footer: {
                        if spokenSteps != nil {
                            Text("Rewritten on this phone from what was said out loud. Nothing was sent anywhere.")
                        } else if methodWasSpoken {
                            Text("Transcribed from the video and tidied by rule. Apple Intelligence did not rewrite these.")
                        }
                    }
                }
                Section {
                    Button("Save to this household", systemImage: "square.and.arrow.down") {
                        Task { await savePage(fromPage) }
                    }
                    .buttonStyle(.borderless)
                    if let saved {
                        Text(saved).font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }

            #if canImport(FoundationModels)
            if #available(iOS 26.0, *), fromPage == nil, let parsed {
                Section("What it read") {
                    LabeledContent("Name", value: parsed.name)
                    LabeledContent("Serves", value: "\(parsed.servings)")
                    if parsed.prepMinutes > 0 { LabeledContent("Prep", value: "\(parsed.prepMinutes) min") }
                    if parsed.cookMinutes > 0 { LabeledContent("Cook", value: "\(parsed.cookMinutes) min") }
                }
                Section("Ingredients · \(parsed.ingredientLines.count)") {
                    ForEach(Array(parsed.ingredientLines.enumerated()), id: \.offset) { _, line in
                        let row = Amount(line)
                        LabeledContent(row.name.isEmpty ? line : row.name) {
                            HStack(spacing: 6) {
                                if row.optional {
                                    Text("optional").font(.caption).foregroundStyle(.tertiary)
                                }
                                Text(written(row)).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                Section("Steps · \(parsed.steps.count)") {
                    ForEach(Array(parsed.steps.enumerated()), id: \.offset) { index, step in
                        Text("\(index + 1). \(step)").font(.callout)
                    }
                }
                Section {
                    Button("Save to this household", systemImage: "square.and.arrow.down") {
                        Task { await save(parsed) }
                    }
                    .buttonStyle(.borderless)
                    if let saved {
                        Text(saved).font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }
            #endif
        }
        .navigationTitle("Paste → recipe")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let structured, fromPage == nil {
                fromPage = structured
                note = "Read straight from the page's own recipe data — nothing was guessed."
                return
            }
            if let incoming, text.isEmpty {
                text = incoming
                await parse()
            }
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

    /// Asks the server to read a link. It knows about structured data and about TikTok, and
    /// being one implementation means the phone and the web agree on what a page says.
    private func importLink(_ link: String) async {
        guard let household = session.household?.id else { return }
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
                steps: (imported.instructions ?? "").split(separator: "\n").map(String.init)
            )
            note = "Read from the page itself — nothing was guessed."

            // Steps a publisher wrote are exact and stay exactly as they are. Steps pieced
            // together out of somebody narrating a video are a reconstruction, and reading
            // like one, so they get rewritten here on the phone.
            methodWasSpoken = imported.methodWasSpoken
            if imported.methodWasSpoken {
                note = "The recipe was spoken in the video, not written down. Reading it back…"
                await tidyTheMethod(said: imported.spokenLines ?? [])
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
        fromPage?.steps = steps
        if let current = fromPage?.name, Self.isAHook(current) {
            if let named = await dishName(from: steps) { fromPage?.name = named }
        }
        note = String(
            format: "Spoken in the video. %d of %d steps rewritten on this phone in %.0f s; the rest kept as they were said.",
            rewrote, steps.count, Date().timeIntervalSince(started)
        )
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

    /// The caption's first line, when the caption opened on a hook rather than a title.
    private static func isAHook(_ name: String) -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty || trimmed.hasSuffix("?") || trimmed.count < 3
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
    private static func explain(_ error: Error) -> String {
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
            let model = LanguageModelSession(
                instructions: """
                You turn a pasted recipe into structured data.

                Copy, do not interpret. Each ingredient line comes across exactly as written, \
                including its amount — do not convert fractions, do not split off the unit, do \
                not tidy the wording. Keep the steps as written. Never invent an ingredient, a \
                step or a time. If the text is not a recipe, return an empty name and no \
                ingredients rather than making something up.
                """
            )
            let reply = try await model.respond(to: input, generating: ParsedRecipe.self)
            parsedStore = reply.content
            let seconds = Date().timeIntervalSince(started)
            note = String(
                format: "Read %d characters → %d ingredients, %d steps in %.1f s%@",
                input.count,
                reply.content.ingredientLines.count,
                reply.content.steps.count,
                seconds,
                trimmed ? " · cut to \(Self.limit) characters" : ""
            )
            if reply.content.ingredientLines.isEmpty {
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

    private func savePage(_ recipe: StructuredRecipe) async {
        guard let household = session.household?.id else { return }
        let body: [String: Any] = [
            "name": recipe.name,
            "servings": max(1, recipe.servings),
            "section": "DINNER",
            "categories": [],
            "instructions": recipe.steps.joined(separator: "\n"),
            "prepTimeMinutes": recipe.prep,
            "cookTimeMinutes": recipe.cook,
            "ingredients": recipe.ingredients.compactMap { line -> [String: Any]? in
                let row = Amount(line)
                guard !row.name.isEmpty else { return nil }
                var out: [String: Any] = [
                    "ingredientName": row.name,
                    "quantity": row.quantity ?? 1,
                    "optional": row.optional,
                ]
                if let unit = row.unit { out["unit"] = unit }
                if let notes = row.notes { out["notes"] = notes }
                return out
            },
        ]
        do {
            let created = try await APIClient.shared.createRecipe(household: household, body: body)
            saved = "Saved as \(created.name)"
        } catch {
            self.error = error.localizedDescription
        }
    }

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private func save(_ recipe: ParsedRecipe) async {
        guard let household = session.household?.id else { return }
        let body: [String: Any] = [
            "name": recipe.name,
            "servings": max(1, recipe.servings),
            "section": "DINNER",
            "categories": [],
            "instructions": recipe.steps.joined(separator: "\n"),
            "prepTimeMinutes": recipe.prepMinutes,
            "cookTimeMinutes": recipe.cookMinutes,
            "ingredients": recipe.ingredientLines.compactMap { line -> [String: Any]? in
                let row = Amount(line)
                guard !row.name.isEmpty else { return nil }
                var out: [String: Any] = [
                    "ingredientName": row.name,
                    "quantity": row.quantity ?? 1,
                    "optional": row.optional,
                ]
                if let unit = row.unit { out["unit"] = unit }
                if let notes = row.notes { out["notes"] = notes }
                return out
            },
        ]
        do {
            let created = try await APIClient.shared.createRecipe(household: household, body: body)
            saved = "Saved as \(created.name)"
        } catch {
            self.error = error.localizedDescription
        }
    }
    #endif
}

#Preview("Paste") {
    NavigationStack { LabsPasteView(session: .preview) }
}
