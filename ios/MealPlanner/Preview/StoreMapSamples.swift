import Foundation
import MapKit

/// The store map on sample data, around Hoboken: Kings, priced by three households including this
/// one; ShopRite, by this one alone; ACME, only by others; and a farmers' market nobody has priced —
/// for previews and the Gallery.
enum StoreMapSamples {
    private static func price(_ name: String, _ price: Double, quantity: Double? = nil, unit: String? = nil,
                              brand: String? = nil, on day: String, sale: Bool = false, yours: Bool = true) -> StoreItemPrice {
        StoreItemPrice(ingredientId: UUID(), ingredientName: name, price: price, quantity: quantity, unit: unit,
                       observedOn: day, onSale: sale, source: "RECEIPT", brand: brand, yours: yours)
    }

    static let shops: [StorePrices] = [
        StorePrices(
            id: UUID(uuidString: "0D5A0000-0000-4000-8000-000000000201")!, name: "Kings Food Markets",
            lastPricedOn: "2026-10-18",
            prices: [
                price("baby spinach", 3.99, quantity: 5, unit: "oz", on: "2026-10-18"),
                price("bananas", 0.91, quantity: 1.32, unit: "lb", on: "2026-10-18"),
                price("chicken thighs", 12.86, quantity: 1.84, unit: "lb", on: "2026-10-18"),
                price("ground beef", 7.49, on: "2026-10-18", sale: true),
                price("lemons", 1.98, quantity: 2, on: "2026-10-18"),
                price("english breakfast tea", 4.99, quantity: 20, unit: "bags", brand: "Twinings", on: "2026-10-18"),
                price("oat milk", 5.49, brand: "Oatly", on: "2026-10-18"),
                price("salmon", 13.99, on: "2026-10-17", yours: false),
                price("sourdough", 6.99, on: "2026-10-11", yours: false),
            ],
            listTotal: 41.70, listPriced: 6, listCount: 9, households: 3, yours: true),
        StorePrices(
            id: UUID(uuidString: "0D5A0000-0000-4000-8000-000000000202")!, name: "ShopRite of Hoboken",
            lastPricedOn: "2026-10-04",
            prices: [
                price("bananas", 0.59, quantity: 1, unit: "lb", on: "2026-10-04"),
                price("oat milk", 3.79, on: "2026-10-04", sale: true),
                price("onions", 1.49, on: "2026-10-04"),
            ],
            listTotal: 5.87, listPriced: 3, listCount: 9, households: 1, yours: true),
        StorePrices(
            id: UUID(uuidString: "0D5A0000-0000-4000-8000-000000000203")!, name: "ACME Markets",
            lastPricedOn: "2026-10-15",
            prices: [
                price("baby spinach", 3.49, on: "2026-10-15", yours: false),
                price("bananas", 0.65, quantity: 1, unit: "lb", on: "2026-10-15", yours: false),
                price("ground beef", 6.99, on: "2026-10-09", sale: true, yours: false),
            ],
            listTotal: 11.13, listPriced: 3, listCount: 9, households: 2, yours: false),
    ]

    static let places: [StorePlace] = [
        StorePlace(name: "Kings Food Markets", latitude: 40.7448, longitude: -74.0284, address: "1212 Shipyard Ln"),
        StorePlace(name: "ShopRite", latitude: 40.7396, longitude: -74.0337, address: "900 Madison St"),
        StorePlace(name: "Hoboken Farmers Market", latitude: 40.7423, longitude: -74.0310, address: "Washington St"),
        StorePlace(name: "ACME Markets", latitude: 40.7505, longitude: -74.0263, address: "1501 Washington St"),
    ]

    private static let hoboken = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 40.7445, longitude: -74.0300),
        span: MKCoordinateSpan(latitudeDelta: 0.018, longitudeDelta: 0.018))

    static let map = StoreMapSample(shops: shops, places: places, region: hoboken)
    static let tapped = StoreMapSample(shops: shops, places: places, region: hoboken, selected: places[0].id)
    static let noPrices = StoreMapSample(shops: [], places: places, region: hoboken)
}
