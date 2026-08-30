import { Navigate, Route, Routes } from 'react-router-dom';
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

export default function App() {
  const { session } = useAuth();

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
