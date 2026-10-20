import CoreLocation
import MapKit
import SwiftUI

/**
 Which store a receipt is from: the grocery stores around you on Apple Maps, nearest first and the
 receipt's own chain at the top, the household's stores it has linked before, and a search for any
 other. Picking one links the receipt to that branch — its name, address and where it stands — so
 its prices sit on the store map at the right shop, and the shop is named as the shop names itself.

 Asks for the phone's location while it is open (to sort by distance), and works without it: the
 search still finds a store by name. The places the household hid from its map are left out, and
 one that is not a store at all is swiped away (Not a store) here as on the map.
 */
struct StorePicker: View {
    var session: Session
    /// The shop's name as the receipt has it, to put that chain's branches first.
    var suggest: String?
    /// The branch it is linked to now, ticked.
    var current: ShopBranch?
    var onPick: (ShopBranch) -> Void
    /// Takes the link off; nil when there is none to take.
    var onUnlink: (() -> Void)?
    /// Previews and the Gallery: these stores near, with no search or location.
    var sample: [StorePlace]?

    @Environment(\.dismiss) private var dismiss
    @State private var locator = StoreLocator()
    @State private var query = ""
    @State private var nearby: [StorePlace]?
    @State private var found: [StorePlace]?
    @State private var yours: [Shop] = []
    @State private var hidden: [HiddenPlace] = []
    @State private var searching = false
    @State private var searchedFrom: CLLocation?

