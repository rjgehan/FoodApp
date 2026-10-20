import CoreLocation
import MapKit
import SwiftUI

/**
 Explore → Grocery stores: a map of the grocery stores around you (Apple Maps' own, so nothing to
 sign up for), with every chain anybody on this server has prices from picked out by what your list
 would come to there — "≈ $42" on the pin. Tap a store for where it is and the way there, and, for
 one with prices, every price paid there.

 The prices are everybody's on the server, pooled by chain: what their receipts said and what they
 typed on a grocery row with a shop, the newest for each thing. Whose a price was is never shown
 (the server does not send it), only how many households have priced there and which prices are
 yours. A store nobody has a receipt from is on the map all the same, plainly, with a word on how
 its prices get there. Shops are matched to the map by name (`StoreMatch`), since a receipt names
 the chain and the chain sets the prices.

 The map searches where it opens — on you, when Location is allowed — and again when you ask after
 moving it ("Search this area"), not on every drag. The household's own shops are searched for by
 name as well, so a Kings that Apple files under something other than a grocer still shows, and
 every branch a receipt was linked to (by anyone) is pinned where it stands.

 What Apple calls a food market and is not one — the soup kitchen down the street — the household
 hides from its map (Not a store), on every phone in the house, and can show again.
 */
struct StoreMapScreen: View {
    var session: Session
    /// Previews and the Gallery: these shops and places, with no server, search or location.
    var sample: StoreMapSample?

    @State private var locator = StoreLocator()
    @State private var position: MapCameraPosition = .userLocation(fallback: .automatic)
    /// What the map shows now, and what the places on it were found for.
    @State private var region: MKCoordinateRegion?
    @State private var searched: MKCoordinateRegion?
    @State private var places: [StorePlace] = []
    @State private var shops: [StorePrices] = []
    @State private var selection: String?
    @State private var searching = false
    @State private var error: String?
    @State private var sheet: StoreSheet?
    /// The places the household took off its map, and the one just hidden, for Undo.
    @State private var hidden: [HiddenPlace] = []
    @State private var justHidden: HiddenPlace?

    private enum StoreSheet: Identifiable {
        case shops
        case prices(StorePrices, StorePlace?)
        case hidden

        var id: String {
            switch self {
            case .shops: return "shops"
            case .prices(let shop, let place): return "prices-\(shop.id)-\(place?.id ?? "")"
            case .hidden: return "hidden"
            }
        }
    }

    /// The places found, less the ones the household hid.
    private var shown: [StorePlace] { places.filter { !hidden.hide($0) } }

    private var selected: StorePlace? { shown.first { $0.id == selection } }

    /// Far enough from where the places were found that they may no longer be the ones around.
    private var moved: Bool {
        guard let region, let searched else { return false }
        let across = max(searched.span.latitudeDelta, searched.span.longitudeDelta)
        let shift = max(abs(region.center.latitude - searched.center.latitude),
                        abs(region.center.longitude - searched.center.longitude))
        let zoom = region.span.latitudeDelta / max(searched.span.latitudeDelta, 0.0001)
        return shift > across * 0.35 || zoom > 2 || zoom < 0.4
    }

