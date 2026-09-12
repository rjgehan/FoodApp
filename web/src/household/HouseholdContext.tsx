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
import type { Household, StoreSection } from '../api/types';
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
  /** The aisles in the order you walk your store; the grocery list follows it. */
  updateStoreSectionOrder: (order: StoreSection[]) => Promise<void>;
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

  // Settings someone changed on another phone — the store order, the planning window.
  useOnResume(() => {
    if (session) refresh().catch(() => {});
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

  const updateStoreSectionOrder = useCallback(
    async (order: StoreSection[]) => {
      if (!activeHouseholdId) return;
      await api('PUT', `/api/households/${activeHouseholdId}/store-sections`, { order });
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
      renameHousehold,
      updateSettings,
      updateStoreSectionOrder,
    }),
    [households, activeHouseholdId, activeHousehold, setActiveHouseholdId, loading, refresh, createHousehold, renameHousehold, updateSettings, updateStoreSectionOrder],
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdContextValue {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error('useHousehold must be used within HouseholdProvider');
  return ctx;
}
