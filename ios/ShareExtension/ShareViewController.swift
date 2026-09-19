import UIKit
import UniformTypeIdentifiers

/*
 Share a recipe from anywhere — Safari, Messages, Notes — into Meal Planner.

 The extension itself stays deliberately thin: it pulls the text (or the URL) out of whatever
 was shared and hands it to the app through a custom URL. The parsing and the saving happen in
 the app, which already has the signed-in session.

 It works that way for a reason. Reaching the app's Keychain token from here needs an App Group
 or a shared keychain, and a free personal team cannot have either — so instead of authenticating
 twice, the extension passes the text along and lets the app do what it already knows how to do.
 */
final class ShareViewController: UIViewController {
    private let label = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        label.text = "Reading…"
        label.textAlignment = .center
        label.font = .preferredFont(forTextStyle: .body)
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
        ])

        Task { await handle() }
    }

    private func handle() async {
        guard let shared = await sharedText() else {
            finish(with: "Nothing to read in that.")
            return
        }
        guard let url = URL(string: "mealplanner://paste?text=\(encode(shared))") else {
            finish(with: "Could not pass that along.")
            return
        }
        open(url)
    }

    /// Whatever was shared, as text: the selection, the page URL, or both.
    private func sharedText() async -> String? {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        var pieces: [String] = []

        for item in items {
            for provider in item.attachments ?? [] {
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                   let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                    pieces.append(text)
                } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                          let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                    pieces.append(url.absoluteString)
                }
            }
            if let text = item.attributedContentText?.string, !text.isEmpty {
                pieces.append(text)
            }
        }

        let joined = pieces.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        return joined.isEmpty ? nil : joined
    }

    private func encode(_ text: String) -> String {
        // A recipe is long and full of newlines and slashes; everything but the unreserved set
        // has to go.
        text.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
    }

    /// `extensionContext.open` is the documented way and works on current iOS; the responder
    /// walk is the old fallback for when it refuses.
    private func open(_ url: URL) {
        extensionContext?.open(url) { [weak self] opened in
            if opened {
                self?.done()
            } else {
                self?.openByResponderChain(url)
            }
        }
    }

    private func openByResponderChain(_ url: URL) {
        var responder: UIResponder? = self
        while let next = responder {
            if let application = next as? UIApplication {
                application.open(url, options: [:]) { [weak self] opened in
                    opened ? self?.done() : self?.finish(with: "Could not open Meal Planner.")
                }
                return
            }
            responder = next.next
        }
        finish(with: "Could not open Meal Planner.")
    }

    private func done() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    private func finish(with message: String) {
        label.text = message
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }
}
