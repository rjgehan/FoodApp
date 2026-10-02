import SwiftUI

/*
 The pieces of "Share to Meal Planner" (mockup 7.6) and of a method rewritten on the phone (7.7):
 the app's name across the top, the card that says what arrived, the chips that file it, and the
 rewritten steps with their Undo and what was actually said.
*/

// MARK: - 7.6

/// The middle of the share sheet's bar: the app's chef's hat on a tomato tile, and its name.
struct ShareSheetTitle: View {
    var body: some View {
        HStack(spacing: 8) {
            Image("ChefHat")
                .resizable()
                .renderingMode(.template)
                .frame(width: 15, height: 15)
                .foregroundStyle(Palette.onAccent)
                .frame(width: 26, height: 26)
                .background(Palette.accent, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            Text("Meal Planner").font(.system(size: 17, weight: .semibold)).foregroundStyle(Palette.text)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/**
 What arrived, on a card: its picture (or a berry placeholder with a play button for a video, a
 link for a page), what it is called, and where it came from with how the reading went —
 "tiktok.com/@bakewithlou · caption found".
 */
struct SharedItemCard: View {
    let title: String
    var source: String?
    var status: String?
    var coverImageId: UUID?
    var isVideo = false
    var busy = false

    var body: some View {
        HStack(spacing: 12) {
            picture
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Palette.text)
                    .lineLimit(2)
                HStack(spacing: 6) {
                    if busy { ProgressView().controlSize(.mini) }
                    Text([source, status].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.system(size: 12))
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(10)
        .cardSurface()
    }

    @ViewBuilder private var picture: some View {
        if let coverImageId, let url = APIClient.shared.imageURL(coverImageId) {
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                placeholder
            }
            .frame(width: 56, height: 56)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        RecipePhotoPlaceholder(hue: .berry, systemImage: isVideo ? "play" : "link", size: 56, radius: 12)
    }

    /// "tiktok.com/@bakewithlou" for a video, the site's own name for a page.
    static func source(of link: String?) -> String? {
        guard let link, let url = URL(string: link), var host = url.host else { return nil }
        if host.hasPrefix("www.") { host.removeFirst(4) }
        if host.hasPrefix("m.") { host.removeFirst(2) }
        let first = url.pathComponents.dropFirst().first ?? ""
        return first.hasPrefix("@") ? "\(host)/\(first)" : host
    }

    /// The places a recipe arrives as a video, whose words are its caption or what was said.
    static func isVideo(_ link: String?) -> Bool {
        guard let host = link.flatMap({ URL(string: $0)?.host?.lowercased() }) else { return false }
        return ["tiktok.com", "instagram.com", "youtube.com", "youtu.be"].contains { host.hasSuffix($0) }
    }
}

/// A chip's face without its button, for a Menu's label — the same look as `Chip`.
struct ChipFace: View {
    let title: String
    var systemImage: String?
    var isOn: Bool

    var body: some View {
        HStack(spacing: 5) {
            if let systemImage { Image(systemName: systemImage).font(.system(size: 12, weight: .semibold)) }
            Text(title)
        }
        .font(.system(size: 15, weight: isOn ? .semibold : .medium))
        .lineLimit(1)
        .foregroundStyle(isOn ? Palette.bg : Palette.text)
        // The mockup's chip is 32pt tall: three of them fit on one row of a phone.
        .padding(.horizontal, 12)
        .frame(minHeight: 32)
        .background(isOn ? Palette.text : Palette.surface, in: Capsule())
        .overlay(Capsule().strokeBorder(isOn ? Palette.text : Palette.border, lineWidth: 1))
        .fixedSize()
        .contentShape(Capsule())
    }
}

// MARK: - 7.7

/**
 A method rewritten on the phone (7.7): the note that says so — on a card with Apple
 Intelligence's colours round its edge — with Undo; the steps, numbered; and the words they were
 made from, so anyone can check nothing was invented.
 */
struct RewrittenMethod: View {
    let steps: [String]
    /// What the steps were made from: the caption, or what was said in the video.
    var original: String?
    var originalLabel = "What was said"
    var note = "The video was hard to follow as it was said. Tidied into clear steps on this phone; amounts unchanged."
    /// Ingredient names to pick out in the steps.
    var mentions: [String] = []
    var onUndo: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            RewrittenNote(text: note, onUndo: onUndo)
            NumberedSteps(steps: steps, mentions: mentions)
            if let original, !original.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    SectionLabel(originalLabel).padding(.horizontal, -4)
                    Text(original)
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.muted)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
    }
}

/// "Rewritten on device", with Undo, on a card edged in Apple Intelligence's colours.
struct RewrittenNote: View {
    let text: String
    var onUndo: (() -> Void)?

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "wand.and.stars").font(.system(size: 17, weight: .medium)).foregroundStyle(Palette.plum)
                Text("Rewritten on device").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let onUndo {
                    Button(action: onUndo) {
                        Label("Undo", systemImage: "arrow.uturn.backward")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Palette.text)
                            .padding(.horizontal, 10)
                            .frame(height: 30)
                            .background(Palette.surface, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .strokeBorder(Palette.border, lineWidth: 1))
                    }
                    .buttonStyle(PressFade())
                    .accessibilityLabel("Undo the rewrite")
                }
            }
            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.surface, in: shape)
        .overlay(shape.strokeBorder(Self.edge, lineWidth: 1.5))
        .shadow(color: Palette.shadow, radius: 4, y: 2)
    }

    /// The mockup's edge: Apple Intelligence's warm-to-cool sweep.
    static let edge = LinearGradient(
        colors: [Color(red: 0.95, green: 0.65, blue: 0.35), Color(red: 0.85, green: 0.42, blue: 0.53),
                 Color(red: 0.55, green: 0.50, blue: 0.88), Color(red: 0.37, green: 0.70, blue: 0.90)],
        startPoint: .topLeading, endPoint: .bottomTrailing)
}