    var body: some View {
        Map(position: $position, selection: $selection) {
            UserAnnotation()
            ForEach(shown) { place in
                if let shop = StoreMatch.shop(named: place.name, in: shops), !shop.prices.isEmpty {
                    Annotation(place.name, coordinate: place.coordinate, anchor: .bottom) {
                        PricePin(text: pinText(shop), isOn: selection == place.id)
                    }
                    .tag(place.id)
                } else {
                    // A store with no prices here: a quiet dot, named once tapped, so a street of
                    // delis does not bury the shops that have something to say.
                    Annotation(place.name, coordinate: place.coordinate) {
                        StoreDot(isOn: selection == place.id)
                    }
                    .annotationTitles(selection == place.id ? .visible : .hidden)
                    .tag(place.id)
                }
            }
        }
        // Apple's own shops, cafés and petrol stations would sit under the pins and hide them.
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        .mapControls {
            MapUserLocationButton()
            MapCompass()
        }
        .onMapCameraChange(frequency: .onEnd) { context in
            region = context.region
            // Until it is moved by hand the map follows you, and its first stops (wherever it fell
            // back to, before your location came in) are on the way to you: each is searched, so
            // the stores are there when it arrives, with no "Search this area" to tap.
            if searched == nil || (position.followsUserLocation && moved) { Task { await search() } }
        }
        .overlay(alignment: .top) {
            if moved && !searching && sample == nil {
                Button { Task { await search() } } label: {
                    Label("Search this area", systemImage: "magnifyingglass")
                }
                .buttonStyle(.kitchen(.dark, size: .small, fill: false))
                .padding(.top, 8)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.2), value: moved)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            bottomCard
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
        }
        .centeredTitle("Grocery stores")
        .textBackButton("Explore")
        .toolbar(.hidden, for: .tabBar)
        .sheet(item: $sheet) { which in
            switch which {
            case .shops:
                YourShopsSheet(shops: shops) { shop in
                    sheet = .prices(shop, nil)
                }
            case .prices(let shop, let place):
                StorePricesSheet(shop: shop, place: place, distance: place.flatMap(distance(to:)))
            case .hidden:
                HiddenPlacesSheet(hidden: hidden) { place in Task { await show(place) } }
            }
        }
        .task { await start() }
    }

    // MARK: - The card along the bottom

    @ViewBuilder private var bottomCard: some View {
        if let place = selected {
            placeCard(place)
        } else {
            overview
        }
    }

    /// A store tapped on the map: where it is, how far, and — one of yours — what it costs there.
    private func placeCard(_ place: StorePlace) -> some View {
        let shop = StoreMatch.shop(named: place.name, in: shops)
        return Card(padding: 16, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Tile(shop?.prices.isEmpty == false ? "cart.fill" : "cart", tone: shop?.prices.isEmpty == false ? .accent : .sky, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(place.name).font(.system(size: 17, weight: .semibold)).foregroundStyle(Palette.text)
                    let whereabouts = [place.address, distance(to: place)].compactMap { $0 }.joined(separator: " · ")
                    if !whereabouts.isEmpty {
                        Text(whereabouts).font(.system(size: 13)).foregroundStyle(Palette.muted).lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Button { selection = nil } label: {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.muted)
                        .frame(width: 30, height: 30)
                        .background(Palette.surface2, in: Circle())
                }
                .buttonStyle(PressFade())
                .accessibilityLabel("Close \(place.name)")
            }
            if let shop, !shop.prices.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text(StoreWords.list(shop)).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
                    Text(StoreWords.priced(shop)).font(.system(size: 13)).foregroundStyle(Palette.muted)
                }
            } else {
                Text("No prices from here yet. Scan the receipt next time you shop here, and what it cost shows here for everyone on this server.")
                    .font(.system(size: 13)).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 10) {
                let priced = shop?.prices.isEmpty == false
                if let shop, priced {
                    Button { sheet = .prices(shop, place) } label: { Label("Prices here", systemImage: "list.bullet") }
                        .buttonStyle(.kitchen(.primary, size: .small))
                }
                if let item = place.mapItem {
                    Button {
                        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDefault])
                    } label: { Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond") }
                        .buttonStyle(.kitchen(.secondary, size: .small))
                }
                // A shop with prices is seldom the mistake; its way off the map is tucked away.
                if priced {
                    Spacer(minLength: 0)
                    Menu {
                        Button("Not a store — hide it", systemImage: "eye.slash", role: .destructive) {
                            Task { await hide(place) }
                        }
                    } label: {
                        Image(systemName: "ellipsis").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.muted)
                            .frame(width: 36, height: 36)
                            .background(Palette.surface2, in: Circle())
                    }
                    .accessibilityLabel("More for \(place.name)")
                } else {
                    Button { Task { await hide(place) } } label: { Label("Not a store", systemImage: "eye.slash") }
                        .buttonStyle(.kitchen(.secondary, size: .small))
                        .accessibilityHint("Hides it from the map for everyone in your household")
                }
            }
        }
        .shadow(color: Palette.shadow, radius: 12, y: 4)
    }

    /// Nothing tapped: the household's shops, how to see stores near you, or how prices get here.
    private var overview: some View {
        let priced = shops.filter { !$0.prices.isEmpty }
        return VStack(spacing: 10) {
            if locator.refused && sample == nil {
                NoteBox("Turn on Location for Waxwing to see the stores near you. Settings → Waxwing → Location.",
                        tone: .mustard, systemImage: "location.slash")
            }
            if let error {
                NoteBox(error, tone: .mustard, systemImage: "exclamationmark.triangle")
            }
            if let justHidden {
                HStack(spacing: 10) {
                    Image(systemName: "eye.slash").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.muted)
                    Text("Hid \(justHidden.name) for your household")
                        .font(.system(size: 14)).foregroundStyle(Palette.text).lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button("Undo") { Task { await show(justHidden) } }
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Palette.accentInk)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .cardSurface()
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            Button { if !priced.isEmpty { sheet = .shops } } label: {
                HStack(spacing: 12) {
                    Tile("tag", tone: .herb, size: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(priced.isEmpty ? "No prices yet" : "Shops with prices")
                            .font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.text)
                        Text(priced.isEmpty
                             ? "Nobody here has scanned a receipt yet. Scan one after you shop (Groceries → ••• → Scan a receipt), and its prices show here for everyone."
                             : priced.prefix(2).map { "\($0.name) \(pinText($0))" }.joined(separator: " · "))
                            .font(.system(size: 13)).foregroundStyle(Palette.muted)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if searching {
                        ProgressView().controlSize(.small)
                    } else if !priced.isEmpty {
                        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
                    }
                }
                .padding(14)
                .cardSurface()
            }
            .buttonStyle(PressFade())
            .disabled(priced.isEmpty)
            if !hidden.isEmpty && justHidden == nil {
                Button { sheet = .hidden } label: {
                    Text(hidden.count == 1 ? "1 place hidden · Show it" : "\(hidden.count) places hidden · Show them")
                        .font(.system(size: 13, weight: .medium)).foregroundStyle(Palette.muted)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(.regularMaterial, in: Capsule())
                }
                .buttonStyle(PressFade())
            }
        }
        .shadow(color: Palette.shadow, radius: 12, y: 4)
        .animation(.snappy(duration: 0.2), value: justHidden)
    }

    /// What a pin says: the list at this shop, or how many prices there are when the list has none.
    private func pinText(_ shop: StorePrices) -> String {
        shop.listPriced > 0 ? Money.about(shop.listTotal).replacingOccurrences(of: ".00", with: "")
            : "\(shop.prices.count) \(shop.prices.count == 1 ? "price" : "prices")"
    }

    private func distance(to place: StorePlace) -> String? {
        guard let here = locator.location else { return nil }
        let there = CLLocation(latitude: place.latitude, longitude: place.longitude)
        return StoreWords.distance(here.distance(from: there))
    }

    // MARK: - Behaviour

    private func start() async {
        if let sample {
            shops = sample.shops
            places = sample.places
            position = .region(sample.region)
            selection = sample.selected
            return
        }
        locator.start()
        async let hiddenNow: Void = loadHidden()
        await loadShops()
        await hiddenNow
    }

    private func loadHidden() async {
        guard let household = session.household?.id,
              let found = try? await APIClient.shared.hiddenPlaces(household: household) else { return }
        hidden = found
    }

    /**
     Off the map at once, for the household; Undo for a few seconds. A server that will not keep it
     puts it back, with why.
     */
    private func hide(_ place: StorePlace) async {
        selection = nil
        let pending = HiddenPlace(id: UUID(), name: place.name, address: place.address,
                                  latitude: place.latitude, longitude: place.longitude)
        hidden.insert(pending, at: 0)
        justHidden = pending
        guard sample == nil, let household = session.household?.id else { return clearUndo(pending) }
        do {
            let kept = try await APIClient.shared.hidePlace(household: household, place)
            hidden = hidden.map { $0.id == pending.id ? kept : $0 }
            if justHidden?.id == pending.id { justHidden = kept }
            clearUndo(kept)
        } catch {
            hidden.removeAll { $0.id == pending.id }
            if justHidden?.id == pending.id { justHidden = nil }
            self.error = "Couldn't hide \(place.name). \(error.localizedDescription)"
        }
    }

    private func clearUndo(_ place: HiddenPlace) {
        Task {
            try? await Task.sleep(for: .seconds(6))
            if justHidden?.id == place.id { justHidden = nil }
        }
    }

    /// Back on the map; hidden again if the server says no.
    private func show(_ place: HiddenPlace) async {
        hidden.removeAll { $0.id == place.id }
        if justHidden?.id == place.id { justHidden = nil }
        guard sample == nil, let household = session.household?.id else { return }
        do {
            try await APIClient.shared.showPlace(household: household, id: place.id)
        } catch {
            hidden.insert(place, at: 0)
            self.error = "Couldn't show \(place.name) again. \(error.localizedDescription)"
        }
    }

    private func loadShops() async {
        guard let household = session.household?.id else { return }
        do {
            shops = try await APIClient.shared.storePrices(household: household)
            error = nil
        } catch let error as APIError where error.status == 404 {
            // A server from before the store map: the stores still show, with no prices on them.
            shops = []
        } catch {
            self.error = "Couldn't load your prices. \(error.localizedDescription)"
        }
        // Prices arrived after the first search: the shops' own names are worth a look too.
        if searched != nil, !shops.isEmpty { await search() }
    }

    /**
     The grocers Apple knows in what the map shows, and the household's own shops by name — at
     most eight of those, the ones priced most lately — all in the area, one of each.
     */
    private func search() async {
        guard sample == nil, let area = region, !searching else { return }
        searching = true
        defer { searching = false }
        var found: [StorePlace] = []

        let grocers = MKLocalPointsOfInterestRequest(coordinateRegion: area)
        grocers.pointOfInterestFilter = MKPointOfInterestFilter(including: [.foodMarket])
        if let items = try? await MKLocalSearch(request: grocers).start().mapItems {
            found += items.map(StorePlace.init).filter { !StoreMatch.notGrocer($0.name) }
        }
        for shop in shops.filter({ !$0.prices.isEmpty }).prefix(8) {
            let byName = MKLocalSearch.Request()
            byName.naturalLanguageQuery = shop.name
            byName.region = area
            byName.resultTypes = .pointOfInterest
            // Only the ones in view: "ShopRite" is a hundred ShopRites, and the nearest is not
            // always among the first Apple sends back from all over.
            if #available(iOS 18.0, *) { byName.regionPriority = .required }
            if let items = try? await MKLocalSearch(request: byName).start().mapItems {
                found += items.map(StorePlace.init)
                    .filter { StoreMatch.same($0.name, shop.name) && area.contains($0.coordinate) }
            }
        }

        // Branches receipts were linked to: where somebody really bought, even where Apple files the
        // shop as something else or its search missed it. One Apple found there already is the same.
        for shop in shops where !shop.prices.isEmpty {
            for branch in shop.places {
                guard let place = branch.storePlace(chain: shop.name), area.contains(place.coordinate),
                      !found.contains(where: { StoreMatch.same($0.name, place.name) && $0.metres(to: place) < 80 })
                else { continue }
                found.append(place)
            }
        }

        var seen = Set<String>()
        places = found.filter { seen.insert($0.id).inserted }
        searched = area
        if let selection, !places.contains(where: { $0.id == selection }) { self.selection = nil }
        // The map went on following you while that ran: catch up with where it is now.
        if position.followsUserLocation && moved { Task { await search() } }
    }
}

