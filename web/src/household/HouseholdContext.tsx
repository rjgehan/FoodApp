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
import { HOUSEHOLDS_CACHE, KITCHEN_SETUP_KEY, useAuth } from '../auth/AuthContext';
import { useOnResume } from '../utils/useOnResume';

interface HouseholdSettings {
  defaultServings: number;
  planningHorizonDays: number;
}

/**
 * A change to a household's kitchen (PATCH …/kitchen): its machines and which of Plan and
 * Cupboard it uses. Anything left out stays as it is; `setUp` says the kitchen questions have
 * been answered (or skipped), so nobody is asked them again.
 */
export interface KitchenChange {
  cupboardEnabled?: boolean;
  planEnabled?: boolean;
  machines?: string[];
  setUp?: boolean;
}

interface HouseholdContextValue {
  households: Household[];
  activeHouseholdId: string | null;
  activeHousehold: Household | null;
  setActiveHouseholdId: (id: string) => void;
  loading: boolean;
  /** The list has been fetched since the app opened, rather than read from the last visit's. */
  fresh: boolean;
  refresh: () => Promise<void>;
  createHousehold: (name: string) => Promise<void>;
  renameHousehold: (name: string) => Promise<void>;
  updateSettings: (settings: HouseholdSettings) => Promise<void>;
  /**
   * Changes a household's kitchen. Shown at once — the tabs follow before the server answers —
   * and put back if it says no, when the promise rejects with why.
   */
  updateKitchen: (householdId: string, change: KitchenChange) => Promise<Household>;
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
  /**
   * A household made or joined a moment ago in this browser whose kitchen questions are still
   * to ask — until they are answered, skipped or put off. Null otherwise.
   */
  kitchenSetupFor: string | null;
  askKitchenSetup: (householdId: string) => void;
  dismissKitchenSetup: () => void;
  /**
   * A household whose cupboard has just been turned on with nothing in it, to be offered the
   * starter list — until it has been filled or skipped. Null otherwise.
   */
  starterCupboardFor: string | null;
  offerStarterCupboard: (householdId: string) => void;
  dismissStarterCupboard: () => void;
  /**
   * A household the kitchen questions have just turned the cupboard on for, while the app finds
   * out whether the starter list follows — so the prompts after it wait, rather than slipping in
   * for the moment between the two sheets. Null otherwise.
   */
  starterCupboardPending: string | null;
  setStarterCupboardPending: (householdId: string | null) => void;
}

function readKitchenSetup(): string | null {
  try {
    return sessionStorage.getItem(KITCHEN_SETUP_KEY);
  } catch {
    return null;
  }
}

function writeKitchenSetup(id: string | null) {
  try {
    if (id) sessionStorage.setItem(KITCHEN_SETUP_KEY, id);
    else sessionStorage.removeItem(KITCHEN_SETUP_KEY);
  } catch {
    // Storage blocked: the questions last as long as the page, which is most of the point anyway.
  }
}

/** The last visit's list, if it was this person's. Shown until the fresh one lands. */
function readCachedHouseholds(userId: string | undefined): Household[] {
  if (!userId) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(HOUSEHOLDS_CACHE) ?? 'null') as { userId?: string; households?: Household[] } | null;
    return saved?.userId === userId && Array.isArray(saved.households) ? saved.households : [];
  } catch {
    return [];
  }
}

function writeCachedHouseholds(userId: string | undefined, households: Household[]) {
  if (!userId) return;
  try {
    localStorage.setItem(HOUSEHOLDS_CACHE, JSON.stringify({ userId, households }));
  } catch {
    // Full or blocked: the next visit fetches before it knows the tabs, as it always used to.
  }
}

/** The change, as the household will look once the server has it. */
function withKitchen(household: Household, change: KitchenChange): Household {
  return {
    ...household,
    ...(change.cupboardEnabled !== undefined && { cupboardEnabled: change.cupboardEnabled }),
    ...(change.planEnabled !== undefined && { planEnabled: change.planEnabled }),
    ...(change.machines !== undefined && { machines: change.machines }),
    ...(change.setUp !== undefined && { kitchenSetUp: change.setUp }),
  };
}