/// A method's steps with their numbers on the accent's tint (`.stepnum`).
struct NumberedSteps: View {
    let steps: [String]
    var mentions: [String] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .top, spacing: 12) {
                    StepNumber(number: index + 1)
                    (mentions.isEmpty ? Text(step) : IngredientMentions.text(step, names: mentions))
                        .font(.system(size: 16))
                        .foregroundStyle(Palette.text)
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}

// MARK: - Samples

extension StructuredRecipe {
    /// The mockup's TikTok: raspberry crumble bars, read from a caption and rewritten here.
    static let crumbleBars = StructuredRecipe(
        name: "Raspberry crumble bars", servings: 12, prep: 15, cook: 35,
        ingredients: ["200 g plain flour", "100 g oats", "100 g sugar", "150 g butter", "250 g raspberries"],
        steps: ["Heat oven to 180°C and line a 20 cm tin.",
                "Rub butter into flour, oats and sugar until it looks like crumbs.",
                "Press two-thirds into the tin. Spread raspberries on top.",
                "Scatter the rest of the crumble. Bake 35 minutes, cool before slicing."],
        url: "https://www.tiktok.com/@bakewithlou/video/7301")

    static let crumbleCaption = "ok so oven 180 line ur tin!! then butter flour oats sugar rub it all in til crumbly, "
        + "press most in, raspberries, rest on top, 35 min, let it cool or itll fall apart lol"
}

#Preview("Rewritten on device") {
    NavigationStack {
        ScrollView {
            RewrittenMethod(steps: StructuredRecipe.crumbleBars.steps, original: StructuredRecipe.crumbleCaption,
                            originalLabel: "Original caption",
                            note: "The video caption was hard to follow. Tidied into clear steps; amounts unchanged.",
                            onUndo: {})
                .padding(20)
        }
        .pageBackground()
        .centeredTitle("Method")
    }
}

#Preview("Shared card — dark") {
    VStack(spacing: 16) {
        SharedItemCard(title: "Raspberry crumble bars", source: "tiktok.com/@bakewithlou", status: "caption found", isVideo: true)
        HStack { ChipFace(title: "Gehan house", isOn: true); ChipFace(title: "Snacks", isOn: true); ChipFace(title: "+ Group", isOn: false) }
    }
    .padding(20)
    .frame(maxHeight: .infinity, alignment: .top)
    .pageBackground()
    .preferredColorScheme(.dark)
}