// MARK: - The pieces

/// One of the household's shops on the map: what the list comes to there, in a pill with a point.
struct PricePin: View {
    let text: String
    var isOn = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                Image(systemName: "cart.fill").font(.system(size: 11, weight: .semibold))
                Text(text).font(.system(size: 13, weight: .bold).monospacedDigit())
            }
            .foregroundStyle(isOn ? Palette.onAccent : Palette.accentInk)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .background(isOn ? Palette.accent : Palette.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(Palette.accent, lineWidth: isOn ? 0 : 1.5))
            Image(systemName: "triangle.fill")
                .font(.system(size: 9))
                .rotationEffect(.degrees(180))
                .foregroundStyle(isOn ? Palette.accent : Palette.accent)
                .offset(y: -2)
        }
        .scaleEffect(isOn ? 1.12 : 1, anchor: .bottom)
        .animation(.snappy(duration: 0.15), value: isOn)
        .shadow(color: Palette.shadow, radius: 4, y: 2)
    }
}

/// A store with no prices from the household: small, so the priced ones stand out.
struct StoreDot: View {
    var isOn = false

    var body: some View {
        Image(systemName: "cart.fill")
            .font(.system(size: isOn ? 12 : 8, weight: .semibold))
            .foregroundStyle(Palette.surface)
            .frame(width: isOn ? 28 : 18, height: isOn ? 28 : 18)
            .background(isOn ? Palette.text : Palette.muted, in: Circle())
            .overlay(Circle().strokeBorder(Palette.surface, lineWidth: 1.5))
            .shadow(color: Palette.shadow, radius: 2, y: 1)
            .animation(.snappy(duration: 0.15), value: isOn)
    }
}

