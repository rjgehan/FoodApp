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
            KitchenSection {
                TextField("Email", text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } header: {
                Text("Email")
            }

            KitchenSection {
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
                KitchenSection {
                    SecureField("Current password", text: $current)
                        .textContentType(.password)
                } footer: {
                    Text("Needed to change either one.")
                }
            }

            if let error {
                KitchenSection { Text(error).foregroundStyle(Palette.danger) }
            }

            KitchenSection {
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

    // The mockup's 7.1: the envelope on a sky tile, the question and why it is asked, two fields
    // with icons, Save — and "Not now" under it, since that is what closing it means.
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let savedEmail {
                    PromptHeader(systemImage: "checkmark", tone: .herb, title: "You're all set",
                                 line: "Saved. Next time, sign in with \(savedEmail) and your new password.",
                                 stacked: true)
                    Button("Done") { dismiss() }.buttonStyle(.primary)
                } else {
                    PromptHeader(systemImage: "envelope", tone: .sky, title: "Add an email and password",
                                 line: "PIN sign-in is being retired. Add these once and you'll use them from now on.",
                                 stacked: true)
                    PromptCredentialsFields(me: me) { saved in savedEmail = saved.email ?? "" } notNow: {
                        session.credentialsPromptDismissed = true
                        dismiss()
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 28)
            .padding(.bottom, 20)
        }
        .scrollBounceBehavior(.basedOnSize)
        .kitchenSheet([.fraction(0.68), .large])
    }
}

/**
 The prompt's own fields (7.1): an icon in each and no label over them, the confirmation only
 once a password has been typed, and the buttons stacked. The same rules as CredentialsForm,
 which Settings keeps.
*/
private struct PromptCredentialsFields: View {
    let me: Me
    var onSaved: (Me) -> Void
    var notNow: () -> Void

    @State private var email: String
    @State private var password = ""
    @State private var confirm = ""
    @State private var current = ""
    @State private var busy = false
    @State private var error: String?

    init(me: Me, onSaved: @escaping (Me) -> Void, notNow: @escaping () -> Void) {
        self.me = me
        self.onSaved = onSaved
        self.notNow = notNow
        _email = State(initialValue: me.email ?? "")
    }

    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canSave: Bool {
        !busy && !trimmedEmail.isEmpty
            && (trimmedEmail.lowercased() != (me.email ?? "") || !password.isEmpty)
            && (me.hasPassword ? !current.isEmpty : !password.isEmpty)
    }

    var body: some View {
        VStack(spacing: 14) {
            FieldBox(nil, text: $email, prompt: "Email", systemImage: "envelope")
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            FieldBox(nil, text: $password, prompt: "New password", systemImage: "lock", secure: true)
                .textContentType(.newPassword)
            if !password.isEmpty {
                FieldBox(nil, text: $confirm, prompt: "Confirm password", systemImage: "lock", secure: true)
                    .textContentType(.newPassword)
            }
            if me.hasPassword {
                FieldBox(nil, text: $current, prompt: "Current password", systemImage: "key", secure: true,
                         hint: "Needed to change either one.")
                    .textContentType(.password)
            }
            if let error {
                Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            VStack(spacing: 0) {
                Button {
                    Task { await save() }
                } label: {
                    if busy { ProgressView().tint(Palette.onAccent) } else { Text("Save") }
                }
                .buttonStyle(.primary)
                .disabled(!canSave)
                PromptWayOut("Not now", action: notNow)
                    .disabled(busy)
            }
            .padding(.top, 2)
        }
    }

    private func save() async {
        if !password.isEmpty || !me.hasPassword {
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
            onSaved(saved)
        } catch {
            self.error = error.localizedDescription
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
                    KitchenSection { Label("Saved. Use them next time you sign in.", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(Palette.herb) }
                }
                CredentialsForm(me: me) { updated in
                    self.me = updated
                    saved = true
                }
                .id(me)
            } else if let error {
                KitchenSection { Text(error).foregroundStyle(Palette.danger) }
            } else {
                KitchenSection { ProgressView() }
            }
        }
        .kitchenList()
        .navigationTitle("Email and password")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do { me = try await APIClient.shared.me() } catch { self.error = error.localizedDescription }
        }
    }
}

// MARK: - The owner's side of a forgotten password

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
    Color.clear.pageBackground()
        .sheet(isPresented: .constant(true)) { CredentialsPrompt(session: .preview, me: SampleData.me) }
}

