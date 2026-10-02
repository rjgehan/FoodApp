import SwiftUI

/**
 The beta's ideas board, from the lightbulb in the header: what would make the app better,
 suggested by anyone and upvoted by everyone else. One board for the whole server, the same one
 the web shows — not one per household.

 The mockup's 7.5: Back, Ideas and a + across the top; the Beta pill; four chips — Top (most
 votes first, done or decided against at the bottom; the server sorts), New (newest first), and
 Planned and Done (the ideas at that stage, most wanted first); then a card per idea with its vote
 column on the left. Your own ideas can be reworded or taken back from the •••, and the admin's
 ••• also says where any idea is up to.
*/
struct IdeasView: View {
    var session: Session
    var sample: [Idea]?

    enum Show: String, CaseIterable, Identifiable {
        case top, new, planned, done
        var id: String { rawValue }
        var title: String { rawValue.prefix(1).uppercased() + rawValue.dropFirst() }
        /// What the server is asked for: Planned and Done are Top, narrowed down here.
        var sort: String { self == .new ? "new" : "top" }
    }

    @Environment(\.dismiss) private var dismiss
    @State private var ideas: [Idea] = []
    @State private var loaded = false
    @State private var show: Show = .top
    @State private var error: String?
    @State private var closed = false
    @State private var suggesting = false
    @State private var editing: Idea?
    @State private var deleting: Idea?
    /// The last vote sent for each idea, so an answer overtaken by a newer tap is ignored.
    @State private var votesSent: [UUID: Int] = [:]

    private var shown: [Idea] {
        switch show {
        case .planned: return ideas.filter { $0.status == .planned }
        case .done: return ideas.filter { $0.status == .done }
        case .top, .new: return ideas
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Pill("Beta", tone: .mustard, systemImage: "lightbulb")
                        Text("Shared by everyone on this server")
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.muted)
                    }
                    if !closed {
                        HStack(spacing: 8) {
                            ForEach(Show.allCases) { option in
                                Chip(option.title, isOn: show == option) { show = option }
                            }
                        }
                        .padding(.bottom, 2)
                    }

                    if let error {
                        NoteBox(error, tone: .accent, systemImage: "exclamationmark.circle")
                    }