/// Every chain with prices, each with your list priced there; tap one for its prices.
struct YourShopsSheet: View {
    let shops: [StorePrices]
    var onOpen: (StorePrices) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let priced = shops.filter { !$0.prices.isEmpty }
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader("Shops with prices", subtitle: "From everyone's receipts on this server", onClose: { dismiss() })
                ListGroup(dividerInset: 68) {
                    ForEach(priced) { shop in
                        Button { onOpen(shop) } label: {
                            ListRow(shop.name, subtitle: StoreWords.list(shop), chevron: true, wrapSubtitle: true,
                                    leading: { Tile("cart", tone: .accent) }) {
                                if shop.yours { Pill("You shop here", tone: .herb) }
                            }
                        }
                        .buttonStyle(PressFade())
                    }
                }
                Text("A list's total counts each thing at the newest price anybody paid there, for however much it was then. Nobody's name is on a price.")
                    .font(.system(size: 12)).foregroundStyle(Palette.faint)
                    .padding(.horizontal, 4)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .kitchenSheet([.medium, .large])
    }
}

/// Every price the household has paid at one shop, A to Z, with the list priced there on top.
struct StorePricesSheet: View {
    let shop: StorePrices
    var place: StorePlace?
    var distance: String?

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var shown: [StoreItemPrice] {
        let typed = query.trimmingCharacters(in: .whitespaces)
        guard !typed.isEmpty else { return shop.prices }
        return shop.prices.filter { $0.ingredientName.localizedCaseInsensitiveContains(typed) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Where it is, when it was opened from the map; the card under it says the rest.
                SheetHeader(shop.name, subtitle: [place?.address, distance].compactMap { $0 }.joined(separator: " · ")
                    .nilIfEmpty, onClose: { dismiss() })
                Card(padding: 14, spacing: 4) {
                    Text(StoreWords.list(shop)).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
                    Text(StoreWords.priced(shop)).font(.system(size: 13)).foregroundStyle(Palette.muted)
                }
                if shop.prices.count > 8 {
                    SearchBox(text: $query, prompt: "Search \(shop.prices.count) prices")
                }
                if shown.isEmpty {
                    Text("Nothing here matches that.").font(.system(size: 14)).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity).padding(.vertical, 20)
                } else {
                    ListGroup {
                        ForEach(shown) { price in
                            ListRow(GroceryWords.titled(price.ingredientName),
                                    subtitle: StoreWords.detail(price, sayYours: shop.households > 1)) {
                                HStack(spacing: 6) {
                                    if price.onSale { Pill("Sale", tone: .herb) }
                                    Text(Money.text(price.price))
                                        .font(.system(size: 15, weight: .semibold).monospacedDigit())
                                        .foregroundStyle(Palette.text)
                                }
                            }
                        }
                    }
                }
                if let item = place?.mapItem {
                    Button {
                        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDefault])
                    } label: { Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond") }
                        .buttonStyle(.secondary)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .pageBackground()
        .kitchenSheet([.medium, .large])
    }
}

