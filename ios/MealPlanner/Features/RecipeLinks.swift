import SwiftUI

/*
 A recipe's links: the blog it came from, the TikTok of it being made, the version with the
 better sauce. The editor section and the rows on the recipe page both live here so the two
 agree on what a link is called — and with the web, which has the same list of video sites
 (web/src/utils/videoLink.ts) and the same server (SourceLinks.java) deciding which one an
 older phone sees as the recipe's video.
*/

extension SourceLink {
    /// Sites people know by name rather than by address — and every one of them a video site,
    /// the same list the server uses to decide which link is the recipe's video.
    private static let siteNames: [(host: String, name: String)] = [
        ("tiktok.com", "TikTok"), ("youtube.com", "YouTube"), ("youtu.be", "YouTube"),
        ("instagram.com", "Instagram"), ("vimeo.com", "Vimeo"),
    ]

    /// The host, including for a link typed the way people type them — "tiktok.com/@cook/…",
    /// with no https:// — which the server accepts and fills in.
    static func host(of raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let withScheme = trimmed.range(of: "^[a-zA-Z][a-zA-Z0-9+.-]*://", options: .regularExpression) != nil
            ? trimmed : "https://" + trimmed
        guard let host = URL(string: withScheme)?.host()?.lowercased(), host.contains(".") else { return nil }
        return host
    }

    private static func on(_ host: String, _ site: String) -> Bool {
        host == site || host.hasSuffix("." + site)
    }

    /// "TikTok", "YouTube", or the address without its www.
    static func siteName(of raw: String) -> String? {
        guard let host = host(of: raw) else { return nil }
        if let known = siteNames.first(where: { on(host, $0.host) }) { return known.name }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    /// A video of the cooking rather than a page about it.
    var isVideo: Bool {
        guard let host = Self.host(of: url) else { return false }
        return Self.siteNames.contains { Self.on(host, $0.host) }
    }

    var site: String? { Self.siteName(of: url) }

    /// What it is called on screen: its own name, or "Watch on TikTok", or the site.
    var name: String {
        if let label, !label.trimmingCharacters(in: .whitespaces).isEmpty {
            return label.trimmingCharacters(in: .whitespaces)
        }
        if isVideo, let site { return "Watch on \(site)" }
        return site ?? url
    }

    /// Only http(s) becomes something you can tap, whatever arrived.
    var destination: URL? {
        guard let parsed = URL(string: url), let scheme = parsed.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else { return nil }
        return parsed
    }
}

/// A link while it is being typed. Text until it is saved, and an id so rows keep their focus.
struct LinkDraft: Identifiable, Hashable {
    /// SourceLinks.MAX_LINKS and RecipeSourceLink.MAX_LABEL on the server.
    static let maxLinks = 20
    static let maxLabel = 60

    let id = UUID()
    var url: String
    var label: String

    init(url: String = "", label: String = "") {
        self.url = url
        self.label = label
    }

    init(_ link: SourceLink) {
        self.init(url: link.url, label: link.label ?? "")
    }

    /// What the server gets: empty rows dropped, and a blank name meaning "call it after the site".
    static func body(_ drafts: [LinkDraft]) -> [[String: Any]] {
        drafts.compactMap { draft in
            let url = draft.url.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !url.isEmpty else { return nil }
            let label = draft.label.trimmingCharacters(in: .whitespacesAndNewlines)
            return ["url": url, "label": label.isEmpty ? NSNull() : label]
        }
    }

    /**
     The old single links, worked out from the list the way the server does: the first link
     that is not a video, and the first that is. A server from before the list ignores `links`
     and reads only these — and nulled both whenever they were missing.
    */
    static func legacyFields(_ drafts: [LinkDraft]) -> (sourceUrl: String?, videoUrl: String?) {
        let links = drafts.map { SourceLink(url: $0.url.trimmingCharacters(in: .whitespacesAndNewlines), label: nil) }
            .filter { !$0.url.isEmpty }
        return (links.first { !$0.isVideo }?.url, links.first { $0.isVideo }?.url)
    }
}

/**
 The editor's Links section, the same for a new recipe and an existing one: a row per link, a
 name under it once there is an address to name, and "Add link" for another. Swipe to remove,
 the way ingredients are.
*/
struct LinksSection: View {
    /// The id on the "Add link" row, for scrolling the form to this section.
    static let anchor = "links-add"

    @Binding var links: [LinkDraft]
    @FocusState private var focused: UUID?

    var body: some View {
        Section {
            ForEach($links) { $link in
                VStack(alignment: .leading, spacing: 6) {
                    TextField("https://…", text: $link.url)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focused, equals: link.id)
                        .accessibilityLabel("Link")
                    if !link.url.trimmingCharacters(in: .whitespaces).isEmpty {
                        // Named after the site unless somebody says otherwise, and the
                        // placeholder says which.
                        // Smaller than the address, but in the text colour: only the
                        // placeholder is grey, so a named link and an unnamed one look different.
                        TextField(
                            SourceLink.siteName(of: link.url).map { "Name (optional) — \($0)" } ?? "Name (optional)",
                            text: $link.label
                        )
                        .font(.subheadline)
                        .accessibilityLabel("Link name")
                        // The server keeps sixty characters, as the web's box does.
                        .onChange(of: link.label) { _, label in
                            if label.count > LinkDraft.maxLabel { link.label = String(label.prefix(LinkDraft.maxLabel)) }
                        }
                    }
                }
                .padding(.vertical, 2)
            }
            .onDelete { links.remove(atOffsets: $0) }
            Button("Add link", systemImage: "plus") {
                let row = LinkDraft()
                links.append(row)
                focused = row.id
            }
            .buttonStyle(.borderless)
            // The server keeps up to twenty; past that the button would only lead to a refusal.
            .disabled(links.count >= LinkDraft.maxLinks)
            .id(Self.anchor)
        } header: {
            Text("Links")
        } footer: {
            Text("Where it came from, a video of it being made — as many as you like. Swipe one to remove it.")
        }
    }
}

/// The recipe page's links, as rows you can tap. Videos get the play mark, like the web.
struct RecipeLinksList: View {
    let links: [SourceLink]

    var body: some View {
        let shown = links.filter { $0.destination != nil }
        if !shown.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("Links").font(.headline)
                ForEach(Array(shown.enumerated()), id: \.offset) { _, link in
                    if let destination = link.destination {
                        Link(destination: destination) {
                            HStack(spacing: 12) {
                                Image(systemName: link.isVideo ? "play.circle.fill" : "link")
                                    .font(.title3)
                                    .foregroundStyle(Palette.accent)
                                    .frame(width: 28)
                                VStack(alignment: .leading, spacing: 2) {
                                    // Explicit colours: inside a Link, .primary means the tint,
                                    // and every row read as one long orange button.
                                    Text(link.name)
                                        .foregroundStyle(Color.primary)
                                        .lineLimit(1)
                                    if let site = link.site, !link.name.contains(site) {
                                        Text(site).font(.subheadline).foregroundStyle(Color.secondary).lineLimit(1)
                                    }
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "arrow.up.right")
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(Color(.tertiaryLabel))
                            }
                            .contentShape(Rectangle())
                        }
                        .accessibilityHint("Opens \(link.site ?? "the link")")
                        Divider()
                    }
                }
            }
        }
    }
}

#Preview("Links") {
    ScrollView {
        RecipeLinksList(links: SampleData.recipes[0].allLinks).padding(16)
    }
}
