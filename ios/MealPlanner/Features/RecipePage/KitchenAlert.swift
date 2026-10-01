import SwiftUI

/**
 The mockup's alert (`.alert`): a white card over the dimmed page with an icon tile, a serif
 question, a sentence and the buttons — for the decisions that deserve a stop, "Delete Lemon
 herb chicken?" (3.20) and "Make a new link?" (3.12). The system alert cannot be drawn this way.

     .kitchenAlert(isPresented: $asking) {
         KitchenAlertCard(title: "Make a new link?", message: Text("…"), centered: true) {
             HStack { … the buttons … }
         }
     }

 Tapping the dimmed page counts as the way out, as on the web.
 */
struct KitchenAlertCard<Actions: View>: View {
    var systemImage: String?
    var tone: Tone = .accent
    let title: String
    var message: Text?
    var centered = false
    @ViewBuilder var actions: Actions

    var body: some View {
        VStack(alignment: centered ? .center : .leading, spacing: 14) {
            if let systemImage { Tile(systemImage, tone: tone, size: 48) }
            Text(title)
                .titleFont(20)
                .foregroundStyle(Palette.text)
                .multilineTextAlignment(centered ? .center : .leading)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if let message {
                message
                    .font(.system(size: 14))
                    .foregroundStyle(Palette.muted)
                    .lineSpacing(3)
                    .multilineTextAlignment(centered ? .center : .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            actions
        }
        .frame(maxWidth: .infinity, alignment: centered ? .center : .leading)
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 16)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.18), radius: 24, y: 10)
        .frame(maxWidth: 400)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }
}

extension View {
    /// Shows `content` — a KitchenAlertCard — centred over the dimmed screen while `isPresented`.
    func kitchenAlert<Content: View>(isPresented: Binding<Bool>, @ViewBuilder content: @escaping () -> Content) -> some View {
        overlay {
            if isPresented.wrappedValue {
                ZStack {
                    Palette.scrim
                        .ignoresSafeArea()
                        .onTapGesture { isPresented.wrappedValue = false }
                        .accessibilityHidden(true)
                    content().padding(.horizontal, 36)
                }
                .transition(.opacity.combined(with: .scale(scale: 0.98)))
            }
        }
        .animation(.easeOut(duration: 0.18), value: isPresented.wrappedValue)
    }
}

#Preview("Alert") {
    Color.clear.pageBackground()
        .kitchenAlert(isPresented: .constant(true)) {
            KitchenAlertCard(systemImage: "trash", title: "Delete Lemon herb chicken?",
                             message: Text("It's shared with ") + Text("Beach crew").bold().foregroundColor(Palette.text)
                                + Text(". If it's on their plan, their plan will keep the name as text.")) {
                VStack(spacing: 8) {
                    Button("Delete recipe") {}.buttonStyle(.primary)
                    Button("Keep it") {}.buttonStyle(.secondary)
                }
            }
        }
}

#Preview("Alert — dark") {
    Color.clear.pageBackground()
        .kitchenAlert(isPresented: .constant(true)) {
            KitchenAlertCard(title: "Make a new link?",
                             message: Text("The old link will stop working for anyone you've sent it to."), centered: true) {
                HStack(spacing: 8) {
                    Button("Cancel") {}.buttonStyle(.secondary)
                    Button("New link") {}.buttonStyle(.primary)
                }
            }
        }
        .preferredColorScheme(.dark)
}