/// The places the household hid from its map, each with Show to put it back.
struct HiddenPlacesSheet: View {
    let hidden: [HiddenPlace]
    var onShow: (HiddenPlace) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var shownAgain: Set<UUID> = []

    var body: some View {
        let left = hidden.filter { !shownAgain.contains($0.id) }
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader("Hidden places", subtitle: "Off the map for everyone in your household", onClose: { dismiss() })
                if left.isEmpty {
                    Text("Nothing hidden now.").font(.system(size: 14)).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity).padding(.vertical, 20)
                } else {
                    ListGroup(dividerInset: 68) {
                        ForEach(left) { place in
                            ListRow(place.name, subtitle: place.address, wrapSubtitle: true,
                                    leading: { Tile("eye.slash", tone: .neutral) }) {
                                Button("Show") {
                                    shownAgain.insert(place.id)
                                    onShow(place)
                                }
                                .buttonStyle(.kitchen(.secondary, size: .small))
                                .accessibilityLabel("Show \(place.name) on the map again")
                            }
                        }
                    }
                }
                Text("Hide a place from its card on the map (Not a store) when Apple has it down as a grocery store and it isn't one.")
                    .font(.system(size: 12)).foregroundStyle(Palette.faint)
                    .padding(.horizontal, 4)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .kitchenSheet([.medium, .large])
    }
}

