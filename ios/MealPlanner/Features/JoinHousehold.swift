import AVFoundation
import SwiftUI

/**
 The two links the app hands to a person — an invite into a household and an owner's password
 reset — picked out of whatever was scanned or pasted. Only the path matters: the code may have
 been made on the web at meals.gehan.cloud or at the LAN address, and a token means the same
 thing to the same server either way.
*/
enum AppLink: Hashable {
    case invite(String)
    case reset(String)

    static func parse(_ text: String) -> AppLink? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let path = URL(string: trimmed)?.path ?? trimmed
        let parts = path.split(separator: "/").map(String.init)
        guard let at = parts.lastIndex(where: { $0 == "invite" || $0 == "reset" }), at + 1 < parts.count else {
            return nil
        }
        let token = parts[at + 1]
        guard token.count >= 20, token.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }) else {
            return nil
        }
        return parts[at] == "invite" ? .invite(token) : .reset(token)
    }

    /// The host a scanned link names, when it is not the server this app talks to — the usual
    /// reason a link that works on the web says "doesn't work" here.
    static func otherHost(in text: String) -> String? {
        guard let host = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines))?.host,
              let ours = URL(string: Config.baseURL)?.host, host != ours else { return nil }
        return host
    }
}

// MARK: - The scan screen

/**
 Point the camera at an invite QR code — somebody's Invite card, held up across the kitchen.

 A dedicated screen rather than a corner of another: the camera is the whole job, so it gets the
 whole screen, with a frame to aim through, the torch for a dim room, and a way to paste the link
 instead for anyone who was sent it rather than shown it. A reset link's code works here too.
*/
struct ScanInviteScreen: View {
    var session: Session

    @Environment(\.dismiss) private var dismiss
    @State private var opened: AppLink?
    @State private var scanned = ""
    @State private var problem: String?
    @State private var denied = false
    @State private var noCamera = false
    @State private var torch = false
    @State private var pasting = false
    @State private var pasted = ""
    /// Bumped to set the camera looking again after a code that was not ours.
    @State private var again = 0

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                if denied || noCamera {
                    cameraUnavailable
                } else {
                    QRCamera(torch: torch, again: again, onFound: found, onDenied: { denied = true },
                             onUnavailable: { noCamera = true })
                        .ignoresSafeArea()
                    viewfinder
                }
            }
            .navigationTitle("Scan an invite")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(Color.black.opacity(0.6), for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
                if !denied && !noCamera {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            torch.toggle()
                        } label: {
                            Image(systemName: torch ? "flashlight.on.fill" : "flashlight.off.fill")
                        }
                        .accessibilityLabel(torch ? "Turn the light off" : "Turn the light on")
                    }
                }
            }
            .navigationDestination(item: $opened) { link in
                switch link {
                case .invite(let token):
                    JoinHouseholdView(session: session, token: token, scannedFrom: scanned) { dismiss() }
                case .reset(let token):
                    ResetPasswordView(session: session, token: token, scannedFrom: scanned) { dismiss() }
                }
            }
            .alert("Paste an invite link", isPresented: $pasting) {
                TextField("https://…/invite/…", text: $pasted)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                Button("Cancel", role: .cancel) { pasted = "" }
                Button("Open") { found(pasted) }
            } message: {
                Text("The link somebody sent you — it has /invite/ in it.")
            }
        }
        // Back from an invite or reset link that did not work out: the camera stopped when it
        // read the code, so set it looking again rather than leave a frozen picture.
        .onChange(of: opened) {
            if opened == nil { again += 1 }
        }
        .onAppear {
            #if DEBUG
            // -mp_debug_invite <token> opens that invite as though it had just been scanned.
            if let token = UserDefaults.standard.string(forKey: "mp_debug_invite") { opened = .invite(token) }
            #endif
        }
    }

    private var viewfinder: some View {
        ZStack {
            // Everything outside the frame dimmed, so there is no doubt where to aim.
            Color.black.opacity(0.5)
                .mask {
                    Rectangle()
                        .overlay {
                            RoundedRectangle(cornerRadius: 24)
                                .frame(width: 250, height: 250)
                                .blendMode(.destinationOut)
                        }
                        .compositingGroup()
                }
                .ignoresSafeArea()
                .allowsHitTesting(false)
            RoundedRectangle(cornerRadius: 24)
                .strokeBorder(.white, lineWidth: 3)
                .frame(width: 250, height: 250)
            VStack {
                Spacer()
                Color.clear.frame(width: 250, height: 250)
                Text(problem ?? "Point your camera at an invite QR code")
                    .font(.headline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(problem == nil ? .white : Palette.accent)
                    .padding(.horizontal, 32)
                    .padding(.top, 20)
                Spacer()
                pasteButton.padding(.bottom, 24)
            }
        }
    }

    private var pasteButton: some View {
        Button {
            pasting = true
        } label: {
            Label("Paste a link instead", systemImage: "link")
                .font(.body.weight(.semibold))
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(.white.opacity(0.18), in: Capsule())
                .foregroundStyle(.white)
        }
    }

    private var cameraUnavailable: some View {
        VStack(spacing: 16) {
            Image(systemName: denied ? "camera.badge.ellipsis" : "camera")
                .font(.system(size: 44))
                .foregroundStyle(.white.opacity(0.8))
            Text(denied ? "Meal Planner can't use the camera" : "No camera here")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.white)
            Text(denied
                 ? "To scan invite codes, turn on Camera for Meal Planner in Settings. Or paste the link instead."
                 : "This device has no camera to scan with. Paste the link somebody sent you instead.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.75))
                .padding(.horizontal, 32)
            if let problem {
                Text(problem).foregroundStyle(Palette.accent).multilineTextAlignment(.center).padding(.horizontal, 32)
            }
            if denied {
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                }
                .buttonStyle(.borderedProminent)
            }
            pasteButton
        }
    }

    private func found(_ text: String) {
        pasted = ""
        guard let link = AppLink.parse(text) else {
            problem = text.trimmingCharacters(in: .whitespaces).isEmpty
                ? nil
                : "That isn't a Meal Planner invite. Point at the code on somebody's Invite card."
            again += 1
            return
        }
        problem = nil
        scanned = text
        opened = link
    }
}