    var body: some View {
        List {
            SheetHeader("Which store?", subtitle: suggest.map { "The receipt says \($0)" }, onClose: { dismiss() })
                .pageRow(top: 20, bottom: 14)
            SearchBox(text: $query, prompt: "Search for a store")
                .pageRow(bottom: 14)
            if locator.refused && sample == nil {
                NoteBox("Location is off for Waxwing, so the stores aren't sorted by how near they are. Search by name, or turn it on in Settings → Waxwing → Location.",
                        tone: .mustard, systemImage: "location.slash")
                    .pageRow(bottom: 14)
            }

            let typed = query.trimmingCharacters(in: .whitespaces)
            if !typed.isEmpty {
                group("Results", found.map(sorted), empty: "No store by that name around here.")
            } else {
                let linked = yours.compactMap { shop -> StorePlace? in
                    guard let place = shop.place, let lat = place.latitude, let lon = place.longitude else { return nil }
                    return StorePlace(name: place.name ?? shop.name, latitude: lat, longitude: lon, address: place.address)
                }
                if !linked.isEmpty {
                    group("Your stores", sorted(linked), empty: "")
                }
                // Each store once: one of yours is not again among those near.
                let near = nearby?.filter { place in
                    !linked.contains { StoreMatch.same($0.name, place.name) && $0.metres(to: place) < 80 }
                }
                group("Near you", near.map(sorted),
                      empty: locator.refused ? "Search for the store by its name." : "No grocery stores found nearby. Search by name.")
            }

            if let onUnlink {
                Button(role: .destructive) {
                    onUnlink()
                    dismiss()
                } label: {
                    Label("Unlink the store", systemImage: "mappin.slash")
                }
                .buttonStyle(.kitchen(.danger, size: .small))
                .frame(maxWidth: .infinity)
                .pageRow(top: 6, bottom: 24)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .environment(\.defaultMinListRowHeight, 0)
        .pageBackground()
        .kitchenSheet()
        .task {
            if let sample {
                nearby = sample
                return
            }
            locator.start()
            await loadYours()
            if locator.refused { nearby = [] }
        }
        .onChange(of: locator.location) { _, location in
            guard sample == nil, let location,
                  searchedFrom.map({ $0.distance(from: location) > 500 }) ?? true else { return }
            Task { await searchNearby() }
        }
        .onChange(of: locator.refused) { _, refused in
            if refused, nearby == nil { nearby = [] }
        }
        .task(id: query) {
            let typed = query.trimmingCharacters(in: .whitespaces)
            guard !typed.isEmpty else { found = nil; return }
            try? await Task.sleep(for: .milliseconds(350))
            if Task.isCancelled { return }
            await search(typed)
        }
    }

    // MARK: - Rows

    /// A label and its stores in a card; a spinner while they are on the way (nil), `empty` when
    /// there are none (nothing at all for an empty `empty`).
    @ViewBuilder
    private func group(_ title: String, _ found: [StorePlace]?, empty: String) -> some View {
        let places = found?.filter { !hidden.hide($0) }
        Text(title.uppercased())
            .font(.system(size: 12, weight: .bold)).tracking(0.7)
            .foregroundStyle(Palette.muted)
            .accessibilityAddTraits(.isHeader)
            .pageRow(bottom: 8, horizontal: 24)
        if let places, !places.isEmpty {
            ForEach(Array(places.enumerated()), id: \.element.id) { index, place in
                Button { pick(place) } label: { row(place) }
                    .buttonStyle(PressFade())
                    .cardRow(first: index == 0, last: index == places.count - 1, inset: 68, padding: 0)
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button("Not a store", systemImage: "eye.slash", role: .destructive) {
                            Task { await hide(place) }
                        }
                        .tint(Palette.accent)
                    }
            }
            Color.clear.frame(height: 18).pageRow()
        } else if places == nil {
            ProgressView().frame(maxWidth: .infinity).pageRow(top: 8, bottom: 24)
        } else if !empty.isEmpty {
            Text(empty).font(.system(size: 14)).foregroundStyle(Palette.muted).pageRow(bottom: 20, horizontal: 24)
        }
    }

    private func row(_ place: StorePlace) -> some View {
        let isCurrent = current.map { isSame($0, place) } ?? false
        let isChain = suggest.map { StoreMatch.same($0, place.name) } ?? false
        return HStack(spacing: 12) {
            Tile(isChain ? "cart.fill" : "cart", tone: isChain ? .accent : .sky, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(place.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.text)
                    .lineLimit(1)
                let whereabouts = [place.address, distance(place)].compactMap { $0 }.joined(separator: " · ")
                if !whereabouts.isEmpty {
                    Text(whereabouts).font(.system(size: 13)).foregroundStyle(Palette.muted).lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if isCurrent {
                Image(systemName: "checkmark.circle.fill").font(.system(size: 20)).foregroundStyle(Palette.herb)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
    }

    // MARK: - Behaviour

    private func pick(_ place: StorePlace) {
        onPick(ShopBranch(place))
        dismiss()
    }

    /// The receipt's chain first, then the nearest.
    private func sorted(_ places: [StorePlace]) -> [StorePlace] {
        places.sorted { a, b in
            let aChain = suggest.map { StoreMatch.same($0, a.name) } ?? false
            let bChain = suggest.map { StoreMatch.same($0, b.name) } ?? false
            if aChain != bChain { return aChain }
            return metres(a) < metres(b)
        }
    }

    private func metres(_ place: StorePlace) -> Double {
        guard let here = locator.location else { return 0 }
        return here.distance(from: CLLocation(latitude: place.latitude, longitude: place.longitude))
    }

    private func distance(_ place: StorePlace) -> String? {
        locator.location == nil ? nil : StoreWords.distance(metres(place))
    }

    private func isSame(_ branch: ShopBranch, _ place: StorePlace) -> Bool {
        guard let lat = branch.latitude, let lon = branch.longitude else { return false }
        return CLLocation(latitude: lat, longitude: lon)
            .distance(from: CLLocation(latitude: place.latitude, longitude: place.longitude)) < 80
    }

    private func loadYours() async {
        guard let household = session.household?.id else { return }
        async let places = try? APIClient.shared.hiddenPlaces(household: household)
        if let shops = try? await APIClient.shared.shops(household: household) { yours = shops }
        if let places = await places { hidden = places }
    }

    /// Off this list and the household's map; back again if the server says no.
    private func hide(_ place: StorePlace) async {
        let pending = HiddenPlace(id: UUID(), name: place.name, address: place.address,
                                  latitude: place.latitude, longitude: place.longitude)
        hidden.append(pending)
        guard sample == nil, let household = session.household?.id else { return }
        do {
            let kept = try await APIClient.shared.hidePlace(household: household, place)
            hidden = hidden.map { $0.id == pending.id ? kept : $0 }
        } catch {
            hidden.removeAll { $0.id == pending.id }
        }
    }

    /// Grocers within a few kilometres, and the receipt's chain by name, one of each.
    private func searchNearby() async {
        guard let here = locator.location else { return }
        searchedFrom = here
        searching = true
        defer { searching = false }
        let area = MKCoordinateRegion(center: here.coordinate, latitudinalMeters: 6000, longitudinalMeters: 6000)
        var places: [StorePlace] = []
        let grocers = MKLocalPointsOfInterestRequest(coordinateRegion: area)
        grocers.pointOfInterestFilter = MKPointOfInterestFilter(including: [.foodMarket])
        if let items = try? await MKLocalSearch(request: grocers).start().mapItems {
            places += items.map(StorePlace.init).filter { !StoreMatch.notGrocer($0.name) }
        }
        if let suggest, !suggest.trimmingCharacters(in: .whitespaces).isEmpty {
            places += await StorePicker.branches(of: suggest, near: here)
        }
        var seen = Set<String>()
        nearby = places.filter { seen.insert($0.id).inserted }
    }

    private func search(_ typed: String) async {
        searching = true
        defer { searching = false }
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = typed
        request.resultTypes = .pointOfInterest
        if let here = locator.location {
            request.region = MKCoordinateRegion(center: here.coordinate, latitudinalMeters: 30_000, longitudinalMeters: 30_000)
            if #available(iOS 18.0, *) { request.regionPriority = .required }
        }
        let items = (try? await MKLocalSearch(request: request).start().mapItems) ?? []
        var seen = Set<String>()
        found = items.map(StorePlace.init).filter { seen.insert($0.id).inserted }
    }

    /// The branches of a chain within a few kilometres, by its name.
    static func branches(of name: String, near here: CLLocation) async -> [StorePlace] {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = name
        request.resultTypes = .pointOfInterest
        request.region = MKCoordinateRegion(center: here.coordinate, latitudinalMeters: 8000, longitudinalMeters: 8000)
        // Only the ones around: the nearest of a hundred ShopRites is not always in Apple's first few.
        if #available(iOS 18.0, *) { request.regionPriority = .required }
        let items = (try? await MKLocalSearch(request: request).start().mapItems) ?? []
        return items.map(StorePlace.init).filter { StoreMatch.same(name, $0.name) }
    }

    /**
     The branch of the receipt's chain nearest the phone, if there is one within five kilometres —
     the store a receipt just scanned was most likely bought at. Nil without a location.
     */
    static func nearest(named name: String, near here: CLLocation) async -> ShopBranch? {
        let nearest = await branches(of: name, near: here)
            .map { ($0, here.distance(from: CLLocation(latitude: $0.latitude, longitude: $0.longitude))) }
            .filter { $0.1 < 5000 }
            .min { $0.1 < $1.1 }?.0
        return nearest.map(ShopBranch.init)
    }
}

/**
 The store a receipt is linked to, as a row: its name, address and how far, with Change — or, not
 linked, a row that offers to. On the check screen and on a saved receipt.
 */
struct LinkedStoreRow: View {
    let place: ShopBranch?
    /// Why, when the app linked it rather than the person: "Where you shopped last time".
    var note: String?
    var distance: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Tile(place == nil ? "mappin.and.ellipse" : "mappin.circle.fill", tone: place == nil ? .neutral : .sky, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    if let place {
                        Text(place.name ?? "A store").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
                            .lineLimit(1)
                        let whereabouts = [place.address, distance].compactMap { $0 }.joined(separator: " · ")
                        if !whereabouts.isEmpty || note == nil {
                            Text(whereabouts.isEmpty ? "Linked" : whereabouts)
                                .font(.system(size: 13)).foregroundStyle(Palette.muted).lineLimit(2)
                                .multilineTextAlignment(.leading)
                        }
                        if let note {
                            Label(note, systemImage: "sparkles")
                                .font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.sky)
                                .labelStyle(WarningLabel())
                                .lineLimit(1)
                        }
                    } else {
                        Text("Link to a store").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.accentInk)
                        Text("Pick the branch on the map, so its prices are that store's")
                            .font(.system(size: 13)).foregroundStyle(Palette.muted)
                            .multilineTextAlignment(.leading)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if place != nil {
                    Text("Change").font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.accentInk)
                }
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
            }
            .padding(14)
            .cardSurface()
        }
        .buttonStyle(PressFade())
        .accessibilityLabel(place.map { "Store: \($0.name ?? "a store"). Change" } ?? "Link to a store")
    }
}

#Preview("Which store?") {
    Color.clear.sheet(isPresented: .constant(true)) {
        StorePicker(session: .preview, suggest: "Kings Food Markets", current: nil, onPick: { _ in }, onUnlink: {},
                    sample: StoreMapSamples.places)
    }
}

