import CoreImage.CIFilterBuiltins
import SwiftUI

/**
 The email and password you sign in with — added the first time from the prompt that follows a
 PIN sign-in, changed later from Settings. The same rules as the web: the first time, being
 signed in is proof enough; after that, changing either asks for the current password.
*/
struct CredentialsForm: View {
    let me: Me
    var onSaved: (Me) -> Void

    @State private var email: String
    @State private var password = ""
    @State private var confirm = ""
    @State private var current = ""
    @State private var busy = false
    @State private var error: String?

    init(me: Me, onSaved: @escaping (Me) -> Void) {
        self.me = me
        self.onSaved = onSaved
        _email = State(initialValue: me.email ?? "")
    }

    private var needsPassword: Bool { !me.hasPassword }
    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var emailChanged: Bool { trimmedEmail.lowercased() != (me.email ?? "") }

    var canSave: Bool {
        !busy && !trimmedEmail.isEmpty && (emailChanged || !password.isEmpty)
            && (needsPassword ? !password.isEmpty : true)
            && (me.hasPassword ? !current.isEmpty : true)
    }

    var body: some View {
        Group {
            Section {
                TextField("Email", text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } header: {
                Text("Email")
            }

            Section {
                SecureField(needsPassword ? "Password" : "New password", text: $password)
                    .textContentType(.newPassword)
                if needsPassword || !password.isEmpty {
                    SecureField("Confirm password", text: $confirm)
                        .textContentType(.newPassword)
                }
            } header: {
                Text("Password")
            } footer: {
                Text(needsPassword ? "At least 8 characters." : "Leave blank to keep the one you have.")
            }

            if me.hasPassword {
                Section {
                    SecureField("Current password", text: $current)
                        .textContentType(.password)
                } footer: {
                    Text("Needed to change either one.")
                }
            }

            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }

            Section {
                Button {
                    Task { await save() }
                } label: {
                    HStack {
                        Spacer()
                        if busy { ProgressView() } else { Text("Save").fontWeight(.semibold) }
                        Spacer()
                    }
                }
                .disabled(!canSave)
            }
        }
    }

    private func save() async {
        if !password.isEmpty || needsPassword {
            guard password.count >= 8 else { error = "Passwords need at least 8 characters."; return }
            guard password.count <= 128 else { error = "Passwords can be at most 128 characters."; return }
            guard password == confirm else { error = "Those passwords don't match."; return }
        }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let saved = try await APIClient.shared.updateCredentials(
                email: trimmedEmail,
                password: password.isEmpty ? nil : password,
                currentPassword: me.hasPassword ? current : nil)
            password = ""
            confirm = ""
            current = ""
            onSaved(saved)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// The move from PINs to email sign-in: asked after signing in and each time the app is opened,
/// until both are there. "Not now" lasts until the app is next launched.
struct CredentialsPrompt: View {
    var session: Session
    let me: Me
    @Environment(\.dismiss) private var dismiss
    /// Set once saved, so the sheet says it worked instead of vanishing the way "Not now" does.
    @State private var savedEmail: String?

    var body: some View {
        NavigationStack {
            Form {
                if let savedEmail {
                    Section {
                        Label("Saved. Next time, sign in with \(savedEmail) and your new password.",
                              systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    }
                } else {
                    Section {
                        Text("Next time you'll sign in with these instead of your PIN.")
                            .foregroundStyle(.secondary)
                    }
                    .listRowBackground(Color.clear)
                    CredentialsForm(me: me) { saved in savedEmail = saved.email ?? "" }
                }
            }
            .navigationTitle(savedEmail == nil ? "Add an email and password" : "You're all set")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if savedEmail == nil {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Not now") {
                            session.credentialsPromptDismissed = true
                            dismiss()
                        }
                    }
                } else {
                    ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
                }
            }
        }
    }
}

/// Settings → Email and password.
struct CredentialsScreen: View {
    @State private var me: Me?
    @State private var saved = false
    @State private var error: String?

    var body: some View {
        Form {
            if let me {
                if saved {
                    Section { Label("Saved. Use them next time you sign in.", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green) }
                }
                CredentialsForm(me: me) { updated in
                    self.me = updated
                    saved = true
                }
                .id(me)
            } else if let error {
                Section { Text(error).foregroundStyle(.red) }
            } else {
                Section { ProgressView() }
            }
        }
        .navigationTitle("Email and password")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do { me = try await APIClient.shared.me() } catch { self.error = error.localizedDescription }
        }
    }
}

// MARK: - The owner's side of a forgotten password

/**
 A one-time link for someone in the house who forgot their password. There is no email sending,
 so the owner hands it over: shared as a message, or held up as a QR code for their camera. The
 person opens it on the web, where it sets a new password and signs them in. Making one retires
 any link made for them before, so it is made once per opening of this sheet.
*/
struct PasswordResetSheet: View {
    var session: Session
    let member: HouseholdMember

    @Environment(\.dismiss) private var dismiss
    @State private var link: URL?
    @State private var error: String?
    @State private var copied = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Send \(member.shown) this link, or let them scan the code. It lets them choose a new password"
                         + (member.hasEmail == false ? " and add their email" : "")
                         + ", then signs them in. It works once, for 24 hours.")
                        .foregroundStyle(.secondary)
                }
                .listRowBackground(Color.clear)

                if let link {
                    Section {
                        Text(link.absoluteString)
                            .font(.footnote.monospaced())
                            .textSelection(.enabled)
                        Button(copied ? "Copied" : "Copy link", systemImage: "doc.on.doc") {
                            UIPasteboard.general.string = link.absoluteString
                            copied = true
                        }
                        ShareLink(item: link, subject: Text("Reset your Meal Planner password")) {
                            Label("Share", systemImage: "square.and.arrow.up")
                        }
                    }
                    if let qr = QRCode.image(for: link.absoluteString) {
                        Section {
                            Image(uiImage: qr)
                                .interpolation(.none)
                                .resizable()
                                .scaledToFit()
                                .frame(maxWidth: 220)
                                .padding(8)
                                .background(.white, in: RoundedRectangle(cornerRadius: 12))
                                .frame(maxWidth: .infinity)
                                .accessibilityLabel("QR code of the link")
                        }
                        .listRowBackground(Color.clear)
                    }
                } else if let error {
                    Section { Text(error).foregroundStyle(.red) }
                } else {
                    Section { ProgressView().frame(maxWidth: .infinity) }
                }
            }
            // Their name is in the sentence above; in the title a long one cut "password" off.
            .navigationTitle("Reset password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
        }
        .task { await make() }
    }

    private func make() async {
        guard link == nil, error == nil, let household = session.household?.id else { return }
        do {
            let made = try await APIClient.shared.makePasswordReset(household: household, user: member.userId)
            // The same address the web is served from — in production the API and the site
            // share an origin, which is where the reset page lives.
            link = URL(string: "\(Config.baseURL)/reset/\(made.token)")
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Black-on-white QR codes, drawn by Core Image — no library needed.
enum QRCode {
    static func image(for text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        // Scaled up in whole pixels so the modules stay crisp; SwiftUI then fits it.
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        guard let cg = CIContext().createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

#Preview("Add an email") {
    CredentialsPrompt(session: .preview, me: SampleData.me)
}

#Preview("Reset link") {
    PasswordResetSheet(session: .preview, member: SampleData.members[1])
}