/// Explore's door to the map: its tile and line, then the chains priced most lately, by anyone.
struct GroceryStoresDoor: View {
    /// Nil until the server has answered (or never, for one from before the store map).
    let shops: [StorePrices]?

    var body: some View {
        let priced = (shops ?? []).filter { !$0.prices.isEmpty }
        Card(padding: 16, spacing: 12) {
            HStack(spacing: 12) {
                Tile("map", tone: .sky, size: 44)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Grocery stores").titleFont(20).foregroundStyle(Palette.text)
                    Text("Shops near you, and what things cost there").font(.system(size: 13))
                        .foregroundStyle(Palette.muted).multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.faint)
            }
            VStack(alignment: .leading, spacing: 6) {
                if priced.isEmpty {
                    Text("No prices yet — scan a receipt and everyone sees what it cost")
                        .font(.system(size: 13)).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    ForEach(priced.prefix(2)) { shop in
                        HStack(spacing: 8) {
                            Text(shop.name).font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.text).lineLimit(1)
                            Spacer(minLength: 8)
                            Text(shop.listPriced > 0 ? "\(Money.about(shop.listTotal)) for your list" : StoreWords.priced(shop))
                                .font(.system(size: 13).monospacedDigit()).foregroundStyle(Palette.muted).lineLimit(1)
                        }
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .accessibilityElement(children: .combine)
    }
}

/// A grocery store on the map: where Apple Maps has it, and its item, for directions.
struct StorePlace: Identifiable, Hashable {
    let id: String
    let name: String
    let latitude: Double
    let longitude: Double
    var address: String?
    /// Apple's own; nil for the sample places, which have nowhere to give directions to.
    var mapItem: MKMapItem?

    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: latitude, longitude: longitude) }