#Preview("Linked store rows") {
    VStack(spacing: 12) {
        LinkedStoreRow(place: ShopBranch(name: "Kings Food Markets", address: "1212 Shipyard Ln, Hoboken", latitude: 40.74, longitude: -74.03),
                       distance: "0.3 mi") {}
        LinkedStoreRow(place: ShopBranch(name: "Kings Food Markets", address: "1212 Shipyard Ln", latitude: 40.74, longitude: -74.03),
                       note: "Nearest one to you") {}
        LinkedStoreRow(place: nil) {}
    }
    .padding(20)
    .pageBackground()
}

extension ShopBranch {
    /// The branch from Apple Maps.
    init(_ place: StorePlace) {
        self.init(name: place.name, address: place.address, latitude: place.latitude, longitude: place.longitude)
    }

    /**
     The branch on the map, named as the chain whose prices it has when its own name is not that
     chain's ("Kings" under "Kings Food Markets" keeps "Kings"; a stray name gives way). Nil with
     nowhere to stand.
     */
    func storePlace(chain: String) -> StorePlace? {
        guard let latitude, let longitude else { return nil }
        let named = name.flatMap { StoreMatch.same($0, chain) ? $0 : nil } ?? chain
        return StorePlace(name: named, latitude: latitude, longitude: longitude, address: address,
                          mapItem: ShopBranch.mapItem(named: named, latitude: latitude, longitude: longitude))
    }

    /// Somewhere for Maps to give directions to.
    var mapItem: MKMapItem? {
        guard let latitude, let longitude else { return nil }
        return ShopBranch.mapItem(named: name ?? "Store", latitude: latitude, longitude: longitude)
    }

    private static func mapItem(named name: String, latitude: Double, longitude: Double) -> MKMapItem {
        let item: MKMapItem
        if #available(iOS 26.0, *) {
            item = MKMapItem(location: CLLocation(latitude: latitude, longitude: longitude), address: nil)
        } else {
            item = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude)))
        }
        item.name = name
        return item
    }
}
