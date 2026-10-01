import SwiftUI
import UIKit

/*
 The share sheet's card (mockup 7.6): Cancel, the app's name and Save across the top; what
 arrived, on a card; and Read as recipe or Keep as saved link.

 The extension cannot reach the signed-in session (see ShareViewController), so it does not know
 the households or their groups: those chips are in the app, on the screen this hands over to,
 and a line here says so. Nor can it read the theme picked in the app, so it wears Tomato, the
 default — its colours copied here because the app's design files are not in this target.
*/

/// What the card shows, filled in as the shared thing is read.
final class ShareCardModel: ObservableObject {
    enum Way: Hashable { case recipe, link }

    @Published var reading = true
    @Published var title = ""
    @Published var source: String?
    @Published var status = ""
    @Published var isVideo = false
    /// Whether there is a link to keep at all — shared text alone can only be read.
    @Published var canKeep = false
    @Published var way: Way = .recipe
    /// Something went wrong, said in place of the card's buttons.
    @Published var message: String?
}

struct ShareCard: View {
    @ObservedObject var model: ShareCardModel
    var onCancel: () -> Void
    var onSave: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Capsule().fill(Kitchen.faint.opacity(0.7)).frame(width: 38, height: 5)
                .frame(maxWidth: .infinity)
                .padding(.top, 8)

            HStack {
                Button("Cancel", action: onCancel)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Kitchen.accentInk)
                Spacer()
                HStack(spacing: 8) {
                    Image(systemName: "fork.knife")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 26, height: 26)
                        .background(Kitchen.accent, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    Text("Meal Planner").font(.system(size: 17, weight: .semibold)).foregroundStyle(Kitchen.text)
                }
                Spacer()
                Button("Save", action: onSave)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Kitchen.accentInk)
                    .disabled(model.reading || model.message != nil)
                    .opacity(model.reading || model.message != nil ? 0.45 : 1)
            }

            card

            if let message = model.message {
                Text(message).font(.system(size: 14)).foregroundStyle(Kitchen.muted)
            } else {
                segmented
                Text("You'll pick the household and drawer in Meal Planner.")
                    .font(.system(size: 13))
                    .foregroundStyle(Kitchen.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Kitchen.bg.ignoresSafeArea())
    }

    private var card: some View {
        HStack(spacing: 12) {
            ZStack {
                LinearGradient(colors: [Color(red: 0.87, green: 0.48, blue: 0.60), Color(red: 0.62, green: 0.22, blue: 0.36)],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                Image(systemName: model.isVideo ? "play" : "link")
                    .font(.system(size: 20, weight: .regular))
                    .foregroundStyle(.white.opacity(0.9))
            }
            .frame(width: 56, height: 56)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(model.reading ? "Reading…" : model.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Kitchen.text)
                    .lineLimit(2)
                Text([model.source, model.status].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.system(size: 12))
                    .foregroundStyle(Kitchen.muted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if model.reading { ProgressView() }
        }
        .padding(10)
        .background(Kitchen.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Kitchen.border, lineWidth: 1))
        .shadow(color: .black.opacity(0.05), radius: 4, y: 2)
    }

    private var segmented: some View {
        HStack(spacing: 0) {
            option(.recipe, "Read as recipe", enabled: true)
            option(.link, "Keep as saved link", enabled: model.canKeep)
        }
        .padding(3)
        .background(Kitchen.surface2, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
    }

    private func option(_ way: ShareCardModel.Way, _ title: String, enabled: Bool) -> some View {
        let on = model.way == way
        return Button {
            model.way = way
        } label: {
            Text(title)
                .font(.system(size: 14, weight: on ? .semibold : .medium))
                .foregroundStyle(on ? Kitchen.text : Kitchen.muted)
                .lineLimit(1)
                .frame(maxWidth: .infinity, minHeight: 32)
                .background {
                    if on {
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill(Kitchen.surface)
                            .shadow(color: .black.opacity(0.12), radius: 1.5, y: 1)
                    }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// Tomato Kitchen's tokens, light and dark — the app's default theme.
private enum Kitchen {
    static let bg = pair(0xFBF6EE, 0x17120F)
    static let surface = pair(0xFFFFFF, 0x231C17)
    static let surface2 = pair(0xF4ECDF, 0x2E251E)
    static let text = pair(0x2B211A, 0xF6EDE3)
    static let muted = pair(0x7C6B5C, 0xA99A8B)
    static let faint = pair(0xB3A596, 0x6E6155)
    static let border = pair(0xEADFCF, 0x3A3029)
    static let accent = pair(0xD4512E, 0xEE6D4A)
    static let accentInk = pair(0xC2461F, 0xF2825F)

    private static func pair(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(UIColor { traits in
            let rgb = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((rgb >> 16) & 0xFF) / 255, green: CGFloat((rgb >> 8) & 0xFF) / 255,
                           blue: CGFloat(rgb & 0xFF) / 255, alpha: 1)
        })
    }
}

#Preview("Share card") {
    let model = ShareCardModel()
    model.reading = false
    model.title = "Raspberry crumble bars"
    model.source = "tiktok.com/@bakewithlou"
    model.status = "video link"
    model.isVideo = true
    model.canKeep = true
    return ShareCard(model: model, onCancel: {}, onSave: {})
}
