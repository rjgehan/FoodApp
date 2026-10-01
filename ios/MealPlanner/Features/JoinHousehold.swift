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
        let url = URL(string: trimmed)
        // The app's own scheme puts the kind where a web link has its host:
        // mealplanner://invite/<token> is the same as https://…/invite/<token>.
        let path = url?.scheme == "mealplanner" ? "/\(url?.host ?? "")\(url?.path ?? "")" : url?.path ?? trimmed
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
 An invite, opened on the phone (1.4–1.6): whose house, who asked — then one button if you are
 signed in (or "you're already in it"), or your new account if you are not, which joins in the
 same step. Nobody is in a household until they have said yes here (or on the web's version).
 A link the server says is dead and a server that cannot be reached are different screens: the
 second is no reason to ask for a new link.
*/
struct JoinHouseholdView: View {
    var session: Session
    let token: String
    /// What was scanned or pasted, to explain a link made for another server.
    var scannedFrom = ""
    var onDone: () -> Void

    private enum Mode: Hashable { case create, signIn }

    @State private var info: InviteInfo?
    @State private var loadFailure: APIError?
    @State private var standing: InviteStanding?
    @State private var me: Me?
    @State private var mode: Mode = .create
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Group {
            if let loadFailure {
                MessageScreen(image: Image(systemName: "wifi"), tone: .mustard, title: "Connection problem",
                              message: loadFailure.isUnreachable
                                  ? "Couldn't reach the server. Your link may be fine: check your connection and try again."
                                  : loadFailure.localizedDescription) {
                    Button { Task { await load() } } label: { Label("Retry", systemImage: "arrow.clockwise") }
                        .buttonStyle(.primary)
                    // A way out as well as Retry: the usual reason is the wrong server, and
                    // Server is on the sign-in screen this one stands in front of.
                    Button(session.isSignedIn ? "Close" : "Go to sign in") { onDone() }
                        .buttonStyle(.secondary)
                }
            } else if let info, !info.valid {
                MessageScreen(image: Image("LinkBroken"), title: "This invite has expired", message: deadExplanation) {
                    Button(session.isSignedIn ? "Close" : "Go to sign in") { onDone() }
                        .buttonStyle(.secondary)
                }
            } else if let info, session.isSignedIn {
                if let standing { signedIn(info, standing: standing) } else { loading }
            } else if let info {
                signedOut(info)
            } else {
                loading
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        // Pushed from the camera's black screen: this page is the app's own paper again.
        .toolbarBackground(Palette.bg, for: .navigationBar)
        .toolbarColorScheme(nil, for: .navigationBar)
        .task { await load() }
    }

    private var loading: some View {
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).pageBackground()
    }

    private var deadExplanation: String {
        if let host = AppLink.otherHost(in: scannedFrom) {
            return "It was made on \(host), and this app is using \(Config.baseURL). Change Server on the sign-in screen, or ask for a new link."
        }
        return "Invite links last a week, and the owner can make a new one, which stops the old one working. Ask them to send you the new one."
    }

    private var household: String { info?.householdName ?? "the household" }

    // MARK: Signed in (1.5)

    private func signedIn(_ info: InviteInfo, standing: InviteStanding) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                InviteCard(info: info, ownLink: standing.alreadyMember)
                if standing.alreadyMember {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("You're already in \(household)", systemImage: "checkmark")
                            .font(.system(size: 14, weight: .semibold))
                        Text("This is its invite link, and it works. Send it to whoever you want to join.")
                            .font(.system(size: 13))
                    }
                    .foregroundStyle(Palette.herb)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(Palette.herbSoft, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                } else {
                    ListGroup {
                        ListRow("Joining as \(me?.displayName ?? session.displayName ?? "you")",
                                subtitle: me?.email,
                                leading: { Avatar(me?.displayName ?? session.displayName ?? "?", tone: .mustard) }) {
                            Button("Not you?") {
                                Task {
                                    await session.signOut()
                                    onDone()
                                }
                            }
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Palette.accentInk)
                        }
                    }
                    Text("You'll see its plan, recipes and grocery list alongside your other households, and can switch between them at the top of the screen.")
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                }
                if let error {
                    Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
                }
            }
            .padding(.horizontal, 20)
            // Clear of the sheet's top edge when it opens over the app, as the mockup leaves it.
            .padding(.top, 16)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                if standing.alreadyMember, let id = standing.householdId {
                    Button { open(id) } label: { Label("Open \(household)", systemImage: "house") }
                        .buttonStyle(.primary)
                } else {
                    Button { Task { await join() } } label: {
                        if busy { ProgressView().tint(Palette.onAccent) } else { Label("Join \(household)", systemImage: "person.2") }
                    }
                    .buttonStyle(.primary)
                    .disabled(busy)
                    // Said, not left to a swipe nothing on screen suggests — as on the web.
                    PromptWayOut("Not now") { onDone() }
                        .disabled(busy)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
            .frame(maxWidth: 440)
        }
        .pageBackground()
    }

    // MARK: Signed out (1.4)

    private func signedOut(_ info: InviteInfo) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                InviteCard(info: info)
                SegmentedControl(selection: $mode, options: [(.create, "New account"), (.signIn, "I have an account")])
                    .onChange(of: mode) {
                        error = nil
                        password = ""
                        confirm = ""
                    }
                if mode == .create { createForm } else { signInForm }
                if let error {
                    Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 24)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .pageBackground()
    }

    private var createForm: some View {
        VStack(spacing: 12) {
            FieldBox(nil, text: $name, prompt: "Your name", systemImage: "person")
                .textContentType(.name)
            FieldBox(nil, text: $email, prompt: "Email", systemImage: "envelope")
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            FieldBox(nil, text: $password, prompt: "Password", systemImage: "lock", secure: true)
                .textContentType(.newPassword)
            FieldBox(nil, text: $confirm, prompt: "Confirm password", systemImage: "lock", secure: true) {
                MatchTick(shown: !confirm.isEmpty && confirm == password)
            }
            .textContentType(.newPassword)
            Button { Task { await signUp() } } label: {
                if busy { ProgressView().tint(Palette.onAccent) } else { Text("Create account & join") }
            }
            .buttonStyle(.primary)
            .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty
                      || email.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty)
            .padding(.top, 4)
            Text("At least 8 characters. Your email is what you'll sign in with.")
                .font(.system(size: 13)).foregroundStyle(Palette.muted)
                .multilineTextAlignment(.center)
        }
    }

    /// An account already: sign in here and join as it lands — or by name and PIN, on the
    /// sign-in screen's older steps, with the join waiting at the end.
    private var signInForm: some View {
        VStack(spacing: 12) {
            Text("Sign in, and you'll join straight away.")
                .font(.system(size: 15)).foregroundStyle(Palette.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 4)
            FieldBox(nil, text: $email, prompt: "Email", systemImage: "envelope")
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            FieldBox(nil, text: $password, prompt: "Password", systemImage: "lock", secure: true)
                .textContentType(.password)
                .submitLabel(.go)
                .onSubmit { Task { await signInAndJoin() } }
            Button { Task { await signInAndJoin() } } label: {
                if busy { ProgressView().tint(Palette.onAccent) } else { Text("Sign in and join") }
            }
            .buttonStyle(.primary)
            .disabled(busy || email.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty)
            .padding(.top, 4)
            Button("Sign in with your name and PIN") {
                // Signing in by PIN says yes to this as it lands.
                session.pendingInvite = PendingInvite(token: token, householdName: household)
                onDone()
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(Palette.muted)
            .padding(.top, 4)
        }
    }

    // MARK: Behaviour

    private func load() async {
        loadFailure = nil
        do {
            let fetched = try await APIClient.shared.inviteInfo(token: token)
            if fetched.valid, session.isSignedIn {
                // Not knowing is no reason to hold them up: Join is harmless for somebody already in.
                standing = (try? await APIClient.shared.inviteStanding(token: token))
                    ?? InviteStanding(alreadyMember: false, householdId: nil)
                me = try? await APIClient.shared.me()
            }
            info = fetched
        } catch let failure as APIError {
            loadFailure = failure
        } catch {
            loadFailure = APIError(status: 0, body: error.localizedDescription)
        }
    }

    private func open(_ id: UUID) {
        if let house = session.households.first(where: { $0.id == id }) { session.choose(house) }
        onDone()
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
            mode = .signIn
            error = "\(email.trimmingCharacters(in: .whitespaces)) already has an account. Sign in, and you'll join straight away."
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func signInAndJoin() async {
        let typed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !typed.isEmpty, !password.isEmpty, !busy else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let auth = try await APIClient.shared.logIn(email: typed, password: password)
            // Signing in with an invite waiting says yes to it first, and opens that house.
            session.pendingInvite = PendingInvite(token: token, householdName: household)
            if try await session.signIn(auth) {
                onDone()
            } else {
                error = "Signed in, but the invite didn't work. Ask for a new link."
            }
        } catch let failure as APIError where failure.lockoutSeconds != nil {
            session.pendingInvite = nil
            error = "Too many sign-in attempts. For safety, try again in \(countdown(failure.lockoutSeconds ?? 60))."
        } catch {
            session.pendingInvite = nil
            self.error = error.localizedDescription
        }
    }
}

