import SwiftUI
import UIKit

/*
 Small pieces the Household screens share (mockup 6.2–6.7): how somebody signs in, each person's
 colour, a link in a quiet well with its copy button, the QR code on its white tile, and the one
 call these screens make that nothing else does.
 */

extension APIClient {
    /// Everything about a place at once, as the web's Places page saves it. The photo is kept as
    /// it was: the phone does not change it.
    @discardableResult
    func updatePlace(_ place: Place, name: String, menuUrl: String?, phone: String?, notes: String?) async throws -> Place {
        let body: [String: Any] = [
            "name": name,
            "menuUrl": menuUrl ?? NSNull(),
            "phone": phone ?? NSNull(),
            "notes": notes ?? NSNull(),
            "imageId": place.imageId?.uuidString ?? NSNull(),
        ]
        return try await send("PUT", "/api/places/\(place.id.uuidString)", body: body)
    }
}

/// Everyone's own colour in Who's here and on their sheet: the same person, the same colour.
enum PersonTone {
    private static let tones: [Tone] = [.accent, .herb, .sky, .plum, .mustard]
    static func at(_ index: Int) -> Tone { tones[max(0, index) % tones.count] }
}

extension HouseholdMember {
    /// How they sign in, in words, under their name on their sheet.
    var signInSentence: String {
        if neverSignedIn { return "Hasn't signed in yet" }
        return hasEmail == false ? "Signs in with a PIN" : "Signs in with email"
    }
}

/// How someone signs in, as the mockup's pill: email (herb), a PIN only (mustard) — the owner's
/// cue that the PIN screens cannot go yet — or not at all so far.
struct SignInPill: View {
    let member: HouseholdMember

    var body: some View {
        if member.neverSignedIn {
            Pill("Hasn't signed in yet", tone: .accent)
        } else if member.hasEmail == false {
            Pill("PIN", tone: .mustard, systemImage: "key")
        } else {
            Pill("Email", tone: .herb, systemImage: "envelope")
        }
    }
}

/// A link as people read it: no scheme in front.
func shownLink(_ url: URL) -> String {
    url.absoluteString.replacingOccurrences(of: #"^https?://"#, with: "", options: .regularExpression)
}

/**
 The link in a quiet well, cut short in the middle, and the copy button at its end (mockup
 `meals.gehan.home/invite/h7Qm2x ⧉`). Copying takes the whole link.
 */
struct LinkWell: View {
    let url: URL
    @State private var copied = false

    var body: some View {
        HStack(spacing: 8) {
            Text(shownLink(url))
                .font(.system(size: 13))
                .foregroundStyle(Palette.muted)
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
            Button {
                UIPasteboard.general.string = url.absoluteString
                copied = true
            } label: {
                Image(systemName: copied ? "checkmark" : "doc.on.doc")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Palette.accentInk)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle().inset(by: -8))
            }
            .buttonStyle(PressFade())
            .accessibilityLabel(copied ? "Copied" : "Copy link")
        }
        .padding(.leading, 12)
        .padding(.trailing, 6)
        .padding(.vertical, 6)
        .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .task(id: copied) {
            guard copied else { return }
            try? await Task.sleep(for: .seconds(2))
            copied = false
        }
    }
}

/// A QR code of a link on a white tile. Dark on white in both themes: a camera reads contrast.
struct QRTile: View {
    let url: URL
    var size: CGFloat = 220

    var body: some View {
        Group {
            if let image = QRCode.image(for: url.absoluteString) {
                Image(uiImage: image)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
            } else {
                Color.clear
            }
        }
        .padding(12)
        .frame(width: size, height: size)
        .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement()
        .accessibilityLabel("QR code of the link")
    }
}

/// The address the web serves a token's page at — in production the API and the site share an
/// origin, which is where the invite and reset pages live.
enum HouseholdLinks {
    static func invite(_ token: String) -> URL? { URL(string: "\(Config.baseURL)/invite/\(token)") }
    static func reset(_ token: String) -> URL? { URL(string: "\(Config.baseURL)/reset/\(token)") }
}

#Preview("Household parts") {
    VStack(spacing: 16) {
        HStack { ForEach(SampleData.members) { SignInPill(member: $0) } }
        LinkWell(url: HouseholdLinks.invite(SampleData.invite.token)!)
        QRTile(url: HouseholdLinks.invite(SampleData.invite.token)!)
    }
    .padding(20)
    .pageBackground()
}
