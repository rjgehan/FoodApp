import SwiftUI

/// Every screen in one place, drawn from sample data, with a light/dark switch.
///
/// This is the app's own version of the screen-inventory PDF the web has: somewhere to look at
/// the whole interface at once, on a real device or the simulator, without a backend or a
/// signed-in household. It ships in debug builds only.
struct GalleryView: View {
    @State private var scheme: ColorScheme?

    private let session = Session.preview

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Appearance", selection: $scheme) {
                        Text("System").tag(ColorScheme?.none)
                        Text("Light").tag(ColorScheme?.some(.light))
                        Text("Dark").tag(ColorScheme?.some(.dark))
                    }
                    .pickerStyle(.segmented)
                }

                Section("Screens") {
                    entry("Sign in — households", "house") {
                        SignInView(session: Session())
                    }
                    entry("Plan", "calendar") {
                        PlanView(session: session, sample: SampleData.plan)
                    }
                    entry("Plan — nothing planned", "calendar.badge.exclamationmark") {
                        PlanView(session: session, sample: [])
                    }
                    entry("Groceries", "cart") {
                        GroceriesView(
                            session: session,
                            sample: SampleData.groceries,
                            sampleCategories: SampleData.categories
                        )
                    }
                    entry("Groceries — all bought", "cart.badge.checkmark") {
                        GroceriesView(session: session, sample: [], sampleCategories: SampleData.categories)
                    }
                    entry("Recipes", "book") {
                        RecipesView(session: session, sample: SampleData.recipes)
                    }
                    entry("Recipe", "text.book.closed") {
                        NavigationStack { RecipeDetailView(recipe: SampleData.recipes[0]) }
                    }
                }

                Section {
                    LabeledContent("Server", value: Config.baseURL)
                    LabeledContent("Sample data", value: "no network calls")
                } footer: {
                    Text("Every screen here is rendered from SampleData, so it looks the same with the kitchen server off.")
                }
                .font(.footnote)
            }
            .navigationTitle("Gallery")
        }
        .preferredColorScheme(scheme)
    }

    private func entry<Destination: View>(
        _ title: String,
        _ symbol: String,
        @ViewBuilder destination: @escaping () -> Destination
    ) -> some View {
        NavigationLink {
            destination().preferredColorScheme(scheme)
        } label: {
            Label(title, systemImage: symbol)
        }
    }
}

#Preview("Gallery") {
    GalleryView()
}
