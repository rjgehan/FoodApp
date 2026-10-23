import Foundation

/// Which shop is cheapest, by what one egg, lb or fl oz costs (UnitPrice.swift).
func unitPriceChecks() {
    typealias P = UnitPrice.Priced

    // The eggs that started it: 12 for $4.99 is dearer per egg than 18 for $6.49.
    let twelve = P(price: 4.99, quantity: 12, unit: "ct")
    let eighteen = P(price: 6.49, quantity: 18, unit: "eggs")
    check(UnitPrice.cheapest([twelve, eighteen]) == 1, "18 eggs for more is cheaper per egg than 12 for less")
    check(UnitPrice.cheapest([P(price: 4.99, quantity: 1, unit: "dozen"), eighteen]) == 1, "a dozen is 12 eggs")

    // No size is no comparison: Kings prints "OPN NAT EGGS BROWN 5.79".
    check(UnitPrice.cheapest([P(price: 4.99), P(price: 6.49)]) == nil, "two prices with no size are not compared")
    check(UnitPrice.cheapest([P(price: 4.99), eighteen]) == nil, "nor is one with a size against one without")
    check(UnitPrice.cheapest([P(price: 4.49, quantity: 1, unit: "carton"), P(price: 3.79, quantity: 1, unit: "carton")]) == nil,
          "a carton says nothing about how big it is")
    check(UnitPrice.cheapest([P(price: 7.98, quantity: 2), P(price: 3.99, quantity: 1)]) == nil,
          "a bare number is how many were bought, not how big")
    check(UnitPrice.measure(quantity: 24, unit: "pk") == UnitPrice.Measure(kind: .pieces, amount: 24), "a 24 pack is 24")
    check(UnitPrice.measure(quantity: 1, unit: "pack") == nil, "one pack is no size")

    // Weights and volumes in different units.
    let pound = P(price: 3.99, quantity: 1, unit: "lb")
    let ounces = P(price: 3.29, quantity: 12, unit: "oz")
    check(UnitPrice.cheapest([pound, ounces]) == 0, "a pound for $3.99 beats 12 oz for $3.29 ($4.39 a pound)")
    check(UnitPrice.cheapest([P(price: 4.49, quantity: 1, unit: "gal"), P(price: 2.99, quantity: 64, unit: "Fl. Oz")]) == 0,
          "a gallon against a half gallon, however the unit is spelled")
    check(UnitPrice.cheapest([pound, twelve]) == nil, "a weight and a count don't compare")
    check(UnitPrice.sharedKind([pound, twelve]) == nil && UnitPrice.sharedKind([pound, ounces]) == .weight, "the kind they share")

    // A tie is no winner; one shop is no comparison.
    check(UnitPrice.cheapest([P(price: 4, quantity: 12, unit: "ct"), P(price: 6, quantity: 18, unit: "ct")]) == nil, "the same per egg is a tie")
    check(UnitPrice.cheapest([eighteen]) == nil, "one shop has nothing to beat")

    // What each comes to, all told per the same unit.
    let rates = UnitPrice.rates([pound, ounces, P(price: 5)])
    check(abs((rates[0]?.price ?? 0) - 3.99) < 0.001 && rates[0]?.per == "lb", "a pound's price per lb")
    check(abs((rates[1]?.price ?? 0) - 4.3867) < 0.001 && rates[1]?.per == "lb", "12 oz told per lb beside it")
    check(rates[2] == nil, "no size, no rate")
    check(abs((UnitPrice.rates([eighteen])[0]?.price ?? 0) - 0.3606) < 0.001, "18 eggs for $6.49 is $0.36 each")
    check(UnitPrice.rates([ounces])[0]?.per == "oz", "per oz when nothing was in pounds")
    let grams = UnitPrice.rates([P(price: 2, quantity: 500, unit: "g")])[0]
    check(abs((grams?.price ?? 0) - 0.4) < 0.001 && grams?.per == "100 g", "per 100 g")
}
