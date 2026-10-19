import Foundation

/**
 Money as the phone's own currency writes it — "$3.49", "$86" — and back again from what somebody
 typed. The household shops in dollars, and a US phone already says so, so nothing here names a
 currency except as the fallback.
 */
enum Money {
    /// The phone's currency, "USD" when it will not say.
    static var code: String { Locale.current.currency?.identifier ?? "USD" }

    /// "$", for in front of a price field.
    static var symbol: String { Locale.current.currencySymbol ?? "$" }

    /// "$3.49".
    static func text(_ value: Double) -> String {
        value.formatted(.currency(code: code))
    }

    /// "$86" — a rough total, where the cents would only pretend to be exact.
    static func whole(_ value: Double) -> String {
        value.formatted(.currency(code: code).precision(.fractionLength(0)))
    }

    /// "≈ $3.49": a last-paid price on the list, which is a guess at today's.
    static func about(_ value: Double) -> String {
        "≈ " + text(value)
    }

    /// "3.49", for a field to start from.
    static func field(_ value: Double) -> String {
        String(format: "%.2f", value)
    }

    /**
     What somebody typed as a price: "3.49", "$3.49", " 3 ", "3,49". Nil for anything that is not
     a sensible amount — negative, or more than any one thing in a supermarket costs.
     */
    static func parse(_ typed: String) -> Double? {
        var cleaned = typed
            .replacingOccurrences(of: symbol, with: "")
            .replacingOccurrences(of: "$", with: "")
            .filter { !$0.isWhitespace }
        if !cleaned.contains("."), cleaned.filter({ $0 == "," }).count == 1 {
            cleaned = cleaned.replacingOccurrences(of: ",", with: ".")
        }
        guard let value = Double(cleaned), value >= 0, value < 10_000 else { return nil }
        return (value * 100).rounded() / 100
    }

    /**
     A price for a request body: exactly two places, as a decimal rather than a binary double, so
     3.49 goes to the server as 3.49 and not 3.4900000000000002.
     */
    static func json(_ value: Double) -> NSDecimalNumber {
        NSDecimalNumber(string: field(value))
    }

    /**
     Any other amount for a request body — a weight, a count, a price per lb — as the shortest
     decimal that reads back as the same double ("1.32", "0.333"), not a binary expansion. The
     server rounds it to the places it keeps.
     */
    static func decimal(_ value: Double) -> NSDecimalNumber {
        let number = NSDecimalNumber(string: "\(value)")
        return number.decimalValue.isNaN ? NSDecimalNumber(value: value) : number
    }
}

/// The dates receipts and prices are told by.
enum ReceiptWords {
    /// "Oct 18" from "2026-10-18", with the year only when it is not this one.
    static func day(_ iso: String?) -> String? {
        guard let iso, let date = Day.date(String(iso.prefix(10))) else { return nil }
        let sameYear = Calendar.current.isDate(date, equalTo: .now, toGranularity: .year)
        let monthDay = Date.FormatStyle.dateTime.month(.abbreviated).day()
        return date.formatted(sameYear ? monthDay : monthDay.year())
    }

    /// "1.32 lb", "2" — how much a price was for, or nil for one of something.
    static func amount(quantity: Double?, unit: String?) -> String? {
        let unit = unit?.trimmingCharacters(in: .whitespaces)
        let hasUnit = !(unit ?? "").isEmpty
        guard let quantity, quantity != 1 || hasUnit else { return nil }
        return [GroceryWords.number(quantity), hasUnit ? unit : nil].compactMap { $0 }.joined(separator: " ")
    }

    /// "Twinings, 20 bags", "Twinings", "20 bags" — whose and how much a price was for, or nil.
    static func what(brand: String?, quantity: Double?, unit: String?) -> String? {
        let brand = brand?.trimmingCharacters(in: .whitespaces)
        let parts = [brand?.isEmpty == false ? brand : nil, amount(quantity: quantity, unit: unit)].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }

    private static let typedAmount = try? NSRegularExpression(
        pattern: #"^(\d+\s+\d+/\d+|\d+/\d+|\d*[.,]?\d+)\s*(.*)$"#)

    /**
     How much somebody typed — "20 bags", "5oz", "1.32 lb", "1/2 lb", "1 1/2 cups", "2" — as a
     quantity and its unit (nil for each), the unit as typed but lower case. An empty box is
     (nil, nil): one of something. Nil for what does not start with a number, or a number that
     is no amount (nought, or more than the server keeps).
     */
    static func amount(from typed: String) -> (quantity: Double?, unit: String?)? {
        let text = typed.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return (nil, nil) }
        let whole = NSRange(text.startIndex..., in: text)
        guard let match = typedAmount?.firstMatch(in: text, range: whole),
              let numberRange = Range(match.range(at: 1), in: text),
              let unitRange = Range(match.range(at: 2), in: text) else { return nil }
        var quantity = 0.0
        for part in text[numberRange].split(separator: " ") {
            let pieces = part.split(separator: "/")
            if pieces.count == 2, let top = Double(pieces[0]), let bottom = Double(pieces[1]), bottom > 0 {
                quantity += top / bottom
            } else if let value = Double(part.replacingOccurrences(of: ",", with: ".")) {
                quantity += value
            } else {
                return nil
            }
        }
        guard quantity > 0, quantity < 99_999 else { return nil }
        let unit = text[unitRange].trimmingCharacters(in: .whitespaces).lowercased()
        return ((quantity * 1000).rounded() / 1000, unit.isEmpty ? nil : String(unit.prefix(20)))
    }
}

extension LastPrice {
    /**
     The item sheet's Price row: "Last paid $3.49 at Kings Food Markets · Oct 18 (on sale)",
     with "for Twinings, 20 bags" after the price when somebody said whose or how much.
     */
    var line: String {
        var paid = "Last paid \(Money.text(price))"
        if let what = ReceiptWords.what(brand: brand, quantity: quantity, unit: unit) { paid += " for \(what)" }
        if let store = storeName?.trimmingCharacters(in: .whitespaces), !store.isEmpty { paid += " at \(store)" }
        if let day = ReceiptWords.day(observedOn) { paid += " · \(day)" }
        if onSale == true { paid += " (on sale)" }
        return paid
    }
}
