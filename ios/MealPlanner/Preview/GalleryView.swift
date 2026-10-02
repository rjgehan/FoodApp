import SwiftUI

/// Every screen in one place, drawn from sample data, with a light/dark switch.
///
/// This is the app's own version of the screen-inventory PDF the web has: somewhere to look at
/// the whole interface at once, on a real device or the simulator, without a backend or a
/// signed-in household. It ships in debug builds only.
struct GalleryView: View {
    @State private var scheme: ColorScheme?

    private let session = Session.preview

    /// Somebody in two houses — the only person offered a cupboard copy.
    private let twoHouses: Session = {
        let session = Session.preview
        session.households = [SampleData.household, SampleData.otherHousehold]
        return session
    }()

    var body: some View {
        NavigationStack {
            List {
                KitchenSection {
                    Picker("Appearance", selection: $scheme) {
                        Text("System").tag(ColorScheme?.none)
                        Text("Light").tag(ColorScheme?.some(.light))
                        Text("Dark").tag(ColorScheme?.some(.dark))
                    }
                    .pickerStyle(.segmented)
                }

                KitchenSection("Design") {
                    entry("Design system — every component", "paintbrush") {
                        DesignSystemView()
                    }
                    entry("Theme", "paintpalette") {
                        ThemeScreen()
                    }
                    entry("Switch household", "arrow.left.arrow.right") {
                        HouseholdPicker(session: twoHouses)
                    }
                }

                KitchenSection("Welcome") {
                    entry("First-run tutorial", "hand.wave") {
                        TutorialView(finish: .signIn) {}
                    }
                    entry("First-time setup", "house.lodge") {
                        NavigationStack { FirstTimeSetup(session: Session()) }
                    }
                    entry("Shared recipe (public link)", "link") {
                        NavigationStack {
                            PublicRecipeScreen(session: twoHouses, token: "sample", sample: PublicRecipeScreen.sample)
                        }
                    }
                    entry("Save a copy to…", "square.and.arrow.down") {
                        SaveCopySheet(session: twoHouses, recipeName: "Lemon herb chicken") { _ in }
                            .pageBackground()
                    }
                }

                KitchenSection("Screens") {
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
                            sample: SampleData.groceriesMockup,
                            sampleCategories: SampleData.aisles,
                            sampleReminders: SampleData.groceryReminders,
                            sampleCupboard: SampleData.cupboardMockup
                        )
                    }
                    entry("Grocery item — aisle & reminder", "tag") {
                        GroceryItemSheet(item: SampleData.groceriesMockup[4], categories: SampleData.aisles,
                                         reminder: SampleData.groceryReminders.first, stock: nil, session: session,
                                         sample: true, onMove: { _ in }, onReminder: { _ in }, onRemove: {})
                            .pageBackground()
                    }
                    entry("Done shopping", "bag") {
                        DoneShoppingSheet(items: SampleData.groceriesMockup.filter(\.checked), session: session,
                                          sample: true) { _, _ in }
                            .pageBackground()
                    }
                    entry("Groceries — all bought", "cart.badge.checkmark") {
                        GroceriesView(session: session, sample: [], sampleCategories: SampleData.categories)
                    }
                    entry("Recipes — drawers", "book") {
                        RecipesView(
                            session: session,
                            sample: SampleData.recipes,
                            sampleCategories: SampleData.recipeCategories
                        )
                    }
                    entry("Dinner drawer", "fork.knife") {
                        NavigationStack {
                            DrawerView(
                                section: .dinner,
                                parent: nil,
                                recipes: SampleData.recipes,
                                categories: SampleData.recipeCategories
                            )
                        }
                    }
                    entry("Cupboard", "cabinet") {
                        CupboardView(
                            session: session,
                            sample: SampleData.cupboardMockup,
                            sampleCategories: SampleData.aisles,
                            sampleReminders: SampleData.groceryReminders
                        )
                    }
                    entry("Cupboard — not there, add it?", "magnifyingglass") {
                        CupboardView(session: session, sample: SampleData.cupboardMockup, sampleCategories: SampleData.aisles,
                                     sampleReminders: SampleData.groceryReminders, sampleQuery: "tahini")
                    }
                    entry("Cupboard item — edit", "slider.horizontal.3") {
                        CupboardItemSheet(item: SampleData.cupboardMockup[0], others: SampleData.cupboardMockup,
                                          categories: SampleData.aisles, reminder: nil, session: session, sample: true) {}
                            .pageBackground()
                    }
                    entry("Barcode scanner", "barcode.viewfinder") {
                        ScanBarcodeScreen(session: session, items: [], onDone: { _ in },
                                          sample: .found(Product(barcode: "5012345678900", name: "Chickpeas 400g tin",
                                                                 brand: "", size: "400 g"), nil))
                    }
                    entry("Time to restock?", "repeat") {
                        RestockPrompt(
                            household: SampleData.household.id,
                            items: SampleData.restock.filter { $0.due == true },
                            sample: true
                        )
                    }
                    entry("Let's start your cupboard", "checklist") {
                        StartCupboardSheet(household: SampleData.household.id, first: true, sample: SampleData.starters)
                    }
                    entry("Cupboard — start with the basics", "checklist.checked") {
                        StartCupboardSheet(household: SampleData.household.id, sample: SampleData.startersSomeHere)
                    }
                    entry("Cupboard — copy from another household", "square.on.square") {
                        CopyCupboardSheet(session: twoHouses, items: SampleData.cupboard, sample: SampleData.otherCupboard)
                    }
                    entry("Scan an invite", "qrcode.viewfinder") {
                        ScanInviteScreen(session: Session())
                    }
                    entry("Settings", "gearshape") {
                        SettingsView(session: twoHouses)
                    }
                    entry("Household", "house") {
                        NavigationStack {
                            HouseholdScreen(session: session, samplePeople: SampleData.people,
                                            sampleInvite: SampleData.invite, samplePlaces: SampleData.places,
                                            sampleAisles: SampleData.storeAisles)
                        }
                    }
                    entry("Invite — scan to join", "qrcode") {
                        InviteQRSheet(session: session, people: 4, link: SampleData.invite) { _ in }
                    }
                    entry("Someone in the house — owner actions", "person.crop.circle.badge.exclamationmark") {
                        MemberSheet(session: session, member: SampleData.people[2], tone: .sky) {}
                    }
                    entry("Places we eat", "storefront") {
                        NavigationStack { PlacesScreen(session: session, sample: SampleData.places) }
                    }
                    entry("Name, servings & planning", "slider.horizontal.3") {
                        NavigationStack { HouseholdBasicsScreen(session: session) }
                    }
                    entry("Store aisles", "list.bullet") {
                        NavigationStack { AislesScreen(session: session, sample: SampleData.storeAisles) }
                    }
                    entry("Recipe", "text.book.closed") {
                        NavigationStack { RecipeDetailView(recipe: SampleData.recipes[0], session: session) }
                    }
                    entry("Ideas (beta)", "lightbulb") {
                        IdeasView(session: session, sample: SampleData.ideas)
                    }
                    entry("Ideas — none yet", "lightbulb.slash") {
                        IdeasView(session: session, sample: [])
                    }
                    entry("Suggest an idea", "plus.bubble") {
                        IdeaEditor(idea: nil) { _, _ in }
                    }
                }

                KitchenSection("Prompts & extras") {
                    let prompts = PromptGallery(session: session, twoHouses: twoHouses)
                    entry("Add an email and password", "envelope") { prompts.addEmail() }
                    entry("Time to restock? — as the mockup", "bell") { prompts.restock() }
                    entry("Stock your cupboard", "checklist") { prompts.starter() }
                    entry("Removed from a household", "door.left.hand.open") { prompts.removed() }
                    entry("Ideas board — as the mockup", "lightbulb") {
                        IdeasView(session: session, sample: SampleData.ideasMockup)
                    }
                    entry("Share to Meal Planner", "square.and.arrow.down") { prompts.share() }
                    entry("Rewritten on device", "wand.and.stars") { prompts.rewritten() }
                }

                KitchenSection("Explore") {
                    entry("Explore", "safari") {
                        ExploreView(session: session, sample: SampleData.published)
                    }
                    entry("Global recipes", "globe") {
                        NavigationStack { GlobalRecipesScreen(session: session, sample: SampleData.published) }
                    }
                    entry("A published recipe", "text.book.closed") {
                        NavigationStack { GlobalRecipeScreen(recipe: SampleData.published[0], session: session) }
                    }
                    entry("Move into my recipes — which household", "arrow.right.circle") {
                        MoveIntoMineSheet(recipe: SampleData.published[0], session: twoHouses) { _, _ in }
                            .pageBackground()
                    }
                    entry("Nutrition facts", "leaf") {
                        NavigationStack {
                            NutritionScreen(session: session, sample: .init(week: NutritionSamples.week, recent: NutritionSamples.recent))
                        }
                    }
                    entry("Nutrition facts — searching", "magnifyingglass") {
                        NavigationStack {
                            NutritionScreen(session: session, sample: .init(week: NutritionSamples.week, recent: [],
                                                                            query: "chick", found: NutritionSamples.search))
                        }
                    }
                    entry("Scan a packet", "barcode.viewfinder") {
                        NutritionScannerScreen { _ in }
                    }
                    entry("A packet's label", "shippingbox") {
                        NavigationStack {
                            NutritionProductScreen(session: session, barcode: NutritionSamples.yogurt.barcode, scanned: true,
                                                   sample: NutritionSamples.yogurt)
                        }
                    }
                    entry("A packet nobody has added", "questionmark.square.dashed") {
                        NavigationStack { NutritionProductScreen(session: session, barcode: "4006381333931", sampleMissing: true) }
                    }
                    entry("An ingredient's label", "leaf.circle") {
                        NavigationStack { NutritionFoodScreen(session: session, fdcId: 173757, sample: NutritionSamples.chickpeas) }
                    }
                    entry("A recipe's nutrition", "chart.pie") {
                        NavigationStack {
                            RecipeNutritionScreen(session: session, recipeId: NutritionSamples.recipeId,
                                                  sample: NutritionSamples.lemonChicken())
                        }
                    }
                    entry("Meal plans — coming soon", "target") {
                        NavigationStack { SoonScreen(destination: SoonDestination.all.first { $0.kind == .mealPlans }!) }
                    }
                }

                KitchenSection {
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
