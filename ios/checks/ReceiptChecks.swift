import Foundation

/*
 Checks for what Apple Intelligence may do on a scanned receipt (ReceiptAssist.swift), with a
 scripted stand-in for the model: that only lines the server could not name (or only guessed from
 other households) are asked about, that a pick off the list or a wordy, empty or echoed name is
 thrown away, that "not food" flips a line, that a refusal leaves a line as it was, and that no
 more than a couple of lines are asked at once.
*/

/// Answers from a script; anything unscripted is refused, as a guardrail would.
final class ScriptedReceiptReader: ReceiptThinker, @unchecked Sendable {
    var picks: [String: String] = [:]
    var names: [String: String] = [:]
    var offered: [[String]] = []
    var picked: [String] = []
    var named: [String] = []
    /// How many questions were being answered at once, at most.
    var mostAtOnce = 0
    private var busy = 0
    private let lock = NSLock()

    /// One more question being answered; what the script says to it.
    private func begin(_ record: () -> String?) -> String? {
        lock.lock()
        defer { lock.unlock() }
        busy += 1
        mostAtOnce = max(mostAtOnce, busy)
        return record()
    }

    private func end() {
        lock.lock()
        defer { lock.unlock() }
        busy -= 1
    }

    func pickName(line: String, options: [String]) async throws -> String {
        let answer = begin {
            picked.append(line)
            offered.append(options)
            return picks[line]
        }
        defer { end() }
        // Long enough for the others to start, if they were going to.
        try await Task.sleep(nanoseconds: 20_000_000)
        guard let answer else { throw Refused() }
        return answer
    }

    func nameIt(line: String) async throws -> String {
        let answer = begin {
            named.append(line)
            return names[line]
        }
        defer { end() }
        try await Task.sleep(nanoseconds: 20_000_000)
        guard let answer else { throw Refused() }
        return answer
    }
}

