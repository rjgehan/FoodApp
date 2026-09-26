import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { HouseholdProvider } from './household/HouseholdContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import HouseholdPage from './pages/HouseholdPage';
import RecipesPage from './pages/RecipesPage';
import RecipeDetailPage from './pages/RecipeDetailPage';
import RecipeSectionPage from './pages/RecipeSectionPage';
import ExplorePage from './pages/ExplorePage';
import ExploreRecipesPage from './pages/ExploreRecipesPage';
import ExploreSoonPage from './pages/ExploreSoonPage';
import NewRecipePage from './pages/NewRecipePage';
import EditRecipePage from './pages/EditRecipePage';
import MealPlanPage from './pages/MealPlanPage';
import GroceryListPage from './pages/GroceryListPage';
import CupboardPage from './pages/CupboardPage';
import PublicRecipePage from './pages/PublicRecipePage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import InvitePage from './pages/InvitePage';

export default function App() {
  const { session } = useAuth();
  const { pathname } = useLocation();

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

  if (!session) {
    return (
      <Routes>
        {/* A new person's first sight of the app: no nav bar, just who invited them and why. */}
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <HouseholdProvider>
      <Layout>
        <Routes>
          {/* No home screen: the week's plan is where the day starts. */}
          <Route path="/" element={<Navigate to="/meal-plan" replace />} />
          <Route path="/household" element={<HouseholdPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/recipes" element={<RecipesPage />} />
          <Route path="/recipes/new" element={<NewRecipePage />} />
          <Route path="/recipes/section/:section" element={<RecipeSectionPage />} />
          <Route path="/recipes/:recipeId" element={<RecipeDetailPage />} />
          <Route path="/recipes/:recipeId/edit" element={<EditRecipePage />} />
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
          <Route path="*" element={<Navigate to="/meal-plan" replace />} />
        </Routes>
      </Layout>
    </HouseholdProvider>
  );
}
