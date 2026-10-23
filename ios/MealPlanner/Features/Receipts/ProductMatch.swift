import Foundation

/*
 What a product's barcode says about a receipt: which line it is, and what that line counts as.
 The rules behind Scan its barcode (a line's sheet) and Scan items (the check screen), in plain
 values.

 Which line. A till prints its own shorthand and the catalogue prints the packet's words, so the
 two are compared word by word. A word off the receipt stands for a word of the product when it
 is the start of it ("CHOB" for chobani, three letters at least), or when its letters come in
 order inside it, beginning with the same letter — tills drop the vowels, so "GRK" is greek,
 "YGRT" yogurt and "STNYFLD" stonyfield. Numbers and sizes ("5OZ", "2", "LB", "CT") say how much,
 not what, and are left out. A line scores the share of its words that stand for one of the
 product's; a tie goes to the line whose matched words are longer, then to a line nobody has
 named yet (or only guessed at), then to the one higher on the receipt. A line with no word
 matched is no match at all.

 What it counts as. The household's own name for it when one fits: every word of the name is in
 the product's name or brand, plurals either way ("chickpeas" for "Chickpea"), and of those that
 fit, the longest ("greek yogurt" over "yogurt"). Otherwise the product's own name without the
 brand or the size, in lower case ("Chobani Greek Yogurt Plain 32 oz" → "greek yogurt plain").
 Apple Intelligence, when the phone has it, is asked in between (ReceiptBarcodes.swift).

 Foundation only, so ios/checks can test the rules on a Mac without the app.
*/
enum ProductMatch {
    /// Words on a till line, or in a product's name, that say how much rather than what.
    static let sizeWords: Set<String> = ["oz", "lb", "lbs", "ct", "pk", "gal", "fl", "qt", "pt",
                                         "ml", "kg", "g", "l", "ea", "pc", "pcs", "cnt"]

    /// A receipt line a product might be.
    struct Candidate: Equatable {
        /// Which line on the review screen it is.
        let key: UUID
        /// As printed: "CHOB GRK YGRT".
        let text: String
        /// Nobody has named it yet, or it only has a guess: what a scan is most likely for.
        var open = true
    }

    /// How well a line fits a product.
    struct Scored: Equatable {
        let key: UUID
        /// The share of the line's words that stand for one of the product's, 0 to 1.
        let score: Double
        /// Letters in the line's matched words, which settles a tie.
        let letters: Int
    }

    // MARK: Which line

    /// Lower case words, split at anything that is not a letter or a digit.
    static func words(_ text: String) -> [String] {
        text.lowercased()
            .split(whereSeparator: { !$0.isLetter && !$0.isNumber })
            .map(String.init)
    }

    /// The words of a till line worth matching: none with a digit ("5OZ", "2"), no sizes ("LB"),
    /// nothing of one letter.
    static func lineWords(_ text: String) -> [String] {
        words(text).filter { word in
            word.count >= 2 && !word.contains(where: { $0.isNumber }) && !sizeWords.contains(word)
        }
    }

    /**
     Whether a till's word stands for a product's word: the start of it (three letters at least),
     or its letters in order inside it, beginning with the same letter — "grk" for greek.
     */
    static func abbreviates(_ short: String, _ long: String) -> Bool {
        guard let first = short.first, first == long.first, short.count <= long.count else { return false }
        if short.count >= 3 && long.hasPrefix(short) { return true }
        var rest = long[...]
        for letter in short {
            guard let at = rest.firstIndex(of: letter) else { return false }
            rest = rest[rest.index(after: at)...]
        }
        return true
    }

    /// One line against a product's words: the share of its words matched, and their letters.
    static func score(line: String, product: [String]) -> (score: Double, letters: Int) {
        let mine = lineWords(line)
        guard !mine.isEmpty else { return (0, 0) }
        let matched = mine.filter { word in product.contains { abbreviates(word, $0) } }
        return (Double(matched.count) / Double(mine.count), matched.reduce(0) { $0 + $1.count })
    }

    /// Every line, best first, for a product called `name` made by `brand`.
    static func ranked(_ lines: [Candidate], name: String, brand: String) -> [Scored] {
        let product = words(name + " " + brand)
        var entries: [RankEntry] = []
        for (offset, line) in lines.enumerated() {
            let fit = score(line: line.text, product: product)
            let scored = Scored(key: line.key, score: fit.score, letters: fit.letters)
            entries.append(RankEntry(order: offset, open: line.open, scored: scored))
        }
        return entries.sorted(by: rankedBefore).map(\.scored)
    }

    /// A line with where it stood on the receipt, while the lines are put in order.
    private struct RankEntry {
        let order: Int
        let open: Bool
        let scored: Scored
    }

    /// Best first: the higher score, then more letters matched, then a line nobody has named yet,
    /// then the one higher on the receipt.
    private static func rankedBefore(_ a: RankEntry, _ b: RankEntry) -> Bool {
        if a.scored.score != b.scored.score { return a.scored.score > b.scored.score }
        if a.scored.letters != b.scored.letters { return a.scored.letters > b.scored.letters }
        if a.open != b.open { return a.open }
        return a.order < b.order
    }

    /// The line the product most looks like, or nil when no line has a word of it.
    static func best(_ lines: [Candidate], name: String, brand: String) -> UUID? {
        guard let top = ranked(lines, name: name, brand: brand).first, top.score > 0 else { return nil }
        return top.key
    }

    // MARK: What it counts as

    /// The same word, singular or plural: tomato / tomatoes, berry / berries, egg / eggs.
    static func sameWord(_ a: String, _ b: String) -> Bool {
        if a == b { return true }
        let (short, long) = a.count <= b.count ? (a, b) : (b, a)
        if long == short + "s" || long == short + "es" { return true }
        return short.hasSuffix("y") && long == String(short.dropLast()) + "ies"
    }

    /**
     The household's name for a product, if one fits: every word of it in the product's name or
     brand (plurals either way), the longest of those that do — most words, then most letters.
     */
    static func choice(among names: [String], name: String, brand: String) -> String? {
        let product = words(name + " " + brand)
        var best: (name: String, words: Int, letters: Int)?
        for option in names {
            let mine = words(option)
            guard !mine.isEmpty,
                  mine.allSatisfy({ word in product.contains { sameWord(word, $0) } }) else { continue }
            let letters = mine.reduce(0) { $0 + $1.count }
            if let current = best, (current.words, current.letters) >= (mine.count, letters) { continue }
            best = (option, mine.count, letters)
        }
        return best?.name
    }

    /**
     The product's own name as a grocery name: lower case, without the brand's words or the size
     ("400g", "16 oz"), and the punctuation off each word. Its name in lower case if that leaves
     nothing ("Nutella" by Nutella).
     */
    static func plainName(_ name: String, brand: String) -> String {
        let brandWords = Set(words(brand))
        var kept: [String] = []
        var afterNumber = false
        for piece in name.split(whereSeparator: { $0.isWhitespace }) {
            let token = piece.trimmingCharacters(in: CharacterSet.alphanumerics.inverted).lowercased()
            let parts = words(token)
            let followsNumber = afterNumber
            afterNumber = false
            guard !parts.isEmpty else { continue }
            if parts.allSatisfy({ brandWords.contains($0) }) { continue }
            if token.range(of: #"^\d+([.,]\d+)?[a-z]*$"#, options: .regularExpression) != nil {
                afterNumber = true
                continue
            }
            if followsNumber && sizeWords.contains(token) { continue }
            kept.append(token)
        }
        let plain = kept.joined(separator: " ")
        return plain.isEmpty ? words(name).joined(separator: " ") : plain
    }
}
