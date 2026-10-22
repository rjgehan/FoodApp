import Foundation

/*
 What Apple Intelligence does for a scanned receipt on an iPhone that has it, and the rules every
 answer has to pass before it is used.

 A till prints its own shorthand — "KNGS GRK YGRT PLN" — and the server's reader can only match
 what it has seen before: a line somebody put right on an earlier receipt (REMEMBERED), a word
 match against the household's own ingredients (MATCHED), or what other households' receipts
 said (OTHERS, a guess). Everything else comes back with no name, to be typed by hand. On a phone
 with Apple Intelligence the model reads those lines instead, one short question each:

 - Which of the household's groceries is it? The grocery list first (ticked rows and the shop
   just finished at the top: that is what was bought), then the other names it knows, as a
   guided `.anyOf`, so the answer can only be one of them — or "something else".
 - Something else: what is it, as a plain grocery name ("greek yogurt"), or "not food". An
   answer that is empty, too long, wordy or the receipt's own words back again is thrown away.

 Lines the server remembered or matched are never asked about: a person or the household's own
 list settled those. A line with only another household's guess is asked, and the model's
 answer, if it has one, takes its place. Every line the model named is marked "Guess" on the
 review screen until somebody looks at it; saving sends the name as the line's ingredient, so
 the server's memory knows the line next time, with no model at all.

 Anything that fails — no model, a refusal, a throw, an answer off the list — leaves the line
 exactly as the server sent it, which is what a phone without Apple Intelligence shows.

 Foundation only, so ios/checks can test the rules on a Mac without the app or a model.
*/

/// What the model is asked. An implementation answers or throws; nothing here trusts it.
protocol ReceiptThinker: Sendable {
    /// Which of `options` the receipt line is, word for word: `ReceiptAssist.somethingElse`
    /// (always the last option) when it is none of them.
    func pickName(line: String, options: [String]) async throws -> String
    /// What the line is as a plain grocery name — one to four lowercase words — or
    /// `ReceiptAssist.notFood`.
    func nameIt(line: String) async throws -> String
}

/// One receipt line worth asking about.
struct ReceiptQuestion: Equatable, Sendable {
    /// Which line on the review screen it is about.
    let key: UUID
    /// As printed: "KNGS GRK YGRT PLN".
    let text: String
    /// Whose make, when the server read one ("Fage").
    var brand: String? = nil
    /// How much it was for, when the server read it ("5.3 oz").
    var size: String? = nil

    /// The line as the model is shown it: "KNGS GRK YGRT PLN (brand Fage, size 5.3 oz)".
    var line: String {
        let extras = [brand.map { "brand \($0)" }, size.map { "size \($0)" }].compactMap { $0 }
        return extras.isEmpty ? text : "\(text) (\(extras.joined(separator: ", ")))"
    }
}

/// What the model made of a line, once its answer has passed the checks.
enum ReceiptGuess: Equatable, Sendable {
    /// Counts as this grocery: one of the household's names, or a new plain one.
    case named(String)
    /// A bag, a deposit, a magazine: no price kept.
    case notFood
}

enum ReceiptAssist {
    /// The last choice offered with every list of names.
    static let somethingElse = "something else"
    /// What the model says for a line that is no food or drink.
    static let notFood = "not food"
    /// The household's names offered at most: the list first, so what was bought is in.
    static let maxOptions = 40
    /// The longest name kept, from the model or offered to it.
    static let longest = 40
    /// The most words a plain grocery name has ("extra virgin olive oil").
    static let mostWords = 4
    /// Lines asked at once: the model is on the phone, and two keeps the screen quick.
    static let atOnce = 2
    /// At most this many lines are asked about on one receipt.
    static let perReceipt = 30

    /// Where the server's own guess at a line came from (`DraftLine.ingredientSource`).
    enum Source {
        /// Somebody put this line right on an earlier receipt.
        static let remembered = "REMEMBERED"
        /// A word match against the household's own ingredients.
        static let matched = "MATCHED"
        /// What other households' receipts said: a guess.
        static let others = "OTHERS"
    }

    /// A line on the review screen, in plain values.
    struct Line: Equatable {
        let key: UUID
        let text: String
        var brand: String? = nil
        var size: String? = nil
        /// Food (`ITEM`), not a bag fee.
        var isFood = true
        /// What it counts as so far, if anything.
        var ingredientName: String? = nil
        /// Where that came from (`Source`), nil for no guess or a line from an older server.
        var source: String? = nil
    }

    /// One line's answer, as the questions finish: nil when the line stays as it was.
    struct Answer: Equatable, Sendable {
        let key: UUID
        let guess: ReceiptGuess?
    }

    // MARK: What to ask

    /**
     Whether to ask about a line: food, with words to go on, and either no name yet or only
     another household's guess. Never one the server remembered or matched.
     */
    static func worthAsking(_ line: Line) -> Bool {
        guard line.isFood, !trimmed(line.text).isEmpty else { return false }
        if line.source == Source.remembered || line.source == Source.matched { return false }
        let named = !trimmed(line.ingredientName ?? "").isEmpty
        return !named || line.source == Source.others
    }

    /// The questions for a receipt's lines, in order, `limit` at most.
    static func questions(for lines: [Line], limit: Int = perReceipt) -> [ReceiptQuestion] {
        let asked = lines.filter(worthAsking).prefix(max(0, limit))
        return asked.map { line in
            ReceiptQuestion(key: line.key, text: trimmed(line.text),
                            brand: nonEmpty(line.brand), size: nonEmpty(line.size))
        }
    }

