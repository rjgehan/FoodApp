import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../api/client';
import type { GroceryCategory, Household } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useOnResume } from '../utils/useOnResume';

interface HouseholdSettings {
  defaultServings: number;
  planningHorizonDays: number;
}

interface HouseholdContextValue {
  households: Household[];
  activeHouseholdId: string | null;
  activeHousehold: Household | null;
  setActiveHouseholdId: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
  createHousehold: (name: string) => Promise<void>;
  renameHousehold: (name: string) => Promise<void>;
  updateSettings: (settings: HouseholdSettings) => Promise<void>;
  /** This household's own grocery aisles, in the order it walks its store. */
  groceryCategories: GroceryCategory[];
  refreshGroceryCategories: () => Promise<void>;
  createGroceryCategory: (name: string) => Promise<void>;
  renameGroceryCategory: (id: string, name: string) => Promise<void>;
  /** Every category's id, in the new order. */
  reorderGroceryCategories: (order: string[]) => Promise<void>;
  deleteGroceryCategory: (id: string) => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [activeHouseholdId, setActiveHouseholdIdState] = useState<string | null>(
    localStorage.getItem('mp_activeHouseholdId'),
  );
  const [loading, setLoading] = useState(false);
  const [groceryCategories, setGroceryCategories] = useState<GroceryCategory[]>([]);

  const showHousehold = useCallback((id: string) => {
    localStorage.setItem('mp_activeHouseholdId', id);
    setActiveHouseholdIdState(id);
  }, []);

  /**
   * Someone chose this house, so the server remembers it and the next sign-in — on this device
   * or another — opens it. Best effort: failing to remember is not worth an error on screen.
   */
  const setActiveHouseholdId = useCallback((id: string) => {
    showHousehold(id);
    api('PUT', '/api/users/me/active-household', { householdId: id }).catch(() => {});
  }, [showHousehold]);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const list = await api<Household[]>('GET', '/api/households');
      setHouseholds(list);
      if (!list.some((h) => h.id === activeHouseholdId)) {
        if (list.length) {
          // A fallback, not a choice, so it is not remembered as one.
          showHousehold(list[0].id);
        } else {
          localStorage.removeItem('mp_activeHouseholdId');
          setActiveHouseholdIdState(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [session, activeHouseholdId, showHousehold]);

  useEffect(() => {
    if (session) refresh();
    else setHouseholds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const refreshGroceryCategories = useCallback(async () => {
    if (!activeHouseholdId) {
      setGroceryCategories([]);
      return;
    }
    setGroceryCategories(
      await api<GroceryCategory[]>('GET', `/api/households/${activeHouseholdId}/categories`),
    );
  }, [activeHouseholdId]);

  useEffect(() => {
    refreshGroceryCategories();
  }, [refreshGroceryCategories]);

  // Settings someone changed on another phone — the store order, the planning window.
  useOnResume(() => {
    if (session) refresh().catch(() => {});
    refreshGroceryCategories().catch(() => {});
  });

  const createHousehold = useCallback(
    async (name: string) => {
      const household = await api<Household>('POST', '/api/households', { name });
      await refresh();
      setActiveHouseholdId(household.id);
    },
    [refresh, setActiveHouseholdId],
  );

  const renameHousehold = useCallback(
    async (name: string) => {
      if (!activeHouseholdId) return;
      await api('PATCH', `/api/households/${activeHouseholdId}/name`, { name });
      await refresh();
    },
    [activeHouseholdId, refresh],
  );

  const updateSettings = useCallback(
    async (settings: HouseholdSettings) => {
      if (!activeHouseholdId) return;
      await api('PATCH', `/api/households/${activeHouseholdId}/settings`, settings);
      await refresh();
    },
    [activeHouseholdId, refresh],
  );

  const createGroceryCategory = useCallback(
    async (name: string) => {
      if (!activeHouseholdId) return;
      await api('POST', `/api/households/${activeHouseholdId}/categories`, { name });
      await refreshGroceryCategories();
    },
    [activeHouseholdId, refreshGroceryCategories],
  );

  const renameGroceryCategory = useCallback(
    async (id: string, name: string) => {
      if (!activeHouseholdId) return;
      await api('PATCH', `/api/households/${activeHouseholdId}/categories/${id}`, { name });
      await refreshGroceryCategories();
    },
    [activeHouseholdId, refreshGroceryCategories],
  );

  const reorderGroceryCategories = useCallback(
    async (order: string[]) => {
      if (!activeHouseholdId) return;
      await api('PUT', `/api/households/${activeHouseholdId}/categories/order`, { order });
      await refreshGroceryCategories();
    },
    [activeHouseholdId, refreshGroceryCategories],
  );

  const deleteGroceryCategory = useCallback(
    async (id: string) => {
      if (!activeHouseholdId) return;
      await api('DELETE', `/api/households/${activeHouseholdId}/categories/${id}`);
      await refreshGroceryCategories();
    },
    [activeHouseholdId, refreshGroceryCategories],
  );

  const activeHousehold = households.find((h) => h.id === activeHouseholdId) ?? null;

  const value = useMemo(
    () => ({
      households,
      activeHouseholdId,
      activeHousehold,
      setActiveHouseholdId,
      loading,
      refresh,
      createHousehold,
      renameHousehold,
      updateSettings,
      groceryCategories,
      refreshGroceryCategories,
      createGroceryCategory,
      renameGroceryCategory,
      reorderGroceryCategories,
      deleteGroceryCategory,
    }),
    [
      households,
      activeHouseholdId,
      activeHousehold,
      setActiveHouseholdId,
      loading,
      refresh,
      createHousehold,
      renameHousehold,
      updateSettings,
      groceryCategories,
      refreshGroceryCategories,
      createGroceryCategory,
      renameGroceryCategory,
      reorderGroceryCategories,
      deleteGroceryCategory,
    ],
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdContextValue {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error('useHousehold must be used within HouseholdProvider');
  return ctx;
}
