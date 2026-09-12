import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, onSignedOut } from '../api/client';
import type { AuthResponse } from '../api/types';
import { useOnResume } from '../utils/useOnResume';

interface Session {
  userId: string;
  displayName: string;
}

interface SetupInput {
  householdName: string;
  username: string;
  displayName?: string;
  pin: string;
}

interface AuthContextValue {
  session: Session | null;
  /** True when the server ended the session, as opposed to you pressing Log out. */
  expired: boolean;
  login: (username: string, pin: string) => Promise<void>;
  /** First sign-in for an account someone else created: choosing the PIN also signs you in. */
  setInitialPin: (username: string, pin: string) => Promise<void>;
  /** Only reachable on a completely empty install — creates the first household and its owner. */
  setup: (input: SetupInput) => Promise<void>;
  logout: () => void;
  /** After renaming yourself, so the header stops showing the old name. */
  setDisplayName: (name: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Tokens last 30 days; swapping at most once a day keeps a used session alive indefinitely. */
const REFRESH_AFTER_SECONDS = 24 * 60 * 60;

function loadSession(): Session | null {
  const userId = localStorage.getItem('mp_userId');
  const displayName = localStorage.getItem('mp_displayName');
  return userId && displayName ? { userId, displayName } : null;
}

function storeSession(auth: AuthResponse) {
  localStorage.setItem('mp_token', auth.token);
  localStorage.setItem('mp_userId', auth.userId);
  localStorage.setItem('mp_displayName', auth.displayName);
}

function clearSession() {
  localStorage.removeItem('mp_token');
  localStorage.removeItem('mp_userId');
  localStorage.removeItem('mp_displayName');
}

/** When the token was issued, in seconds. Read from the token itself — nothing to keep in sync. */
function issuedAt(token: string): number | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).iat ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [expired, setExpired] = useState(false);

  const signIn = useCallback((auth: AuthResponse) => {
    storeSession(auth);
    setExpired(false);
    setSession({ userId: auth.userId, displayName: auth.displayName });
  }, []);

  const login = useCallback(async (username: string, pin: string) => {
    signIn(await api<AuthResponse>('POST', '/api/auth/login', { username, pin }));
  }, [signIn]);

  const setInitialPin = useCallback(async (username: string, pin: string) => {
    signIn(await api<AuthResponse>('POST', '/api/auth/pin', { username, pin }));
  }, [signIn]);

  const setup = useCallback(async (input: SetupInput) => {
    signIn(await api<AuthResponse>('POST', '/api/auth/setup', input));
  }, [signIn]);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const setDisplayName = useCallback((name: string) => {
    localStorage.setItem('mp_displayName', name);
    setSession((s) => (s ? { ...s, displayName: name } : s));
  }, []);

  // Any request the server turns away as signed out lands you on the sign-in screen, saying so.
  useEffect(() => {
    onSignedOut(() => {
      clearSession();
      setExpired(true);
      setSession(null);
    });
    return () => onSignedOut(null);
  }, []);

  /** Swap the token for a fresh one once it is a day old. A 401 here signs out via the handler. */
  const refreshToken = useCallback(async () => {
    const token = getToken();
    const iat = token ? issuedAt(token) : null;
    if (!token || (iat !== null && Date.now() / 1000 - iat < REFRESH_AFTER_SECONDS)) return;
    try {
      const auth = await api<AuthResponse>('POST', '/api/auth/refresh');
      storeSession(auth);
      setSession((s) => (s && s.displayName === auth.displayName ? s : { userId: auth.userId, displayName: auth.displayName }));
    } catch {
      // Offline, or the server is restarting. The current token still works; try next time.
    }
  }, []);

  useEffect(() => {
    if (session) refreshToken();
    // Once per sign-in, not on every rename.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId, refreshToken]);

  useOnResume(() => {
    if (session) refreshToken();
  });

  const value = useMemo(
    () => ({ session, expired, login, setInitialPin, setup, logout, setDisplayName }),
    [session, expired, login, setInitialPin, setup, logout, setDisplayName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
