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
                    Section("Steps · \(fromPage.steps.count)") {
                        ForEach(Array(fromPage.steps.enumerated()), id: \.offset) { index, step in
                            Text("\(index + 1). \(step)").font(.callout)
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

    /// Fetches a page and reduces it to its words. Crude on purpose: enough for a recipe
    /// site, and the alternative — sending the model a URL — is what produced an invented
    /// recipe in the first place.
    private static func readable(_ link: String) async -> String? {
        guard let url = URL(string: link) else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        // Some recipe sites serve a stub to anything that does not look like a browser.
        request.setValue(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
            forHTTPHeaderField: "User-Agent"
        )
        guard let (data, _) = try? await URLSession.shared.data(for: request),
              var html = String(data: data, encoding: .utf8) else { return nil }

        for block in ["script", "style", "noscript", "svg", "head"] {
            html = html.replacingOccurrences(
                of: "<\(block)[^>]*>.*?</\(block)>",
                with: " ",
                options: [.regularExpression, .caseInsensitive]
            )
        }
        html = html.replacingOccurrences(of: "<[^>]+>", with: "\n", options: .regularExpression)
        html = html.replacingOccurrences(of: "&nbsp;", with: " ")
        html = html.replacingOccurrences(of: "&amp;", with: "&")
        let lines = html
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        let text = lines.joined(separator: "\n")
        return text.count > 200 ? text : nil
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

        // The share extension marks "all I got was a link" with a 🔗. Fetching it here beats
        // handing the model an address, which it will answer by inventing a plausible recipe.
        if input.hasPrefix("\u{1F517}") {
            let link = String(input.dropFirst()).trimmingCharacters(in: .whitespaces)
            note = "Fetching \(link)…"
            guard let fetched = await Self.readable(link) else {
                error = "Could not read that page. Open it, select the recipe, and share the selection."
                return
            }
            input = fetched
            text = fetched
        }
        if input.count > Self.limit {
            input = String(input.prefix(Self.limit))
            trimmed = true
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
