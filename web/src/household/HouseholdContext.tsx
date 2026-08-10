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
import type { Household, RecipeVisibility } from '../api/types';
import { useAuth } from '../auth/AuthContext';

interface HouseholdSettings {
  defaultServings: number;
  defaultRecipeVisibility: RecipeVisibility;
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
  updateSettings: (settings: HouseholdSettings) => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [activeHouseholdId, setActiveHouseholdIdState] = useState<string | null>(
    localStorage.getItem('mp_activeHouseholdId'),
  );
  const [loading, setLoading] = useState(false);

  const setActiveHouseholdId = useCallback((id: string) => {
    localStorage.setItem('mp_activeHouseholdId', id);
    setActiveHouseholdIdState(id);
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const list = await api<Household[]>('GET', '/api/households');
      setHouseholds(list);
      if (!list.some((h) => h.id === activeHouseholdId)) {
        if (list.length) {
          setActiveHouseholdId(list[0].id);
        } else {
          localStorage.removeItem('mp_activeHouseholdId');
          setActiveHouseholdIdState(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [session, activeHouseholdId, setActiveHouseholdId]);

  useEffect(() => {
    if (session) refresh();
    else setHouseholds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const createHousehold = useCallback(
    async (name: string) => {
      const household = await api<Household>('POST', '/api/households', { name });
      await refresh();
      setActiveHouseholdId(household.id);
    },
    [refresh, setActiveHouseholdId],
  );

  const updateSettings = useCallback(
    async (settings: HouseholdSettings) => {
      if (!activeHouseholdId) return;
      await api('PATCH', `/api/households/${activeHouseholdId}/settings`, settings);
      await refresh();
    },
    [activeHouseholdId, refresh],
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
      updateSettings,
    }),
    [households, activeHouseholdId, activeHousehold, setActiveHouseholdId, loading, refresh, createHousehold, updateSettings],
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdContextValue {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error('useHousehold must be used within HouseholdProvider');
  return ctx;
}