// MARK: - A reset link, opened on the phone

/**
 The other end of an owner's reset link, natively (1.7): choose a new password (and add an
 email, for somebody who never had one), and be signed in. Scanning one while signed in as
 somebody else signs them out — said before anything happens.
*/
struct ResetPasswordView: View {
    var session: Session
    let token: String
    var scannedFrom = ""
    var onDone: () -> Void

    @State private var info: PasswordResetInfo?
    @State private var loadFailure: APIError?
    @State private var email = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Group {
            if let loadFailure {
                MessageScreen(image: Image(systemName: "wifi"), tone: .mustard, title: "Connection problem",
                              message: loadFailure.isUnreachable
                                  ? "Couldn't reach the server. Your link may be fine: check your connection and try again."
                                  : loadFailure.localizedDescription) {
                    Button { Task { await load() } } label: { Label("Retry", systemImage: "arrow.clockwise") }
                        .buttonStyle(.primary)
                    // A way out as well as Retry: the usual reason is the wrong server, and
                    // Server is on the sign-in screen this one stands in front of.
                    Button(session.isSignedIn ? "Close" : "Go to sign in") { onDone() }
                        .buttonStyle(.secondary)
                }
            } else if let info, info.valid {
                form(info)
            } else if info != nil {
                MessageScreen(image: Image("LinkBroken"), title: "This link doesn't work any more",
                              message: AppLink.otherHost(in: scannedFrom).map {
                                  "It was made on \($0), and this app is using \(Config.baseURL)."
                              } ?? "Reset links work once, for a day. Ask the owner of your household to make you a new one.") {
                    Button(session.isSignedIn ? "Close" : "Go to sign in") { onDone() }
                        .buttonStyle(.secondary)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).pageBackground()
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Palette.bg, for: .navigationBar)
        .toolbarColorScheme(nil, for: .navigationBar)
        .task { if info == nil { await load() } }
    }

