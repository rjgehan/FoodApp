import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { HouseholdProvider } from './household/HouseholdContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import HouseholdPage from './pages/HouseholdPage';
import RecipesPage from './pages/RecipesPage';
import RecipeDetailPage from './pages/RecipeDetailPage';
import RecipeSectionPage from './pages/RecipeSectionPage';
import NewRecipePage from './pages/NewRecipePage';
import MealPlanPage from './pages/MealPlanPage';
import GroceryListPage from './pages/GroceryListPage';
import PublicRecipePage from './pages/PublicRecipePage';

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

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <HouseholdProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/household" element={<HouseholdPage />} />
          <Route path="/recipes" element={<RecipesPage />} />
          <Route path="/recipes/new" element={<NewRecipePage />} />
          <Route path="/recipes/section/:section" element={<RecipeSectionPage />} />
          <Route path="/recipes/:recipeId" element={<RecipeDetailPage />} />
          <Route path="/meal-plan" element={<MealPlanPage />} />
          <Route path="/grocery-list" element={<GroceryListPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </HouseholdProvider>
  );
}
