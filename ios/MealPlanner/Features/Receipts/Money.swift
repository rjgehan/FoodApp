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
}

extension LastPrice {
    /**
     The item sheet's Price row: "Last paid $3.49 at Kings Food Markets · Oct 18 (on sale)",
     with "for 1.32 lb" after the price when it was weighed.
     */
    var line: String {
        var paid = "Last paid \(Money.text(price))"
        if let amount = ReceiptWords.amount(quantity: quantity, unit: unit) { paid += " for \(amount)" }
        if let store = storeName?.trimmingCharacters(in: .whitespaces), !store.isEmpty { paid += " at \(store)" }
        if let day = ReceiptWords.day(observedOn) { paid += " · \(day)" }
        if onSale == true { paid += " (on sale)" }
        return paid
    }
}