    /**
     The names as the model is offered them: trimmed, each once whatever its capitals, none too
     long, the first `max` of them, and "something else" last.
     */
    static func options(from names: [String], max: Int = maxOptions) -> [String] {
        var out: [String] = []
        var seen = Set<String>()
        for name in names {
            let said = trimmed(name)
            let key = said.lowercased()
            guard !said.isEmpty, said.count <= longest, key != somethingElse, key != notFood,
                  seen.insert(key).inserted else { continue }
            out.append(said)
            if out.count == max { break }
        }
        return out + [somethingElse]
    }

    // MARK: Checking the answers

    /// The name the model picked, spelled as offered, if it is one of the options; nil for
    /// "something else" or anything it made up.
    static func pickedName(_ answer: String, from options: [String]) -> String? {
        let said = trimmed(answer)
        guard !said.isEmpty, said.lowercased() != somethingElse else { return nil }
        return options.first { $0 != somethingElse && $0.caseInsensitiveCompare(said) == .orderedSame }
    }

    /**
     A name the model gave, if it will do: lower case, no quotes or full stop, at most
     `mostWords` words and `longest` letters, with a letter in it, and not the receipt's own
     words back again (that is no name). "not food" is a line with no price.
     */
    static func acceptedName(_ answer: String, for text: String) -> ReceiptGuess? {
        var said = trimmed(answer).trimmingCharacters(in: CharacterSet(charactersIn: "\"“”'.!"))
        said = said.lowercased().split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        if said == notFood { return .notFood }
        let words = said.split(separator: " ")
        guard !said.isEmpty, said.count <= longest, words.count <= mostWords,
              said.rangeOfCharacter(from: .letters) != nil,
              said != somethingElse,
              said != trimmed(text).lowercased() else { return nil }
        return .named(said)
    }

    // MARK: Doing it

    /**
     One line: first which of the offered names it is; "something else" (or nothing to offer)
     asks for a plain name instead. Never throws: a failed question is a line left as it was.
     */
    static func guess(for question: ReceiptQuestion, options: [String], thinker: ReceiptThinker) async -> ReceiptGuess? {
        if options.contains(where: { $0 != somethingElse }) {
            guard let answer = try? await thinker.pickName(line: question.line, options: options) else { return nil }
            if let name = pickedName(answer, from: options) { return .named(name) }
            // Made up rather than "something else": not to be trusted with a second question.
            guard trimmed(answer).lowercased() == somethingElse else { return nil }
        }
        guard let said = try? await thinker.nameIt(line: question.line) else { return nil }
        return acceptedName(said, for: question.text)
    }

    /**
     Every question, `width` at a time, each answer handed on as it comes so the screen can fill
     lines in as it goes. Stopping the stream (the screen going) stops the questions.
     */
    static func guesses(for questions: [ReceiptQuestion], names: [String], thinker: ReceiptThinker,
                        width: Int = atOnce) -> AsyncStream<Answer> {
        let offered = options(from: names)
        let lanes = Swift.max(1, width)
        return AsyncStream { continuation in
            let work = Task {
                await withTaskGroup(of: Answer.self) { group in
                    var next = 0
                    while next < Swift.min(lanes, questions.count) {
                        let question = questions[next]
                        group.addTask {
                            Answer(key: question.key,
                                   guess: await ReceiptAssist.guess(for: question, options: offered, thinker: thinker))
                        }
                        next += 1
                    }
                    while let answer = await group.next() {
                        continuation.yield(answer)
                        if next < questions.count {
                            let question = questions[next]
                            group.addTask {
                                Answer(key: question.key,
                                       guess: await ReceiptAssist.guess(for: question, options: offered, thinker: thinker))
                            }
                            next += 1
                        }
                    }
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in work.cancel() }
        }
    }

    // MARK: Words

    private static func trimmed(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func nonEmpty(_ text: String?) -> String? {
        guard let text else { return nil }
        let said = trimmed(text)
        return said.isEmpty ? nil : said
    }
}

#if DEBUG
/**
 A stand-in for the model (`-mp_debug_ai fake`), for a Simulator on a Mac without Apple
 Intelligence: it answers the way a sensible model would — the offered name that shares a word
 with the line, else the line's last words as a name, "not food" for a bag — so the whole path
 (asking, checking, the Guess marks, saving the names) can be seen and tested without the model.
 */
struct StandInReceiptThinker: ReceiptThinker {
    func pickName(line: String, options: [String]) async throws -> String {
        let said = Set(words(line))
        return options.first { option in
            option != ReceiptAssist.somethingElse && words(option).contains { said.contains($0) }
        } ?? ReceiptAssist.somethingElse
    }

    func nameIt(line: String) async throws -> String {
        let all = words(line)
        if all.contains(where: { ["bag", "bags", "deposit", "fee"].contains($0) }) { return ReceiptAssist.notFood }
        // The shop's own label at the front ("KNGS", "ORG") is not what the thing is.
        let plain = all.filter { !["kngs", "kings", "org", "organic"].contains($0) }
        return plain.suffix(2).joined(separator: " ")
    }

    /// Lower case words of three letters or more, no digits, no brackets.
    private func words(_ text: String) -> [String] {
        text.lowercased()
            .split(whereSeparator: { !$0.isLetter })
            .map(String.init)
            .filter { $0.count >= 3 && $0 != "brand" && $0 != "size" }
    }
}
#endif