    init(id: String? = nil, name: String, latitude: Double, longitude: Double, address: String? = nil,
         mapItem: MKMapItem? = nil) {
        self.name = name
        self.latitude = latitude
        self.longitude = longitude
        self.address = address
        self.mapItem = mapItem
        // A shop and where it stands, to about ten metres: the same store found by two searches is one.
        self.id = id ?? "\(name.lowercased())@\((latitude * 10_000).rounded()),\((longitude * 10_000).rounded())"
    }

    init(_ item: MKMapItem) {
        let coordinate: CLLocationCoordinate2D
        let address: String?
        if #available(iOS 26.0, *) {
            coordinate = item.location.coordinate
            address = item.address?.shortAddress ?? item.address?.fullAddress
        } else {
            coordinate = item.placemark.coordinate
            address = item.placemark.thoroughfare.map { street in
                [item.placemark.subThoroughfare, street].compactMap { $0 }.joined(separator: " ")
            } ?? item.placemark.locality
        }
        self.init(name: item.name ?? "Grocery store", latitude: coordinate.latitude, longitude: coordinate.longitude,
                  address: address, mapItem: item)
    }

    /// As the crow flies.
    func metres(to other: StorePlace) -> Double {
        CLLocation(latitude: latitude, longitude: longitude)
            .distance(from: CLLocation(latitude: other.latitude, longitude: other.longitude))
    }

    static func == (a: StorePlace, b: StorePlace) -> Bool { a.id == b.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// The store map with no server, search or location — previews and the Gallery.
struct StoreMapSample {
    var shops: [StorePrices]
    var places: [StorePlace]
    var region: MKCoordinateRegion
    /// A place to open on, tapped.
    var selected: String?
}

/**
 Asks for the phone's location while the map is open, once, to start it where you are. Nothing
 is kept: the map only centres on it and says how far each store is.
 */
@MainActor @Observable
final class StoreLocator: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private(set) var status: CLAuthorizationStatus
    private(set) var location: CLLocation?

    /// Said no, or not allowed to ask: the map then opens wherever it falls back to.
    var refused: Bool { status == .denied || status == .restricted }

    override init() {
        status = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    /// `asking` false: only where Location is already allowed, with no question if it is not.
    func start(asking: Bool = true) {
        switch manager.authorizationStatus {
        case .notDetermined: if asking { manager.requestWhenInUseAuthorization() }
        case .authorizedWhenInUse, .authorizedAlways: manager.requestLocation()
        default: break
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.status = status
            if status == .authorizedWhenInUse || status == .authorizedAlways { self.manager.requestLocation() }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let latest = locations.last else { return }
        Task { @MainActor in self.location = latest }
    }

    /// A failed fix just leaves the distances off; the map has its own blue dot.
    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}

private extension MKCoordinateRegion {
    func contains(_ point: CLLocationCoordinate2D) -> Bool {
        abs(point.latitude - center.latitude) <= span.latitudeDelta / 2
            && abs(point.longitude - center.longitude) <= span.longitudeDelta / 2
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

#Preview("Grocery stores") {
    NavigationStack { StoreMapScreen(session: .preview, sample: StoreMapSamples.map) }
}

#Preview("Grocery stores — Kings tapped, dark") {
    NavigationStack { StoreMapScreen(session: .preview, sample: StoreMapSamples.tapped) }
        .preferredColorScheme(.dark)
}

#Preview("Prices at Kings") {
    Color.clear.sheet(isPresented: .constant(true)) {
        StorePricesSheet(shop: StoreMapSamples.shops[0], place: StoreMapSamples.places[0], distance: "0.3 mi")
    }
}

#Preview("Hidden places") {
    Color.clear.sheet(isPresented: .constant(true)) {
        HiddenPlacesSheet(hidden: StoreMapSamples.hidden) { _ in }
    }
}

#Preview("Door") {
    VStack(spacing: 14) {
        GroceryStoresDoor(shops: StoreMapSamples.shops)
        GroceryStoresDoor(shops: [])
    }
    .padding(20)
    .pageBackground()
}