    private func form(_ info: PasswordResetInfo) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 12) {
                    Tile("key", tone: .accent, size: 56)
                    Text("New password for \(info.displayName ?? "you")").titleFont(28).foregroundStyle(Palette.text)
                        .accessibilityAddTraits(.isHeader)
                    Text("This link works once. After saving you'll be signed straight in.")
                        .font(.system(size: 15)).foregroundStyle(Palette.muted)
                }
                if session.isSignedIn {
                    NoteBox("Saving signs this phone in as \(info.displayName ?? "them"), instead of \(session.displayName ?? "you").",
                            tone: .sky, systemImage: "person.2")
                }
                VStack(spacing: 14) {
                    FieldBox("New password", text: $password, systemImage: "lock", secure: true)
                        .textContentType(.newPassword)
                    FieldBox("Confirm password", text: $confirm, systemImage: "lock", secure: true) {
                        MatchTick(shown: !confirm.isEmpty && confirm == password)
                    }
                    .textContentType(.newPassword)
                }
                if !info.hasEmail {
                    Card(spacing: 12) {
                        HStack(spacing: 8) {
                            Image(systemName: "envelope").font(.system(size: 15)).foregroundStyle(Palette.sky)
                            Text("Add an email").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.text)
                            Pill("Needed", tone: .sky)
                        }
                        Text("Your account doesn't have one yet. You'll use it to sign in from now on.")
                            .font(.system(size: 13)).foregroundStyle(Palette.muted)
                        FieldBox(nil, text: $email, prompt: "you@example.com", systemImage: "envelope")
                            .textContentType(.username)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                }
                if let error {
                    Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 24)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            Button { Task { await save(info) } } label: {
                if busy { ProgressView().tint(Palette.onAccent) } else { Text("Save and sign in") }
            }
            .buttonStyle(.primary)
            .disabled(busy || password.isEmpty || (!info.hasEmail && email.trimmingCharacters(in: .whitespaces).isEmpty))
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
            .frame(maxWidth: 440)
        }
        .pageBackground()
    }

    private func load() async {
        loadFailure = nil
        do {
            info = try await APIClient.shared.resetInfo(token: token)
        } catch let failure as APIError {
            loadFailure = failure
        } catch {
            loadFailure = APIError(status: 0, body: error.localizedDescription)
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
