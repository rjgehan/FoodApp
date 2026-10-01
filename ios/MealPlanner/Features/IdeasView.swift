import SwiftUI

/**
 The beta's ideas board, from the lightbulb in the header: what would make the app better,
 suggested by anyone and upvoted by everyone else. One board for the whole server, the same one
 the web shows — not one per household.

 Top is most votes first, with ideas done or decided against at the bottom (the server sorts);
 New is newest first. Your own ideas can be reworded or taken back — swipe, or the ••• — and the
 admin's ••• also says where any idea is up to.
*/
struct IdeasView: View {
    var session: Session
    var sample: [Idea]?

    enum Sort: String, CaseIterable, Identifiable {
        case top, new
        var id: String { rawValue }
        var title: String { self == .top ? "Top" : "New" }
    }

    @Environment(\.dismiss) private var dismiss
    @State private var ideas: [Idea] = []
    @State private var loaded = false
    @State private var sort: Sort = .top
    @State private var error: String?
    @State private var closed = false
    @State private var suggesting = false
    @State private var editing: Idea?
    @State private var deleting: Idea?
    /// The last vote sent for each idea, so an answer overtaken by a newer tap is ignored.
    @State private var votesSent: [UUID: Int] = [:]

    var body: some View {
        NavigationStack {
            List {
                KitchenSection {
                    Text("Beta · Suggest what would make the app better, and upvote the ideas you want most.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 4, trailing: 4))
                    Picker("Sort", selection: $sort) {
                        ForEach(Sort.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                }

                if let error {
                    KitchenSection { Text(error).foregroundStyle(Palette.danger) }
                }

                if closed {
                    ContentUnavailableView(
                        "The ideas board has closed",
                        systemImage: "lightbulb",
                        description: Text("It was here for the beta. Thank you for every idea.")
                    )
                    .listRowBackground(Color.clear)
                } else if loaded && ideas.isEmpty {
                    ContentUnavailableView {
                        Label("No ideas yet", systemImage: "lightbulb")
                    } description: {
                        Text("Yours could be the first. What would make planning, shopping or cooking easier?")
                    }
                    .listRowBackground(Color.clear)
                } else {
                    KitchenSection {
                        ForEach(ideas) { idea in
                            IdeaRow(
                                idea: idea,
                                admin: session.isAdmin,
                                onVote: { Task { await vote(idea) } },
                                onEdit: { editing = idea },
                                onStatus: { status in Task { await setStatus(idea, status) } },
                                onDelete: { deleting = idea }
                            )
                            .swipeActions(edge: .trailing) {
                                if idea.mine || session.isAdmin {
                                    // Not the destructive role: that takes the row away at once,
                                    // and this asks first — other people's votes go with it.
                                    Button("Delete", systemImage: "trash") { deleting = idea }
                                        .tint(.red)
                                }
                            }
                            .swipeActions(edge: .leading) {
                                if idea.mine {
                                    Button("Edit", systemImage: "pencil") { editing = idea }
                                        .tint(Palette.accent)
                                }
                            }
                        }
                    }
                }
            }
            .kitchenList()
            .navigationTitle("Ideas")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
            // The one thing the page is for, where a thumb is — the web's big orange button.
            .safeAreaInset(edge: .bottom) {
                if !closed {
                    Button {
                        suggesting = true
                    } label: {
                        Label("Suggest an idea", systemImage: "plus")
                            .font(.body.weight(.semibold))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }
            }
            .refreshable { await load() }
            .task(id: sort) { await load() }
            .sheet(isPresented: $suggesting) {
                IdeaEditor(idea: nil) { title, details in
                    let made = try await APIClient.shared.suggestIdea(title: title, details: details)
                    // At the top whichever way the board is sorted, so whoever posted it sees
                    // it land. Its proper place comes with the next load.
                    ideas.insert(made, at: 0)
                }
            }
            .sheet(item: $editing) { idea in
                IdeaEditor(idea: idea) { title, details in
                    replace(try await APIClient.shared.editIdea(idea.id, title: title, details: details))
                }
            }
            .confirmationDialog(
                deleting?.mine == true ? "Delete your idea?" : "Delete this idea for everyone?",
                isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                titleVisibility: .visible,
                presenting: deleting
            ) { idea in
                Button("Delete idea", role: .destructive) { Task { await delete(idea) } }
                Button("Cancel", role: .cancel) {}
            } message: { idea in
                Text(idea.voteCount == 0
                     ? "“\(idea.title)” comes off the board."
                     : "“\(idea.title)” comes off the board, and its \(votes(idea.voteCount)) go with it.")
            }
        }
    }

    // MARK: - Behaviour

    private func load() async {
        if let sample {
            ideas = sample
            loaded = true
            return
        }
        do {
            ideas = try await APIClient.shared.ideas(sort: sort.rawValue)
            error = nil
            loaded = true
        } catch let failure as APIError where failure.status == 404 {
            // Switched off on the server since the app last asked: say so, and put the
            // lightbulb away.
            closed = true
            session.ideasBoard = false
        } catch {
            self.error = error.localizedDescription
        }
    }

    /**
     On the row at once, then whatever the server counted. The row does not move: jumping out
     from under the finger that tapped it is worse than being a place out of order until the
     next load.
    */
    private func vote(_ idea: Idea) async {
        let up = !idea.votedByMe
        let sent = (votesSent[idea.id] ?? 0) + 1
        votesSent[idea.id] = sent
        var guess = idea
        guess.votedByMe = up
        guess.voteCount = max(0, idea.voteCount + (up ? 1 : -1))
        replace(guess)
        if sample != nil { return }
        do {
            let counted = try await APIClient.shared.vote(idea: idea.id, up: up)
            if votesSent[idea.id] == sent { replace(counted) }
        } catch {
            guard votesSent[idea.id] == sent else { return }
            replace(idea)
            self.error = error.localizedDescription
        }
    }

    private func setStatus(_ idea: Idea, _ status: IdeaStatus) async {
        do {
            replace(try await APIClient.shared.setIdeaStatus(idea.id, status: status))
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete(_ idea: Idea) async {
        // Off the screen first: a swipe that leaves the row sitting there reads as a miss.
        ideas.removeAll { $0.id == idea.id }
        if sample != nil { return }
        do {
            try await APIClient.shared.deleteIdea(idea.id)
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }

    private func replace(_ idea: Idea) {
        if let i = ideas.firstIndex(where: { $0.id == idea.id }) { ideas[i] = idea }
    }
}

private func votes(_ count: Int) -> String {
    "\(count) \(count == 1 ? "vote" : "votes")"
}

/// One idea: the upvote on the left where a thumb finds it, then what it is, who suggested it
/// and when. The ••• is there only when there is something in it for you.
private struct IdeaRow: View {
    let idea: Idea
    let admin: Bool
    var onVote: () -> Void
    var onEdit: () -> Void
    var onStatus: (IdeaStatus) -> Void
    var onDelete: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Button(action: onVote) {
                VStack(spacing: 2) {
                    Image(systemName: idea.votedByMe ? "arrowshape.up.fill" : "arrowshape.up")
                        .font(.body.weight(.semibold))
                    Text("\(idea.voteCount)")
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                }
                .foregroundStyle(idea.votedByMe ? Palette.onAccent : Palette.accentInk)
                .frame(width: 46, height: 52)
                .background(
                    idea.votedByMe ? Palette.accent : Palette.surface2,
                    in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                )
            }
            // Plain, so only the button answers — a List row with an ordinary button in it
            // turns the whole row into that button.
            .buttonStyle(.plain)
            .accessibilityLabel("Upvote “\(idea.title)”")
            .accessibilityValue(votes(idea.voteCount))
            .accessibilityAddTraits(idea.votedByMe ? .isSelected : [])

            VStack(alignment: .leading, spacing: 4) {
                Text(idea.title)
                    .font(.body.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                if let details = idea.details {
                    Text(details)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 6) {
                    if idea.status != .open { StatusBadge(status: idea.status) }
                    Text(idea.mine ? "You" : idea.authorName)
                    if let created = idea.created {
                        Text("·").accessibilityHidden(true)
                        Text(created, format: .relative(presentation: .named))
                    }
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if idea.mine || admin {
                Menu {
                    if idea.mine {
                        Button("Edit", systemImage: "pencil", action: onEdit)
                    }
                    if admin {
                        // Where it is up to: the one it is at now wears the tick.
                        KitchenSection("Where it's up to") {
                            ForEach(IdeaStatus.allCases, id: \.self) { status in
                                Button {
                                    if status != idea.status { onStatus(status) }
                                } label: {
                                    if status == idea.status {
                                        Label(status.label, systemImage: "checkmark")
                                    } else {
                                        Text(status.label)
                                    }
                                }
                            }
                        }
                    }
                    Button("Delete", systemImage: "trash", role: .destructive, action: onDelete)
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Palette.accent)
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Idea actions")
            }
        }
        .padding(.vertical, 4)
    }
}

/// Planned in the accent, Done in green, Not doing in grey — the web's badges.
private struct StatusBadge: View {
    let status: IdeaStatus

    var body: some View {
        Text(status.label)
            .font(.caption.weight(.medium))
            .foregroundStyle(foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(background, in: Capsule())
    }

    private var foreground: Color {
        switch status {
        case .planned: return Palette.accent
        case .done: return Palette.herb
        case .open, .notDoing: return .secondary
        }
    }

    private var background: Color {
        switch status {
        case .planned: return Palette.accentSoft
        case .done: return Palette.herbSoft
        case .open, .notDoing: return Palette.surface2
        }
    }
}

/// Suggesting an idea, or rewording your own: a title, and details if there is more to say.
struct IdeaEditor: View {
    let idea: Idea?
    var save: (String, String?) async throws -> Void

    /// The server's Idea.MAX_TITLE and MAX_DETAILS.
    private static let maxTitle = 80
    private static let maxDetails = 1000

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var details: String
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focused: Bool

    init(idea: Idea?, save: @escaping (String, String?) async throws -> Void) {
        self.idea = idea
        self.save = save
        _title = State(initialValue: idea?.title ?? "")
        _details = State(initialValue: idea?.details ?? "")
    }

    private var trimmed: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var left: Int { Self.maxTitle - title.count }

    var body: some View {
        NavigationStack {
            Form {
                KitchenSection {
                    TextField("In a few words", text: $title, axis: .vertical)
                        .focused($focused)
                        .submitLabel(.next)
                        .onChange(of: title) { _, new in
                            // A title is one line, however it was pasted in.
                            let line = new.replacingOccurrences(of: "\n", with: " ")
                            let capped = String(line.prefix(Self.maxTitle))
                            if capped != new { title = capped }
                        }
                } header: {
                    Text("Your idea")
                } footer: {
                    if left <= 15 { Text("\(left) \(left == 1 ? "character" : "characters") left") }
                }

                KitchenSection("Details (optional)") {
                    TextField("What would it help with? How might it work?", text: $details, axis: .vertical)
                        .lineLimit(3...8)
                        .onChange(of: details) { _, new in
                            if new.count > Self.maxDetails { details = String(new.prefix(Self.maxDetails)) }
                        }
                }

                if let error {
                    KitchenSection { Text(error).foregroundStyle(Palette.danger) }
                }
            }
            .kitchenList()
            .navigationTitle(idea == nil ? "Suggest an idea" : "Edit idea")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(idea == nil ? "Post" : "Save") { Task { await submit() } }
                        .fontWeight(.semibold)
                        .disabled(busy || trimmed.isEmpty)
                }
            }
            .onAppear { focused = true }
        }
        .presentationDetents([.medium, .large])
    }

    private func submit() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let more = details.trimmingCharacters(in: .whitespacesAndNewlines)
            try await save(trimmed, more.isEmpty ? nil : more)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Ideas") {
    IdeasView(session: .preview, sample: SampleData.ideas)
}

#Preview("Ideas — none yet") {
    IdeasView(session: .preview, sample: [])
}

#Preview("Suggest an idea") {
    IdeaEditor(idea: nil) { _, _ in }
}
