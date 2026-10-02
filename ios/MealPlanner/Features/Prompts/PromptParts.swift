import SwiftUI

/*
 The pieces the prompts share (the mockup's section 07): the questions the app asks on its own,
 over whatever tab it opened on — add an email, time to restock, stock your cupboard — and the
 notice that you were taken out of a household. Built on the design system and nothing else.
*/

/**
 A prompt's heading. `stacked` puts the tile over the title, as the add-an-email prompt does
 (7.1); otherwise it sits beside the title and the line under it, as on Time to restock? (7.2).
 With no icon it is just the title and the line (Stock your cupboard, 7.3).
 */
struct PromptHeader: View {
    var systemImage: String?
    var tone: Tone = .accent
    let title: String
    var line: String?
    var stacked = false

    var body: some View {
        if let systemImage, stacked {
            VStack(alignment: .leading, spacing: 16) {
                Tile(systemImage, tone: tone, size: 52, radius: 16)
                words(size: 26)
            }
        } else if let systemImage {
            HStack(spacing: 12) {
                Tile(systemImage, tone: tone, size: 48, radius: 14)
                words(size: 24)
            }
        } else {
            words(size: 26)
        }
    }

    private func words(size: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: stacked ? 6 : 2) {
            Text(title)
                .titleFont(size)
                .foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if let line {
                Text(line)
                    // 15pt under the stacked heading (7.1); 14pt otherwise, as the mockup's
                    // sheet heading has it (7.3), so "anytime." is not left on a line of its own.
                    .font(.system(size: stacked ? 15 : 14))
                    .foregroundStyle(Palette.muted)
                    .lineSpacing(stacked ? 3 : 1)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The quiet way out under a prompt's main button: "Not now", "Skip", "Skip all for 3 days".
struct PromptWayOut: View {
    let title: String
    let action: () -> Void

    init(_ title: String, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }

    var body: some View {
        Button(title, action: action)
            .buttonStyle(.kitchen(.ghost))
            // The mockup's 40pt under a 52pt button, tucked up to it.
            .padding(.vertical, -6)
            .padding(.top, -4)
    }
}

/**
 Taken out of a household and moved to another of yours (7.4): the door on plum, who took you
 out of where, and where you are now. Said once, so the switch does not look like the app losing
 its place.
 */
struct HouseholdRemovedCard: View {
    let removedFrom: String
    let movedTo: String
    let onOK: () -> Void

    var body: some View {
        KitchenAlertCard(
            systemImage: "door.left.hand.open",
            tone: .plum,
            title: "You've been removed from \(removedFrom)",
            message: Text("We've moved you to ") + Text(movedTo).bold().foregroundColor(Palette.text)
                + Text(", another of your households."),
            centered: true
        ) {
            Button("OK", action: onOK)
                .buttonStyle(.primary)
        }
    }
}

#Preview("Removed from a household") {
    Color.clear.pageBackground()
        .kitchenAlert(isPresented: .constant(true)) {
            HouseholdRemovedCard(removedFrom: "Gehan house", movedTo: "Beach crew") {}
        }
}

#Preview("Prompt headers — dark") {
    VStack(alignment: .leading, spacing: 32) {
        PromptHeader(systemImage: "envelope", tone: .sky, title: "Add an email and password",
                     line: "PIN sign-in is being retired. Add these once and you'll use them from now on.", stacked: true)
        PromptHeader(systemImage: "bell", tone: .mustard, title: "Time to restock?", line: "4 reminders are due")
        PromptHeader(title: "Stock your cupboard", line: "Tick what you already have. You can change it anytime.")
        PromptWayOut("Not now") {}
    }
    .padding(20)
    .frame(maxHeight: .infinity, alignment: .top)
    .pageBackground()
    .preferredColorScheme(.dark)
}
