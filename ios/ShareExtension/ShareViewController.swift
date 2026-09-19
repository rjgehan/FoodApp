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
        let found = await shared()

        // The page's own recipe data beats anything read off the screen, so it goes first
        // and the app can use it without a model at all.
        if let recipe = found.recipe, !recipe.isEmpty,
           let url = URL(string: "mealplanner://paste?recipe=\(encode(recipe))"),
           url.absoluteString.count < 60_000 {
            label.text = "Found the recipe."
            open(url)
            return
        }
        guard let text = found.text, let url = URL(string: "mealplanner://paste?text=\(encode(text))") else {
            finish(with: "Nothing to read in that.")
            return
        }
        open(url)
    }

    /// What was shared: the page's own recipe data if it publishes any, and its words either way.
    ///
    /// Order matters for the text. The page's text is what a reader sees; a selection is what
    /// they chose; a URL is neither, and passing one to a language model produces an invented
    /// recipe built out of the slug. A URL is only ever sent as a last resort, marked so the
    /// app knows to fetch it rather than read it.
    private func shared() async -> (recipe: String?, text: String?) {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        var recipe: String?
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
                    if let found = results["recipe"] as? String, !found.isEmpty { recipe = found }
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
        let text: String?
        if let selection, selection.count >= enough {
            text = selection
        } else if let pageText, pageText.count >= enough {
            text = pageText
        } else if let link {
            text = "\u{1F517}\(link)"
        } else {
            text = selection ?? pageText
        }
        return (recipe, text)
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
