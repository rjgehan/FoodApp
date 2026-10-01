import SwiftUI

/*
 The pieces the signed-out screens share (the mockup's section 01): the app's mark and welcome,
 the invite's "who asked" card, the one-message screen a broken link gets, and a field's tick.
 Built from the design system (Features/Design) and nothing else, so every theme and both
 modes come for free.
 */

/// The app's mark (`logo`): the chef's hat on a tomato tile, on a glow of its own colour.
struct AppMark: View {
    var size: CGFloat = 64

    var body: some View {
        Image("ChefHat")
            .resizable()
            .renderingMode(.template)
            .frame(width: size * 0.52, height: size * 0.52)
            .foregroundStyle(Palette.onAccent)
            .frame(width: size, height: size)
            .background(Palette.accent, in: RoundedRectangle(cornerRadius: size * 0.32, style: .continuous))
            .shadow(color: Palette.accent.opacity(0.35), radius: 10, y: 8)
            .accessibilityHidden(true)
    }
}

/// The top of the sign-in screen: the mark, the name, and what it is for.
struct WelcomeBrand: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            AppMark()
            VStack(alignment: .leading, spacing: 6) {
                Text("Meal Planner").titleFont(32).foregroundStyle(Palette.text)
                    .accessibilityAddTraits(.isHeader)
                Text("Plan the week together. One list, everyone's phone.")
                    .font(.system(size: 16))
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/**
 Who asked and into what — the top of every invite screen (`inviteHead`). The faces are the
 person who sent it and a count of everyone else, which is all a link may say about a house.
 */
struct InviteCard: View {
    let info: InviteInfo

    private var household: String { info.householdName ?? "the household" }
    private var people: Int { info.memberCount ?? 0 }

    var body: some View {
        VStack(spacing: 14) {
            faces
            VStack(spacing: 4) {
                Group {
                    if let who = info.invitedByName {
                        Text(who).fontWeight(.semibold).foregroundStyle(Palette.text)
                            + Text(" invited you to join").foregroundStyle(Palette.muted)
                    } else {
                        Text("You're invited to join").foregroundStyle(Palette.muted)
                    }
                }
                .font(.system(size: 15))
                Text(household).titleFont(28).foregroundStyle(Palette.text)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)
                if people > 0 {
                    Text("\(people) \(people == 1 ? "person" : "people")")
                        .font(.system(size: 13)).foregroundStyle(Palette.muted)
                }
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16)
        .padding(.vertical, 22)
        .cardSurface()
    }

    @ViewBuilder private var faces: some View {
        let others = info.invitedByName == nil ? people : people - 1
        if info.invitedByName != nil || others > 0 {
            HStack(spacing: -10) {
                if let who = info.invitedByName { Avatar(who, tone: .herb, size: 44).overlay(ring) }
                if others > 0 {
                    Text("+\(others)")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Palette.mustard)
                        .frame(width: 44, height: 44)
                        .background(Palette.mustardSoft, in: Circle())
                        .overlay(ring)
                }
            }
            .accessibilityHidden(true)
        }
    }

    private var ring: some View { Circle().strokeBorder(Palette.surface, lineWidth: 2) }
}

/**
 One thing to say and what to do about it (`1.8-invite-broken`): a link that no longer works, a
 server that cannot be reached. A big quiet tile, a title, the explanation, then the way on.
 */
struct MessageScreen<Actions: View>: View {
    let image: Image
    var tone: Tone?
    let title: String
    let message: String
    @ViewBuilder var actions: Actions

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                image
                    .resizable()
                    .scaledToFit()
                    .frame(width: 38, height: 38)
                    .foregroundStyle(tone?.ink ?? Palette.muted)
                    .frame(width: 84, height: 84)
                    .background(tone?.soft ?? Palette.surface2, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                    .accessibilityHidden(true)
                VStack(spacing: 8) {
                    Text(title).titleFont(26).foregroundStyle(Palette.text)
                        .accessibilityAddTraits(.isHeader)
                    Text(message)
                        .font(.system(size: 15))
                        .lineSpacing(3)
                        .foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .multilineTextAlignment(.center)
                actions
            }
            .padding(.horizontal, 20)
            .padding(.top, 70)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .pageBackground()
    }
}

/// The green tick at the end of "Confirm password" once it matches (`1.9-reset-password`).
struct MatchTick: View {
    var shown: Bool

    var body: some View {
        if shown {
            Image(systemName: "checkmark")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Palette.herb)
                .accessibilityLabel("They match")
        }
    }
}

extension APIError {
    /// No answer at all — no connection, or the server is down — as opposed to an answer that
    /// says no. A link that could not be checked is not a dead link.
    var isUnreachable: Bool { status == 0 }

    /**
     How long a sign-in lockout has left, in seconds, from a 429. A newer server sends the exact
     number (`retryAfterSeconds`); an older one only words it ("Try again in 12 min.").
     */
    var lockoutSeconds: Int? {
        guard status == 429 else { return nil }
        struct Body: Decodable { let retryAfterSeconds: Int?; let message: String? }
        let decoded = body.data(using: .utf8).flatMap { try? JSONDecoder().decode(Body.self, from: $0) }
        if let seconds = decoded?.retryAfterSeconds, seconds > 0 { return seconds }
        if let message = decoded?.message,
           let match = message.firstMatch(of: /(\d+)\s*min/), let minutes = Int(match.1) {
            return minutes * 60
        }
        return 60
    }
}

/// 292 seconds → "4:52", the way the mockup counts down.
func countdown(_ seconds: Int) -> String {
    String(format: "%d:%02d", max(0, seconds) / 60, max(0, seconds) % 60)
}

#Preview("Welcome parts") {
    ScrollView {
        VStack(spacing: 24) {
            WelcomeBrand()
            InviteCard(info: InviteInfo(valid: true, householdName: "Gehan house", invitedByName: "Jo", memberCount: 4))
            NoteBox(text: Text("Too many sign-in attempts.").bold() + Text("\nFor safety, try again in 4:52."),
                    tone: .accent, systemImage: "lock")
        }
        .padding(20)
    }
    .pageBackground()
}

#Preview("Message") {
    MessageScreen(image: Image("LinkBroken"), title: "This invite has expired",
                  message: "Invite links last a week, and the owner can make a new one. Ask them to send you the new one.") {
        Button("Go to sign in") {}.buttonStyle(.secondary)
    }
}