/// The camera, looking for QR codes only, with the torch and a way to start looking again.
struct QRCamera: UIViewControllerRepresentable {
    var torch: Bool
    var again: Int
    var onFound: (String) -> Void
    var onDenied: () -> Void
    var onUnavailable: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var again = 0
    }

    func makeUIViewController(context: Context) -> BarcodeCameraController {
        let controller = BarcodeCameraController()
        controller.types = [.qr]
        controller.raw = true
        controller.onFound = onFound
        controller.onDenied = onDenied
        if AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) == nil {
            DispatchQueue.main.async { onUnavailable() }
        }
        context.coordinator.again = again
        return controller
    }

    func updateUIViewController(_ controller: BarcodeCameraController, context: Context) {
        controller.onFound = onFound
        controller.onDenied = onDenied
        controller.setTorch(torch)
        if context.coordinator.again != again {
            context.coordinator.again = again
            controller.resume()
        }
    }
}

// MARK: - Joining

/**
 An invite, opened on the phone: whose house, who asked — and then one button if you are signed
 in, or your new account if you are not. Nobody is in a household until they have said yes here
 (or on the web's version of this page).
*/
struct JoinHouseholdView: View {
    var session: Session
    let token: String
    /// What was scanned or pasted, to explain a link made for another server.
    var scannedFrom = ""
    var onDone: () -> Void

    @State private var info: InviteInfo?
    @State private var loadError: String?
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            if let info, info.valid {
                Section {
                    VStack(spacing: 6) {
                        Text("You're invited").font(.footnote.weight(.semibold)).textCase(.uppercase)
                            .foregroundStyle(.secondary)
                        Text("Join \(info.householdName ?? "the household")")
                            .font(.title2.weight(.bold))
                            .multilineTextAlignment(.center)
                        Text(invitedBy(info)).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }
                .listRowBackground(Color.clear)

                if session.isSignedIn {
                    signedIn(info)
                } else {
                    signedOut(info)
                }
            } else if info != nil || loadError != nil {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("This invite doesn't work any more").font(.headline)
                        Text(deadExplanation).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            } else {
                Section { ProgressView().frame(maxWidth: .infinity) }
                    .listRowBackground(Color.clear)
            }
        }
        .navigationTitle("Invite")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private var deadExplanation: String {
        if let loadError { return loadError }
        if let host = AppLink.otherHost(in: scannedFrom) {
            return "It was made on \(host), and this app is using \(Config.baseURL). Change Server on the sign-in screen, or ask for a new link."
        }
        return "Invite links last a week, and the household's owner can swap one for a new one. Ask whoever sent it for a fresh link."
    }

    private func invitedBy(_ info: InviteInfo) -> String {
        let who = info.invitedByName.map { "\($0) invited you" } ?? "Someone there invited you"
        guard let count = info.memberCount, count > 0 else { return who }
        return "\(who) · \(count) \(count == 1 ? "person" : "people")"
    }

    @ViewBuilder
    private func signedIn(_ info: InviteInfo) -> some View {
        Section {
            Text("You'll see its plan, recipes and grocery list alongside your other households, and can switch between them at the top of the screen.")
                .foregroundStyle(.secondary)
        }
        .listRowBackground(Color.clear)
        if let error { Section { Text(error).foregroundStyle(.red) } }
        Section {
            Button { Task { await join() } } label: {
                wide(busy ? nil : "Join \(info.householdName ?? "")")
            }
            .disabled(busy)
        }
    }

