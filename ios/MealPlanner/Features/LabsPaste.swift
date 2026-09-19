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
struct ParsedIngredient {
    @Guide(description: "How much, as a number. 1 when the text does not say.")
    var quantity: Double

    @Guide(description: "The unit only, like g, kg, ml, tbsp, tsp, cup, clove. Empty when there is none.")
    var unit: String

    @Guide(description: "The ingredient on its own, lowercase, with no amount and no preparation.")
    var name: String
}

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

    @Guide(description: "Every ingredient listed, in the order written.")
    var ingredients: [ParsedIngredient]

    @Guide(description: "The method, one entry per step, in order.")
    var steps: [String]
}
#endif

struct LabsPasteView: View {
    var session: Session
    /// Handed in by the share extension; typed by hand otherwise.
    var incoming: String?

    @State private var text = ""
    @State private var busy = false
    @State private var note: String?
    @State private var error: String?
    @State private var saved: String?

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

            #if canImport(FoundationModels)
            if #available(iOS 26.0, *), let parsed {
                Section("What it read") {
                    LabeledContent("Name", value: parsed.name)
                    LabeledContent("Serves", value: "\(parsed.servings)")
                    if parsed.prepMinutes > 0 { LabeledContent("Prep", value: "\(parsed.prepMinutes) min") }
                    if parsed.cookMinutes > 0 { LabeledContent("Cook", value: "\(parsed.cookMinutes) min") }
                }
                Section("Ingredients · \(parsed.ingredients.count)") {
                    ForEach(Array(parsed.ingredients.enumerated()), id: \.offset) { _, row in
                        LabeledContent(row.name) {
                            Text([amount(row.quantity), row.unit].filter { !$0.isEmpty }.joined(separator: " "))
                                .foregroundStyle(.secondary)
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

    private func amount(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(value)
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

                Use only what the text says. Never invent an ingredient, a step, an amount or \
                a time — if the text does not give one, use the stated default. Keep the \
                wording of the steps as written. If the text is not a recipe, return an empty \
                name and no ingredients rather than making something up.
                """
            )
            let reply = try await model.respond(to: input, generating: ParsedRecipe.self)
            parsedStore = reply.content
            let seconds = Date().timeIntervalSince(started)
            note = String(
                format: "Read %d characters → %d ingredients, %d steps in %.1f s%@",
                input.count,
                reply.content.ingredients.count,
                reply.content.steps.count,
                seconds,
                trimmed ? " · cut to \(Self.limit) characters" : ""
            )
            if reply.content.ingredients.isEmpty {
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
            "ingredients": recipe.ingredients.map { row in
                var out: [String: Any] = [
                    "ingredientName": row.name,
                    "quantity": row.quantity,
                    "optional": false,
                ]
                if !row.unit.isEmpty { out["unit"] = row.unit }
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