/** Only the fields a change touched, back as they were — whatever else changed meanwhile stays. */
function withoutKitchen(household: Household, change: KitchenChange, before: Household): Household {
  return {
    ...household,
    ...(change.cupboardEnabled !== undefined && { cupboardEnabled: before.cupboardEnabled }),
    ...(change.planEnabled !== undefined && { planEnabled: before.planEnabled }),
    ...(change.machines !== undefined && { machines: before.machines }),
    ...(change.setUp !== undefined && { kitchenSetUp: before.kitchenSetUp }),
  };
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [households, setHouseholdsState] = useState<Household[]>(() => readCachedHouseholds(session?.userId));
  const [activeHouseholdId, setActiveHouseholdIdState] = useState<string | null>(
    localStorage.getItem('mp_activeHouseholdId'),
  );
  const [loading, setLoading] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [groceryCategories, setGroceryCategories] = useState<GroceryCategory[]>([]);
  const [lostHousehold, setLostHousehold] = useState<string | null>(null);
  const [kitchenSetupFor, setKitchenSetupFor] = useState<string | null>(readKitchenSetup);
  const [starterCupboardFor, setStarterCupboardFor] = useState<string | null>(null);
  const [starterCupboardPending, setStarterCupboardPending] = useState<string | null>(null);
  const householdsRef = useRef(households);
  householdsRef.current = households;
  // Kitchen changes still waiting on the server, per household: only the last one's answer is
  // put on screen, so a quick second tap is not undone for a moment by the first one's reply.
  const kitchenPending = useRef(new Map<string, number>());
  const kitchenQueue = useRef<Promise<unknown>>(Promise.resolve());
  // Bumped as each kitchen change is made and as it is answered, so a list fetched across one
  // knows it is older than what is on screen.
  const kitchenEdits = useRef(0);

  /** The list on screen, and kept for the next visit's first frame. */
  const setHouseholds = useCallback(
    (next: Household[] | ((prev: Household[]) => Household[])) => {
      setHouseholdsState((prev) => {
        const list = typeof next === 'function' ? next(prev) : next;
        writeCachedHouseholds(session?.userId, list);
        return list;
      });
    },
    [session?.userId],
  );

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
      const editsBefore = kitchenEdits.current;
      const fetched = await api<Household[]>('GET', '/api/households');
      // A kitchen change made while this list was on its way is newer than the list: keep it
      // rather than flick the tabs (or the setup card) back to how they were a moment ago.
      const list =
        editsBefore === kitchenEdits.current
          ? fetched
          : fetched.map((h) => {
              const mine = householdsRef.current.find((m) => m.id === h.id);
              if (!mine) return h;
              const { cupboardEnabled, planEnabled, machines, kitchenSetUp } = mine;
              return { ...h, cupboardEnabled, planEnabled, machines, kitchenSetUp };
            });
      setHouseholds(list);
      setFresh(true);
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
  }, [session, activeHouseholdId, showHousehold, setHouseholds]);

  const refresh = useCallback(() => reload(false), [reload]);
  const dismissLostHousehold = useCallback(() => setLostHousehold(null), []);

  const askKitchenSetup = useCallback((id: string | null) => {
    writeKitchenSetup(id);
    setKitchenSetupFor(id);
  }, []);
  const dismissKitchenSetup = useCallback(() => askKitchenSetup(null), [askKitchenSetup]);
  const offerStarterCupboard = useCallback((id: string) => setStarterCupboardFor(id), []);
  const dismissStarterCupboard = useCallback(() => setStarterCupboardFor(null), []);

  useEffect(() => {
    if (session) refresh();
    else {
      setHouseholdsState([]);
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

  // Settings someone changed on another phone — the store order, the planning window, the
  // household's tabs.
  useOnResume(() => {
    if (session) reload(true).catch(() => {});
    refreshGroceryCategories().catch(() => {});
  });

  const createHousehold = useCallback(
    async (name: string) => {
      const household = await api<Household>('POST', '/api/households', { name });
      await refresh();
      setActiveHouseholdId(household.id);
      // A new house: which machines, and whether it plans and keeps a cupboard, before anything else.
      askKitchenSetup(household.id);
    },
    [refresh, setActiveHouseholdId, askKitchenSetup],
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

  const updateKitchen = useCallback(
    async (householdId: string, change: KitchenChange) => {
      const before = householdsRef.current.find((h) => h.id === householdId);
      kitchenEdits.current += 1;
      setHouseholds((prev) => prev.map((h) => (h.id === householdId ? withKitchen(h, change) : h)));
      const pending = kitchenPending.current;
      pending.set(householdId, (pending.get(householdId) ?? 0) + 1);
      // One after another, in the order they were made: machines go as the whole list, so two
      // quick taps arriving the wrong way round would save the first tap's list over the second's.
      const send = kitchenQueue.current
        .catch(() => undefined)
        .then(() => api<Household>('PATCH', `/api/households/${householdId}/kitchen`, change));
      kitchenQueue.current = send;
      try {
        const saved = await send;
        kitchenEdits.current += 1;
        pending.set(householdId, (pending.get(householdId) ?? 1) - 1);
        if (!pending.get(householdId)) setHouseholds((prev) => prev.map((h) => (h.id === householdId ? saved : h)));
        return saved;
      } catch (err) {
        kitchenEdits.current += 1;
        pending.set(householdId, (pending.get(householdId) ?? 1) - 1);
        if (before) setHouseholds((prev) => prev.map((h) => (h.id === householdId ? withoutKitchen(h, change, before) : h)));
        throw err;
      }
    },
    [setHouseholds],
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
      fresh,
      refresh,
      createHousehold,
      renameHousehold,
      updateSettings,
      updateKitchen,
      groceryCategories,
      refreshGroceryCategories,
      createGroceryCategory,
      renameGroceryCategory,
      reorderGroceryCategories,
      deleteGroceryCategory,
      lostHousehold,
      dismissLostHousehold,
      kitchenSetupFor,
      askKitchenSetup,
      dismissKitchenSetup,
      starterCupboardFor,
      offerStarterCupboard,
      dismissStarterCupboard,
      starterCupboardPending,
      setStarterCupboardPending,
    }),
    [
      households,
      activeHouseholdId,
      activeHousehold,
      setActiveHouseholdId,
      loading,
      fresh,
      refresh,
      createHousehold,
      renameHousehold,
      updateSettings,
      updateKitchen,
      groceryCategories,
      refreshGroceryCategories,
      createGroceryCategory,
      renameGroceryCategory,
      reorderGroceryCategories,
      deleteGroceryCategory,
      lostHousehold,
      dismissLostHousehold,
      kitchenSetupFor,
      askKitchenSetup,
      dismissKitchenSetup,
      starterCupboardFor,
      offerStarterCupboard,
      dismissStarterCupboard,
      starterCupboardPending,
      setStarterCupboardPending,
    ],
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdContextValue {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error('useHousehold must be used within HouseholdProvider');
  return ctx;
}
