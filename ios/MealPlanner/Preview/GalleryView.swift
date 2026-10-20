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

    /// A house that turned the Plan off but keeps a cupboard — Add to groceries as the recipe's
    /// one filled button, no Meal plans door.
    private let noPlan: Session = {
        let session = Session.preview
        session.household = SampleData.kitchenHousehold
        return session
    }()

    /// A house just made, with no cupboard: Done shopping without the cupboard question, the
    /// "Set up your kitchen" card.
    private let noCupboard: Session = {
        let session = Session.preview
        session.household = SampleData.newHousehold
        session.households = [SampleData.newHousehold]
        return session
    }()

    /// One sample catalogue for the tag screens, so a tag made or renamed on one is there on the
    /// next — on this phone only; nothing is sent.
    @State private var catalogue = CatalogueStore(session: nil, sample: SampleData.recipes,
                                                  sampleCategories: SampleData.recipeCategories)

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
                    entry("Kitchen setup — machines, Plan, cupboard", "frying.pan") {
                        KitchenSetupSheet(session: noCupboard, household: SampleData.newHousehold.id,
                                          sample: SampleData.newHousehold)
                    }
                    entry("Set up your kitchen — the card on Recipes", "rectangle.and.hand.point.up.left") {
                        KitchenSetupCard(onStart: {}, onClose: {})
                            .padding(20)
                            .frame(maxHeight: .infinity, alignment: .top)
                            .pageBackground()
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
                    entry("Done shopping — no cupboard", "bag.badge.minus") {
                        DoneShoppingSheet(items: SampleData.groceriesMockup.filter(\.checked), session: noCupboard,
                                          sample: true) { _, _ in }
                            .pageBackground()
                    }
                    entry("Groceries — last paid", "dollarsign") {
                        GroceriesView(
                            session: session,
                            sample: SampleData.groceriesPriced,
                            sampleCategories: SampleData.aisles,
                            sampleReminders: SampleData.groceryReminders,
                            sampleCupboard: SampleData.cupboardMockup
                        )
                    }
                    entry("Grocery item — price", "tag") {
                        GroceryItemSheet(item: SampleData.groceriesPriced[4], categories: SampleData.aisles,
                                         reminder: nil, stock: nil, session: session,
                                         sample: true, onMove: { _ in }, onReminder: { _ in }, onRemove: {})
                            .pageBackground()
                    }
                    entry("Check a receipt", "doc.text.viewfinder") {
                        NavigationStack {
                            ReceiptReviewView(session: session, draft: SampleData.receiptDraft,
                                              scan: ReceiptScanText(lines: SampleData.receiptText, barcode: nil),
                                              choices: SampleData.receiptChoices, sample: true,
                                              onCancel: {}, onSaved: { _ in })
                        }
                    }
                    entry("Check a receipt — doesn't add up", "exclamationmark.triangle") {
                        NavigationStack {
                            ReceiptReviewView(session: session, draft: SampleData.receiptDraftMismatch,
                                              scan: ReceiptScanText(lines: SampleData.receiptText, barcode: nil),
                                              choices: SampleData.receiptChoices, sample: true,
                                              onCancel: {}, onSaved: { _ in })
                        }
                    }
                    entry("Receipts", "receipt") {
                        NavigationStack {
                            ReceiptsView(session: session, sample: SampleData.receipts,
                                         sampleDetail: SampleData.receiptDetail, onScan: {})
                        }
                    }
                    entry("Which store? — link a receipt", "mappin.and.ellipse") {
                        StorePicker(session: session, suggest: "Kings Food Markets", current: SampleData.kingsHoboken,
                                    onPick: { _ in }, onUnlink: {}, sample: StoreMapSamples.places)
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
                    entry("Dinner drawer — tags, machines, quick tag", "fork.knife") {
                        NavigationStack {
                            DrawerView(section: .dinner, recipes: SampleData.recipes, categories: SampleData.recipeCategories)
                        }
                    }
                    entry("Dinner drawer — Chicken chosen", "tag") {
                        NavigationStack {
                            DrawerView(section: .dinner, recipes: SampleData.recipes, categories: SampleData.recipeCategories,
                                       tag: "Chicken")
                        }
                    }
                    entry("Manage tags", "pencil.line") {
                        NavigationStack { EditTagsView(store: catalogue, section: .dinner) }
                    }
                    entry("Tag recipes — some, all, none", "checklist") {
                        TagRecipesSheet(store: catalogue, section: .dinner,
                                        recipes: SampleData.recipes.filter { $0.section == .dinner && !$0.shared }) { _ in }
                    }
                    entry("Move recipes to another drawer", "arrow.right.square") {
                        MoveRecipesSheet(store: catalogue, section: .dinner, recipes: Array(SampleData.recipes.prefix(2))) { _ in }
                    }
                    entry("Organise — drawer and tags", "tag.circle") {
                        OrganiseSheet(recipe: SampleData.recipes[0], session: session) { _ in }
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
                    entry("Kitchen & features", "frying.pan") {
                        NavigationStack { KitchenScreen(session: noPlan, sample: SampleData.kitchenHousehold) }
                    }
                    entry("Store aisles", "list.bullet") {
                        NavigationStack { AislesScreen(session: session, sample: SampleData.storeAisles) }
                    }
                    entry("Recipe", "text.book.closed") {
                        NavigationStack { RecipeDetailView(recipe: SampleData.recipes[0], session: session) }
                    }
                    entry("Recipe — a house without the Plan", "cart") {
                        NavigationStack { RecipeDetailView(recipe: SampleData.recipes[0], session: noPlan) }
                    }
                    entry("Add to groceries", "cart.badge.plus") {
                        AddToGroceriesSheet(recipe: SampleData.recipes[0], session: session, servings: 4) { _ in }
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
                    entry("Share to Waxwing", "square.and.arrow.down") { prompts.share() }
                    entry("Rewritten on device", "wand.and.stars") { prompts.rewritten() }
                }

                KitchenSection("Explore") {
                    entry("Explore", "safari") {
                        ExploreView(session: session, sample: SampleData.published, sampleWeek: NutritionSamples.week,
                                    sampleStores: StoreMapSamples.map)
                    }
                    entry("Grocery stores — the map", "map") {
                        NavigationStack { StoreMapScreen(session: session, sample: StoreMapSamples.map) }
                    }
                    entry("Grocery stores — a shop tapped", "mappin.and.ellipse") {
                        NavigationStack { StoreMapScreen(session: session, sample: StoreMapSamples.tapped) }
                    }
                    entry("Grocery stores — no prices yet", "map.circle") {
                        NavigationStack { StoreMapScreen(session: session, sample: StoreMapSamples.noPrices) }
                    }
                    entry("Prices at a shop", "list.bullet.rectangle") {
                        StorePricesSheet(shop: StoreMapSamples.shops[0], place: StoreMapSamples.places[0], distance: "0.3 mi")
                    }
                    entry("Hidden places", "eye.slash") {
                        HiddenPlacesSheet(hidden: StoreMapSamples.hidden) { _ in }
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
                    entry("A label read by Apple Intelligence", "camera.viewfinder") {
                        NavigationStack {
                            NutritionProductScreen(session: session, barcode: "4006381333931", sampleReading: NutritionSamples.readLabel)
                        }
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
                    entry("A recipe's nutrition — Apple Intelligence", "sparkles") {
                        NavigationStack {
                            RecipeNutritionScreen(session: session, recipeId: NutritionSamples.recipeId,
                                                  sample: NutritionSamples.lemonChicken(aiMarks: true),
                                                  sampleWords: "High protein and low carb, a filling dinner for a busy weeknight.")
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