    @ViewBuilder
    private func signedOut(_ info: InviteInfo) -> some View {
        Section {
            TextField("Your name", text: $name)
                .textContentType(.name)
            TextField("Email", text: $email)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            SecureField("Password", text: $password)
                .textContentType(.newPassword)
            SecureField("Confirm password", text: $confirm)
                .textContentType(.newPassword)
        } header: {
            Text("Make your account")
        } footer: {
            Text("Passwords need at least 8 characters. Your email is what you'll sign in with.")
        }
        if let error { Section { Text(error).foregroundStyle(.red) } }
        Section {
            Button { Task { await signUp() } } label: {
                wide(busy ? nil : "Create an account and join")
            }
            .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty
                      || email.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty)
        }
        Section {
            Button("I already have an account") {
                // Signing in, by email or by PIN, says yes to this as it lands.
                session.pendingInvite = PendingInvite(token: token, householdName: info.householdName ?? "the household")
                onDone()
            }
            .frame(maxWidth: .infinity)
        } footer: {
            Text("Sign in the usual way and you'll join \(info.householdName ?? "it") straight away.")
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
    }

    private func wide(_ title: String?) -> some View {
        HStack {
            Spacer()
            if let title { Text(title).fontWeight(.semibold) } else { ProgressView() }
            Spacer()
        }
    }

    private func load() async {
        guard info == nil else { return }
        do {
            info = try await APIClient.shared.inviteInfo(token: token)
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func join() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let joined = try await APIClient.shared.acceptInvite(token: token)
            await session.loadHouseholds()
            session.choose(session.households.first { $0.id == joined.id } ?? joined)
            onDone()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func signUp() async {
        guard password.count >= 8 else { error = "Passwords need at least 8 characters."; return }
        guard password.count <= 128 else { error = "Passwords can be at most 128 characters."; return }
        guard password == confirm else { error = "Those passwords don't match."; return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let auth = try await APIClient.shared.signUp(
                inviteToken: token,
                displayName: name.trimmingCharacters(in: .whitespaces),
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password)
            try await session.signIn(auth)
            onDone()
        } catch let failure as APIError where failure.status == 409 {
            // They have an account already: sign in with it, and join on the way.
            session.pendingInvite = PendingInvite(token: token, householdName: info?.householdName ?? "the household")
            session.notice = "\(email.trimmingCharacters(in: .whitespaces)) already has an account. Sign in, and you'll join straight away."
            onDone()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - A reset link, opened on the phone

/**
 The other end of an owner's reset link, natively: choose a new password (and add an email, for
 somebody who never had one), and be signed in. Scanning one while signed in as somebody else
 signs them out — said before anything happens.
*/
struct ResetPasswordView: View {
    var session: Session
    let token: String
    var scannedFrom = ""
    var onDone: () -> Void

    @State private var info: PasswordResetInfo?
    @State private var loadError: String?
    @State private var email = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            if let info, info.valid {
                Section {
                    VStack(spacing: 6) {
                        Text("Hi, \(info.displayName ?? "there")").font(.title2.weight(.bold))
                        Text(info.hasEmail ? "Choose a new password." : "Add your email and choose a password.")
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }
                .listRowBackground(Color.clear)

                if session.isSignedIn {
                    Section {
                        Label("Saving signs this phone in as \(info.displayName ?? "them"), instead of \(session.displayName ?? "you").",
                              systemImage: "person.2")
                            .foregroundStyle(.secondary)
                    }
                }
                Section {
                    if !info.hasEmail {
                        TextField("Email", text: $email)
                            .textContentType(.username)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    SecureField("New password", text: $password).textContentType(.newPassword)
                    SecureField("Confirm password", text: $confirm).textContentType(.newPassword)
                } footer: {
                    Text("At least 8 characters.")
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
                Section {
                    Button { Task { await save(info) } } label: {
                        HStack {
                            Spacer()
                            if busy { ProgressView() } else { Text("Set password and sign in").fontWeight(.semibold) }
                            Spacer()
                        }
                    }
                    .disabled(busy || password.isEmpty || (!info.hasEmail && email.trimmingCharacters(in: .whitespaces).isEmpty))
                }
            } else if info != nil || loadError != nil {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("This link doesn't work any more").font(.headline)
                        Text(loadError ?? AppLink.otherHost(in: scannedFrom).map {
                            "It was made on \($0), and this app is using \(Config.baseURL)."
                        } ?? "Reset links work once, for a day. Ask the owner of your household to make you a new one.")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            } else {
                Section { ProgressView().frame(maxWidth: .infinity) }
                    .listRowBackground(Color.clear)
            }
        }
        .navigationTitle("Reset password")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard info == nil else { return }
            do { info = try await APIClient.shared.resetInfo(token: token) } catch { loadError = error.localizedDescription }
        }
    }

    private func save(_ info: PasswordResetInfo) async {
        guard password.count >= 8 else { error = "Passwords need at least 8 characters."; return }
        guard password == confirm else { error = "Those passwords don't match."; return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let auth = try await APIClient.shared.useReset(
                token: token, password: password,
                email: info.hasEmail ? nil : email.trimmingCharacters(in: .whitespacesAndNewlines))
            if session.isSignedIn { await session.signOut() }
            if try await session.signIn(auth) {
                onDone()
            } else {
                // Their password is set, but they are in no house to open.
                session.notice = "Your password is set. You're not in a household yet — ask someone for an invite link."
                onDone()
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Scan") {
    ScanInviteScreen(session: Session())
}

#Preview("Join") {
    NavigationStack {
        JoinHouseholdView(session: Session(), token: "preview-token-that-is-long-enough") {}
    }
}
