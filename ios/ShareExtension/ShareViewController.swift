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
    private var finished = false

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

        Task {
            await handle()
        }
        // Never sit there forever: a share extension that hangs is killed, and iOS quietly
        // stops offering it afterwards.
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
            guard let self, !self.finished else { return }
            self.finish(with: "That took too long.")
        }
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

    /// What was shared, as the recipe's words.
    ///
    /// Order matters. The page's own text is what a reader sees; a selection is what they
    /// chose; a URL is neither, and passing one to a language model produces an invented
    /// recipe built out of the slug. So a URL is only ever sent as a last resort, and marked
    /// as such so the app knows to go and fetch it rather than read it.
    private func sharedText() async -> String? {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        var pageText: String?
        var selection: String?
        var link: String?

        for item in items {
            for provider in item.attachments ?? [] {
                // The JavaScript preprocessor's results arrive as a property list.
                if provider.hasItemConformingToTypeIdentifier(UTType.propertyList.identifier),
                   let loaded = try? await provider.loadItem(forTypeIdentifier: UTType.propertyList.identifier),
                   let wrapper = loaded as? [String: Any],
                   let results = wrapper[NSExtensionJavaScriptPreprocessingResultsKey] as? [String: Any] {
                    let title = results["title"] as? String ?? ""
                    let text = results["text"] as? String ?? ""
                    if !text.isEmpty { pageText = [title, text].filter { !$0.isEmpty }.joined(separator: "\n\n") }
                    if let pageURL = results["url"] as? String, !pageURL.isEmpty { link = pageURL }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                          let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String,
                          !text.isEmpty {
                    selection = text
                } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                          let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                    link = url.absoluteString
                }
            }
            if selection == nil, let text = item.attributedContentText?.string, !text.isEmpty {
                selection = text
            }
        }

        /*
         A recipe is never a hundred characters. Anything shorter is a page title or a stray
         line, and sending it on is what produced a recipe invented from three words — so a
         short capture loses to the link, which the app can go and fetch.
         */
        let enough = 200

        // A selection beats the whole page: someone who highlighted the ingredients meant it.
        if let selection, selection.count >= enough { return selection }
        if let pageText, pageText.count >= enough { return pageText }
        if let link { return "\u{1F517}\(link)" }
        if let selection { return selection }
        if let pageText { return pageText }
        return nil
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
        guard !finished else { return }
        finished = true
        extensionContext?.completeRequest(returningItems: nil)
    }

    private func finish(with message: String) {
        guard !finished else { return }
        finished = true
        label.text = message
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }
}
