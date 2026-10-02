import SwiftUI

/**
 Places we eat (mockup 6.5): the restaurants and takeaways a night off is planned at, each with
 what to order, and the two things you want from one at dinner time — its menu and its phone.
 Places are also made on the fly from the Plan; this is where their details are filled in.
 */
struct PlacesScreen: View {
    var session: Session
    var sample: [Place]?

    @State private var places: [Place] = []
    @State private var loaded = false
    @State private var query = ""
    @State private var editing: Place?
    @State private var adding = false
    @State private var newName = ""
    @State private var error: String?

    /// Each place its own colour, in the order they are listed — the mockup's plum, tomato,
    /// mustard, sky.
    private static let tones: [Tone] = [.plum, .accent, .mustard, .sky, .herb]

    private var shown: [(Place, Tone)] {
        let all = places.enumerated().map { ($0.element, Self.tones[$0.offset % Self.tones.count]) }
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return all }
        return all.filter { "\($0.0.name) \($0.0.notes ?? "")".lowercased().contains(q) }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                SearchBox(text: $query, prompt: "Search places")
                if !loaded {
                    ProgressView().padding(.top, 24)
                } else if places.isEmpty {
                    VStack(spacing: 10) {
                        Text("Nowhere saved yet.").font(.system(size: 15)).foregroundStyle(Palette.muted)
                        Text("A night out is planned like a meal — pick the place instead of a recipe, and nothing goes on the grocery list.")
                            .font(.system(size: 13)).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                        Button { adding = true } label: { Label("Add a place", systemImage: "plus") }
                            .buttonStyle(.kitchen(.secondary, size: .small))
                    }
                    .padding(.top, 24)
                } else if shown.isEmpty {
                    Text("Nothing called “\(query.trimmingCharacters(in: .whitespaces))”.")
                        .font(.system(size: 15)).foregroundStyle(Palette.muted).padding(.top, 24)
                } else {
                    ForEach(shown, id: \.0.id) { place, tone in
                        PlaceCard(place: place, tone: tone) { editing = place }
                    }
                }
                if let error {
                    NoteBox(error, tone: .accent, systemImage: "exclamationmark.triangle")
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 28)
        }
        .pageBackground()
        .navigationTitle("Places we eat")
        .navigationBarTitleDisplayMode(.inline)
        .textBackButton("Household")
        .toolbar {
            // A bare plus in the accent, as the mockup's bar has it — no glass capsule round it.
            BareToolbarItem(placement: .topBarTrailing) {
                Button {
                    newName = ""
                    adding = true
                } label: {
                    Image(systemName: "plus").font(.system(size: 21, weight: .medium))
                        .foregroundStyle(Palette.accent)
                        .padding(.vertical, 6)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressFade())
                .accessibilityLabel("Add a place")
            }
        }
        .task { await load() }
        .alert("New place", isPresented: $adding) {
            TextField("Tony's, Chinese, pizza…", text: $newName)
            Button("Cancel", role: .cancel) {}
            Button("Add") { Task { await add() } }
        } message: {
            Text("Then fill in its menu, phone and what to order.")
        }
        .sheet(item: $editing) { place in
            PlaceEditor(place: place) { await load() }
        }
    }

    private func load() async {
        if let sample { places = sample; loaded = true; return }
        guard let household = session.household?.id else { loaded = true; return }
        if let fresh = try? await APIClient.shared.places(household: household) { places = fresh }
        loaded = true
    }

    private func add() async {
        let wanted = newName.trimmingCharacters(in: .whitespaces)
        guard !wanted.isEmpty, let household = session.household?.id else { return }
        do {
            let made = try await APIClient.shared.addPlace(household: household, name: wanted)
            places.append(made)
            // Straight into the details, since adding a name is never the actual goal.
            editing = made
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One place as the mockup's card: its tile (or photo), name and notes, then Menu and Call.
struct PlaceCard: View {
    let place: Place
    let tone: Tone
    let edit: () -> Void

    private var menu: URL? {
        guard let raw = place.menuUrl, let url = URL(string: raw),
              let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return nil }
        return url
    }

    private var call: URL? {
        // tel: wants digits, not "(555) 123-4567".
        guard let phone = place.phone?.filter({ $0.isNumber || $0 == "+" }), !phone.isEmpty else { return nil }
        return URL(string: "tel:\(phone)")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button(action: edit) {
                HStack(spacing: 12) {
                    if let id = place.imageId, let url = APIClient.shared.imageURL(id) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Tile("storefront", tone: tone, size: 42)
                        }
                        .frame(width: 42, height: 42)
                        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
                    } else {
                        Tile("storefront", tone: tone, size: 42)
                    }
                    VStack(alignment: .leading, spacing: 1) {
                        Text(place.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.text)
                        if let notes = place.notes, !notes.isEmpty {
                            Text(notes).font(.system(size: 13)).foregroundStyle(Palette.muted)
                                .lineSpacing(2).multilineTextAlignment(.leading)
                        } else {
                            Text("No notes").font(.system(size: 13)).foregroundStyle(Palette.faint)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(PressFade())
            .accessibilityHint("Edit")

            HStack(spacing: 8) {
                action("Menu", "globe", menu, label: "Menu for \(place.name)")
                action("Call", "phone", call, label: "Call \(place.name)")
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    /// Menu or Call. With nothing to open it stays, faded, so the card keeps its shape.
    @ViewBuilder
    private func action(_ title: String, _ symbol: String, _ url: URL?, label: String) -> some View {
        let face = Label(title, systemImage: symbol)
            .font(.system(size: 14, weight: .semibold))
            .labelStyle(HouseholdButtonLabel())
            .foregroundStyle(Palette.text)
            .frame(maxWidth: .infinity, minHeight: 34)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
        if let url {
            Link(destination: url) { face }
                .buttonStyle(PressFade())
                .accessibilityLabel(label)
        } else {
            face.opacity(0.45)
                .accessibilityLabel("\(label): not saved yet")
        }
    }
}

/// A place's details: name, menu link, phone and what to order.
struct PlaceEditor: View {
    let place: Place
    let changed: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var menu: String
    @State private var phone: String
    @State private var notes: String
    @State private var busy = false
    @State private var deleting = false
    @State private var error: String?

    init(place: Place, changed: @escaping () async -> Void) {
        self.place = place
        self.changed = changed
        _name = State(initialValue: place.name)
        _menu = State(initialValue: place.menuUrl ?? "")
        _phone = State(initialValue: place.phone ?? "")
        _notes = State(initialValue: place.notes ?? "")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader(place.name, onClose: { dismiss() })
                FieldBox("Name", text: $name)
                FieldBox("Menu link", text: $menu, prompt: "https://…")
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                FieldBox("Phone", text: $phone, prompt: "(555) 123-4567")
                    .keyboardType(.phonePad)
                FieldBox("Notes", text: $notes, prompt: "What to order, where to park.")
                if let error {
                    NoteBox(error, tone: .accent, systemImage: "exclamationmark.triangle")
                }
                Button(busy ? "Saving…" : "Save") { Task { await save() } }
                    .buttonStyle(.primary)
                    .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                Button {
                    deleting = true
                } label: {
                    Label("Delete place", systemImage: "trash")
                }
                .buttonStyle(.danger)
                .disabled(busy)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 24)
        }
        .kitchenSheet([.large])
        .alert("Delete \(place.name)?", isPresented: $deleting) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { Task { await remove() } }
        } message: {
            Text("Deleting also clears any planned nights at this place.")
        }
    }

    private func blankIsNil(_ text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.updatePlace(place, name: name.trimmingCharacters(in: .whitespaces),
                                                   menuUrl: blankIsNil(menu), phone: blankIsNil(phone),
                                                   notes: blankIsNil(notes))
            await changed()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func remove() async {
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.deletePlace(place.id)
            await changed()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Places we eat") {
    NavigationStack { PlacesScreen(session: .preview, sample: SampleData.places) }
}

#Preview("Places we eat — dark") {
    NavigationStack { PlacesScreen(session: .preview, sample: SampleData.places) }
        .preferredColorScheme(.dark)
}
