import SwiftUI

/// The mockup's section 07, as sample data: what is due to restock, and the ideas board.
extension SampleData {
    static let restockMockup: [RestockReminder] = [
        RestockReminder(ingredientId: UUID(), name: "smoked paprika", everyDays: 28,
                        lastBoughtAt: "2026-09-05T10:00:00Z", dueAt: nil, snoozedUntil: nil, due: true),
        RestockReminder(ingredientId: UUID(), name: "olive oil", everyDays: 21,
                        lastBoughtAt: "2026-09-08T10:00:00Z", dueAt: nil, snoozedUntil: nil, due: true),
        RestockReminder(ingredientId: UUID(), name: "chicken thighs", everyDays: 14,
                        lastBoughtAt: "2026-09-15T10:00:00Z", dueAt: nil, snoozedUntil: nil, due: true),
        RestockReminder(ingredientId: UUID(), name: "dishwasher tabs", everyDays: 14,
                        lastBoughtAt: "2026-09-12T10:00:00Z", dueAt: nil, snoozedUntil: nil, due: true),
    ]

    static var ideasMockup: [Idea] {
        func ago(_ hours: Double) -> String {
            ISO8601DateFormatter().string(from: Date().addingTimeInterval(-hours * 3600))
        }
        return [
            Idea(id: UUID(), title: "Show the cheapest store for my grocery list", details: nil,
                 status: .planned, authorName: "Jo", mine: false, voteCount: 24, votedByMe: true, createdAt: ago(200)),
            Idea(id: UUID(), title: "Leftovers slot",
                 details: "Mark a meal as \"makes leftovers\" and auto-plan lunch the next day.",
                 status: .open, authorName: "Sam", mine: false, voteCount: 17, votedByMe: false, createdAt: ago(90)),
            Idea(id: UUID(), title: "Apple Watch grocery list", details: nil,
                 status: .done, authorName: "Alex", mine: false, voteCount: 11, votedByMe: true, createdAt: ago(400)),
            Idea(id: UUID(), title: "Kids can suggest dinners", details: "They add ideas, parents approve into the plan.",
                 status: .open, authorName: "Nana", mine: false, voteCount: 6, votedByMe: false, createdAt: ago(30)),
        ]
    }
}

/// The Gallery's section 07: each prompt over the Plan it would appear on, as the mockup draws it.
struct PromptGallery {
    let session: Session
    let twoHouses: Session

    private var plan: some View { PlanView(session: session, sample: SampleData.plan) }

    func addEmail() -> some View {
        plan.sheet(isPresented: .constant(true)) { CredentialsPrompt(session: session, me: SampleData.me) }
    }

    func restock() -> some View {
        plan.sheet(isPresented: .constant(true)) {
            RestockPrompt(household: SampleData.household.id, items: SampleData.restockMockup, sample: true)
        }
    }

    func starter() -> some View {
        plan.sheet(isPresented: .constant(true)) {
            StartCupboardSheet(household: SampleData.household.id, first: true, sample: SampleData.starters)
        }
    }

    func removed() -> some View {
        plan.kitchenAlert(isPresented: .constant(true)) {
            HouseholdRemovedCard(removedFrom: "Gehan house", movedTo: "Beach crew") {}
        }
    }

    /// Shared from a TikTok: the app's half of the share sheet, over the video it came from.
    func share() -> some View {
        RecipePhotoPlaceholder(hue: .berry, systemImage: "play", radius: 18)
            .padding(.horizontal, 12)
            .padding(.top, 6)
            .background(Color(white: 0.12).ignoresSafeArea())
            .sheet(isPresented: .constant(true)) {
                NavigationStack {
                    SharedRecipeView(session: twoHouses, structured: .crumbleBars,
                                     link: StructuredRecipe.crumbleBars.url, sample: true)
                }
                .kitchenSheet([.medium, .large])
            }
    }

    /// A method rewritten on the phone (7.7), the way the share screen shows one.
    func rewritten() -> some View {
        ScrollView {
            RewrittenMethod(steps: StructuredRecipe.crumbleBars.steps, original: StructuredRecipe.crumbleCaption,
                            originalLabel: "Original caption",
                            note: "The video caption was hard to follow. Tidied into clear steps; amounts unchanged.",
                            onUndo: {})
                .padding(.horizontal, 20)
                .padding(.top, 6)
        }
        .pageBackground()
        .centeredTitle("Method")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { Button("Done") {}.fontWeight(.semibold) }
        }
    }
}
