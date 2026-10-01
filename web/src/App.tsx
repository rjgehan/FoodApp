import { lazy, Suspense, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { HouseholdProvider } from './household/HouseholdContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import HouseholdPage from './pages/HouseholdPage';
import RecipesPage from './pages/RecipesPage';
import RecipeDetailPage from './pages/RecipeDetailPage';
import RecipeSectionPage from './pages/RecipeSectionPage';
import SavedLinksPage from './pages/SavedLinksPage';
import ExplorePage from './pages/ExplorePage';
import ExploreRecipesPage from './pages/ExploreRecipesPage';
import ExploreSoonPage from './pages/ExploreSoonPage';
import NewRecipePage from './pages/NewRecipePage';
import EditRecipePage from './pages/EditRecipePage';
import RecipeSharePage from './pages/RecipeSharePage';
import MealPlanPage from './pages/MealPlanPage';
import GroceryListPage from './pages/GroceryListPage';
import CupboardPage from './pages/CupboardPage';
import PublicRecipePage from './pages/PublicRecipePage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import InvitePage from './pages/InvitePage';
import AdminRoutes from './pages/AdminPage';
import IdeasPage from './pages/IdeasPage';
import ThemePage from './pages/ThemePage';
import Tutorial from './tutorial/Tutorial';
import { tutorialSeen } from './tutorial/seen';

/** Every building block on one page, for development only: production builds leave it out. */
const GalleryPage = import.meta.env.DEV ? lazy(() => import('./pages/GalleryPage')) : null;

export default function App() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  /** The first-run tutorial is still to come on this device (tutorial/seen.ts). */
  const [tutorial, setTutorial] = useState(() => !tutorialSeen());

  /*
   * Share links are the one thing that works with no account, so they are matched before the
   * session gate — and rendered without Layout, which would put an app nav bar in front of a
   * guest. Checked by path rather than nested routing so there is no doubt about what is public.
   */
  if (pathname.startsWith('/r/')) {
    return (
      <Routes>
        <Route path="/r/:token" element={<PublicRecipePage />} />
      </Routes>
    );
  }

  // A reset link is opened by someone who cannot sign in — that is why they were sent it.
  if (pathname.startsWith('/reset/')) {
    return (
      <Routes>
        <Route path="/reset/:token" element={<ResetPasswordPage />} />
      </Routes>
    );
  }

  /*
   The first-run tutorial, before the sign-in screen. Not in front of an invite: a person sent a
   link is shown who invited them first, and gets the tutorial once they have joined (below).
  */
  if (!session && tutorial && !pathname.startsWith('/invite/')) {
    return <Tutorial finish="sign-in" onDone={() => setTutorial(false)} />;
  }

  /*
   Signed in on a device that has not had it: somebody who arrived through an invite (or a reset
   link) and is in now. The invite page finishes joining first — signing in to an existing
   account from it joins as it lands — and the tutorial follows on the way into the app.
  */
  if (session && tutorial && !pathname.startsWith('/invite/')) {
    return <Tutorial finish="app" onDone={() => setTutorial(false)} />;
  }

  if (!session) {
    return (
      <Routes>
        {/* A new person's first sight of the app: no nav bar, just who invited them and why. */}
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  // An invite opened while signed in is one decision, made on its own page as the mockup draws
  // it: no tab bar or household switcher in front of the question of which house to join.
  if (pathname.startsWith('/invite/')) {
    return (
      <HouseholdProvider>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
        </Routes>
      </HouseholdProvider>
    );
  }

  return (
    <HouseholdProvider>
      <Layout>
        <Routes>
          {/* No home screen: the week's plan is where the day starts. */}
          <Route path="/" element={<Navigate to="/meal-plan" replace />} />
          <Route path="/household" element={<HouseholdPage />} />
          <Route path="/recipes" element={<RecipesPage />} />
          <Route path="/recipes/new" element={<NewRecipePage />} />
          <Route path="/recipes/section/:section" element={<RecipeSectionPage />} />
          <Route path="/recipes/saved-links" element={<SavedLinksPage />} />
          <Route path="/recipes/:recipeId" element={<RecipeDetailPage />} />
          <Route path="/recipes/:recipeId/edit" element={<EditRecipePage />} />
          <Route path="/recipes/:recipeId/share" element={<RecipeSharePage />} />
          <Route path="/meal-plan" element={<MealPlanPage />} />
          <Route path="/grocery-list" element={<GroceryListPage />} />
          <Route path="/cupboard" element={<CupboardPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/explore/recipes" element={<ExploreRecipesPage />} />
          {/* Named rather than wildcarded, so a typo lands on the catch-all instead of a
              page explaining a feature that does not exist. */}
          <Route path="/explore/nutrition" element={<ExploreSoonPage />} />
          <Route path="/explore/meal-plans" element={<ExploreSoonPage />} />
          {/* Explore used to be a room inside Recipes. Links and bookmarks still work. */}
          <Route path="/recipes/explore" element={<Navigate to="/explore/recipes" replace />} />
          {/* The server owner's read-only view of everything. Not a tab: reached from Settings,
              and only shown to the admin (the server turns everyone else away). */}
          <Route path="/admin/*" element={<AdminRoutes />} />
          {/* The beta's ideas board, for everyone. Not a tab either: the lightbulb in the header. */}
          <Route path="/ideas" element={<IdeasPage />} />
          {/* Theme: light or dark, and which of the five themes. Reached from Settings. */}
          <Route path="/settings/theme" element={<ThemePage />} />
          {GalleryPage && (
            <Route
              path="/__gallery"
              element={
                <Suspense fallback={null}>
                  <GalleryPage />
                </Suspense>
              }
            />
          )}
          <Route path="*" element={<Navigate to="/meal-plan" replace />} />
        </Routes>
      </Layout>
    </HouseholdProvider>
  );
}