                    if closed {
                        empty("The ideas board has closed", "It was here for the beta. Thank you for every idea.", tone: .mustard)
                    } else if loaded && shown.isEmpty {
                        switch show {
                        case .planned:
                            empty("Nothing planned yet", "Vote for the ideas you want most — those are the ones that get planned.", tone: .sky)
                        case .done:
                            empty("Nothing done yet", "Vote for the ideas you want most — those are the ones that get planned.", tone: .herb)
                        case .top, .new:
                            empty("No ideas yet", "Yours could be the first. What would make planning, shopping or cooking easier?", tone: .accent)
                        }
                    } else {
                        ForEach(shown) { idea in
                            IdeaCard(
                                idea: idea,
                                admin: session.isAdmin,
                                onVote: { Task { await vote(idea) } },
                                onEdit: { editing = idea },
                                onStatus: { status in Task { await setStatus(idea, status) } },
                                onDelete: { deleting = idea }
                            )
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 24)
            }
            .pageBackground()
            .centeredTitle("Ideas")
            // The mockup's nav: a bare "‹ Back" and a bare tomato +, with no glass round them.
            .toolbar {
                BarTextButton("Back", placement: .topBarLeading, back: true) { dismiss() }
                if !closed {
                    BareToolbarItem(placement: .topBarTrailing) {
                        Button { suggesting = true } label: {
                            Image(systemName: "plus").font(.system(size: 22, weight: .regular))
                                .foregroundStyle(Palette.accentInk)
                                .frame(width: 34, height: 34)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(PressFade())
                        .accessibilityLabel("Suggest an idea")
                    }
                }
            }
            .refreshable { await load() }
            .task(id: show.sort) { await load() }
            .sheet(isPresented: $suggesting) {
                IdeaEditor(idea: nil) { title, details in
                    let made = try await APIClient.shared.suggestIdea(title: title, details: details)
                    // At the top of the list, so whoever posted it sees it land. Its proper
                    // place comes with the next load.
                    ideas.insert(made, at: 0)
                    if show == .planned || show == .done { show = .top }
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

    private func empty(_ title: String, _ line: String, tone: Tone) -> some View {
        Card(padding: 24) {
            VStack(spacing: 10) {
                Tile("lightbulb", tone: tone, size: 56)
                Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.text)
                Text(line).font(.system(size: 15)).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                if show == .top || show == .new, !closed {
                    Button { suggesting = true } label: { Label("Suggest the first idea", systemImage: "plus") }
                        .buttonStyle(.kitchen(.primary, size: .small))
                        .padding(.top, 4)
                }
            }
            .frame(maxWidth: .infinity)
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
            ideas = try await APIClient.shared.ideas(sort: show.sort)
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
     On the card at once, then whatever the server counted. The card does not move: jumping out
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
        // Off the screen first: a card that sits there after Delete reads as a miss.
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

/// How long an idea has been up, at a glance and as the web says it: "just now", "6m ago",
/// "3h ago", "2d ago", then the date.
private func shortAgo(_ date: Date, now: Date = .now) -> String {
    let seconds = max(0, now.timeIntervalSince(date))
    if seconds < 60 { return "just now" }
    let minutes = Int(seconds / 60)
    if minutes < 60 { return "\(minutes)m ago" }
    let hours = minutes / 60
    if hours < 24 { return "\(hours)h ago" }
    let days = hours / 24
    if days < 7 { return "\(days)d ago" }
    return date.formatted(.dateTime.month(.abbreviated).day())
}

/**
 One idea (7.5): the vote column on the left where a thumb finds it — tomato once it is yours —
 then what it is, where it is up to and who suggested it. The ••• is there only when there is
 something in it for you.
*/
private struct IdeaCard: View {
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
                    Image(systemName: "chevron.up").font(.system(size: 15, weight: .bold))
                    Text("\(idea.voteCount)").font(.system(size: 14, weight: .bold).monospacedDigit())
                }
                .foregroundStyle(idea.votedByMe ? Palette.accentInk : Palette.muted)
                .frame(width: 40)
                .padding(.vertical, 7)
                .background(idea.votedByMe ? Palette.accentSoft : Palette.surface2,
                            in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .contentShape(Rectangle())
            }
            .buttonStyle(PressFade())
            .accessibilityLabel("Upvote “\(idea.title)”")
            .accessibilityValue(votes(idea.voteCount))
            .accessibilityAddTraits(idea.votedByMe ? .isSelected : [])

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top, spacing: 4) {
                    Text(idea.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Palette.text)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if idea.mine || admin { menu }
                }
                if let details = idea.details {
                    Text(details)
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.muted)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 8) {
                    IdeaStatusPill(status: idea.status)
                    HStack(spacing: 0) {
                        Text(idea.mine ? "You" : idea.authorName)
                        if let created = idea.created {
                            Text(" · ").accessibilityHidden(true)
                            Text(shortAgo(created))
                        }
                    }
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.muted)
                    .lineLimit(1)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private var menu: some View {
        Menu {
            if idea.mine {
                Button("Edit", systemImage: "pencil", action: onEdit)
            }
            if admin {
                // Where it is up to: the one it is at now wears the tick.
                Section("Where it's up to") {
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
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Palette.muted)
                .frame(width: 30, height: 22)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Idea actions")
    }
}

/// Where an idea is up to, in the mockup's colours: new in plum, planned in sky, done in herb
/// with a tick. Not doing stays grey — decided, and nothing more to see.
struct IdeaStatusPill: View {
    let status: IdeaStatus

    var body: some View {
        switch status {
        case .open: tag("New", .plum)
        case .planned: tag("Planned", .sky)
        case .done: tag("Done", .herb, "checkmark")
        case .notDoing: tag("Not doing", .neutral)
        }
    }

    private func tag(_ text: String, _ tone: Tone, _ symbol: String? = nil) -> some View {
        HStack(spacing: 4) {
            if let symbol { Image(systemName: symbol).font(.system(size: 10, weight: .bold)) }
            Text(text)
        }
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(tone.ink)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(tone.soft, in: Capsule())
        .fixedSize()
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
                BarTextButton("Cancel", placement: .topBarLeading) { dismiss() }
                BarTextButton(idea == nil ? "Post" : "Save", placement: .topBarTrailing, bold: true,
                              disabled: busy || trimmed.isEmpty) { Task { await submit() } }
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