func receiptChecks() async {
    let yogurt = UUID(), thighs = UUID(), bananas = UUID(), milk = UUID(), bag = UUID(), spinach = UUID()
    let battery = UUID()
    let lines = [
        ReceiptAssist.Line(key: yogurt, text: "KNGS GRK YGRT PLN", size: "5.3 oz"),
        ReceiptAssist.Line(key: thighs, text: "BELL&EVANS THIGHS", ingredientName: "chicken thighs", source: "REMEMBERED"),
        ReceiptAssist.Line(key: bananas, text: "ORG BNNS", ingredientName: "bananas", source: "OTHERS"),
        ReceiptAssist.Line(key: milk, text: "STNYFLD WHL MLK", brand: "Stonyfield"),
        ReceiptAssist.Line(key: bag, text: "BAG FEE", isFood: false),
        ReceiptAssist.Line(key: spinach, text: "KNGS BBY SPNCH", ingredientName: "baby spinach", source: "MATCHED"),
        ReceiptAssist.Line(key: battery, text: "DURACELL AA 4PK"),
    ]

    // MARK: Which lines are asked about

    let questions = ReceiptAssist.questions(for: lines)
    check(questions.map(\.key) == [yogurt, bananas, milk, battery],
          "asks about lines with no name and other households' guesses, never remembered, matched or not food")
    check(questions.first?.line == "KNGS GRK YGRT PLN (size 5.3 oz)", "the model sees the line with its size")
    check(questions[2].line == "STNYFLD WHL MLK (brand Stonyfield)", "and its brand")
    check(ReceiptAssist.questions(for: lines, limit: 2).count == 2, "no more than the limit on one receipt")
    check(!ReceiptAssist.worthAsking(ReceiptAssist.Line(key: UUID(), text: "  ")), "a line with no words is not asked about")
    check(!ReceiptAssist.worthAsking(ReceiptAssist.Line(key: UUID(), text: "MANGO", ingredientName: "mango")),
          "a line an older server named, with no source, is left alone")

    // MARK: The names as offered

    let options = ReceiptAssist.options(from: ["Greek yogurt", " greek yogurt ", "", "bananas",
                                               String(repeating: "x", count: 41), "Something else"])
    check(options == ["Greek yogurt", "bananas", ReceiptAssist.somethingElse],
          "names offered once each, blanks and long ones dropped, something else last")
    check(ReceiptAssist.options(from: (1...60).map { "food \($0)" }).count == ReceiptAssist.maxOptions + 1,
          "no more than the most names, plus something else")
    check(ReceiptAssist.pickedName("greek yogurt", from: options) == "Greek yogurt", "a pick is spelled as offered")
    check(ReceiptAssist.pickedName(ReceiptAssist.somethingElse, from: options) == nil, "something else is no pick")
    check(ReceiptAssist.pickedName("yoghurt", from: options) == nil, "a made-up pick is no pick")

    // MARK: A name the model gave

    check(ReceiptAssist.acceptedName(" \"Greek Yogurt.\" ", for: "KNGS GRK YGRT PLN") == .named("greek yogurt"),
          "a plain name, lower case, quotes and full stop gone")
    check(ReceiptAssist.acceptedName("Not food", for: "BAG FEE") == .notFood, "not food is a line with no price")
    check(ReceiptAssist.acceptedName("", for: "X") == nil, "nothing said is no name")
    check(ReceiptAssist.acceptedName("organic whole milk from a local farm", for: "MLK") == nil, "a sentence is no name")
    check(ReceiptAssist.acceptedName(String(repeating: "a", count: 41), for: "X") == nil, "too long is no name")
    check(ReceiptAssist.acceptedName("kngs grk ygrt pln", for: "KNGS GRK YGRT PLN") == nil, "the receipt's words back are no name")
    check(ReceiptAssist.acceptedName("42", for: "X") == nil, "a number is no name")

    // MARK: Asking

    do {
        let model = ScriptedReceiptReader()
        model.picks["KNGS GRK YGRT PLN (size 5.3 oz)"] = "greek yogurt"
        model.picks["ORG BNNS"] = ReceiptAssist.somethingElse
        model.names["ORG BNNS"] = "Organic bananas"
        model.picks["STNYFLD WHL MLK (brand Stonyfield)"] = "Stonyfield whole milk yogurt"   // not on the list
        model.picks["DURACELL AA 4PK"] = ReceiptAssist.somethingElse
        model.names["DURACELL AA 4PK"] = "not food"

        // Every line answered, and the guesses among them (a line left alone answers nil).
        var answered = Set<UUID>()
        var guessed: [UUID: ReceiptGuess] = [:]
        let stream = ReceiptAssist.guesses(for: questions, names: ["bananas", "Greek yogurt"], thinker: model)
        for await answer in stream {
            answered.insert(answer.key)
            if let guess = answer.guess { guessed[answer.key] = guess }
        }
        check(answered.count == 4, "every question answered, one way or another")
        check(guessed[yogurt] == ReceiptGuess.named("Greek yogurt"), "a pick from the list is the household's own name")
        check(guessed[bananas] == ReceiptGuess.named("organic bananas"), "something else asks for a plain name")
        check(answered.contains(milk) && guessed[milk] == nil, "a pick that is not on the list leaves the line alone")
        check(!model.named.contains("STNYFLD WHL MLK (brand Stonyfield)"), "and is not trusted with a second question")
        check(guessed[battery] == ReceiptGuess.notFood, "not food flips a line")
        check(model.offered.allSatisfy { $0.last == ReceiptAssist.somethingElse }, "every list offers something else")
        check(model.mostAtOnce <= ReceiptAssist.atOnce, "no more than a couple asked at once")
        check(model.mostAtOnce == ReceiptAssist.atOnce, "but more than one, so a long receipt is quick")
    }

    do {
        // A model that refuses everything changes nothing.
        var answers: [ReceiptGuess?] = []
        for await answer in ReceiptAssist.guesses(for: questions, names: ["bananas"], thinker: ScriptedReceiptReader()) {
            answers.append(answer.guess)
        }
        check(answers.count == questions.count && answers.allSatisfy { $0 == nil }, "a refusal leaves every line as it was")
    }

    do {
        // Nothing on the list to offer: straight to a plain name.
        let model = ScriptedReceiptReader()
        model.names["KNGS GRK YGRT PLN (size 5.3 oz)"] = "greek yogurt"
        let guess = await ReceiptAssist.guess(for: questions[0], options: ReceiptAssist.options(from: []), thinker: model)
        check(guess == .named("greek yogurt") && model.picked.isEmpty, "with no names to offer, it is asked for one")
    }
}
