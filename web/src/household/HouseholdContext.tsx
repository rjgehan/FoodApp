import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, onHouseholdForbidden } from '../api/client';
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
  /**
   * The name of the house they were looking at when they turned out not to be in it any more —
   * taken out by its owner, or it was deleted — until they have seen it said. Null otherwise.
   */
  lostHousehold: string | null;
  dismissLostHousehold: () => void;
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
  const [lostHousehold, setLostHousehold] = useState<string | null>(null);
  const householdsRef = useRef(households);
  householdsRef.current = households;

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
    // A house they chose, so whatever they were told about one they lost has been dealt with.
    setLostHousehold(null);
    api('PUT', '/api/users/me/active-household', { householdId: id }).catch(() => {});
  }, [showHousehold]);

  /**
   * `noticeLoss` for the refreshes that find out somebody else's doing — a 403, coming back to
   * the app — rather than ones after leaving or deleting a house yourself, which need no telling.
   */
  const reload = useCallback(async (noticeLoss: boolean) => {
    if (!session) return;
    setLoading(true);
    try {
      const list = await api<Household[]>('GET', '/api/households');
      setHouseholds(list);
      if (!list.some((h) => h.id === activeHouseholdId)) {
        const gone = householdsRef.current.find((h) => h.id === activeHouseholdId);
        if (noticeLoss && gone) setLostHousehold(gone.name);
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

  const refresh = useCallback(() => reload(false), [reload]);
  const dismissLostHousehold = useCallback(() => setLostHousehold(null), []);

  useEffect(() => {
    if (session) refresh();
    else {
      setHouseholds([]);
      setLostHousehold(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  /*
   * A 403 from a household is how being removed from it arrives. Refreshing the list drops the
   * house and falls back to another (or to none, and the pages say how to join one). At most
   * every few seconds: a page that fires several requests at once gets several 403s back.
   */
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    let last = 0;
    onHouseholdForbidden(() => {
      if (Date.now() - last < 3000) return;
      last = Date.now();
      reloadRef.current(true).catch(() => {});
    });
    return () => onHouseholdForbidden(null);
  }, []);

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
    if (session) reload(true).catch(() => {});
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
      lostHousehold,
      dismissLostHousehold,
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
      lostHousehold,
      dismissLostHousehold,
    ],
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdContextValue {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error('useHousehold must be used within HouseholdProvider');
  return ctx;
}
