import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { AuthResponse } from '../api/types';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(loadSession);

  const login = useCallback(async (username: string, pin: string) => {
    const auth = await api<AuthResponse>('POST', '/api/auth/login', { username, pin });
    storeSession(auth);
    setSession({ userId: auth.userId, displayName: auth.displayName });
  }, []);

  const setInitialPin = useCallback(async (username: string, pin: string) => {
    const auth = await api<AuthResponse>('POST', '/api/auth/pin', { username, pin });
    storeSession(auth);
    setSession({ userId: auth.userId, displayName: auth.displayName });
  }, []);

  const setup = useCallback(async (input: SetupInput) => {
    const auth = await api<AuthResponse>('POST', '/api/auth/setup', input);
    storeSession(auth);
    setSession({ userId: auth.userId, displayName: auth.displayName });
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const setDisplayName = useCallback((name: string) => {
    localStorage.setItem('mp_displayName', name);
    setSession((s) => (s ? { ...s, displayName: name } : s));
  }, []);

  const value = useMemo(
    () => ({ session, login, setInitialPin, setup, logout, setDisplayName }),
    [session, login, setInitialPin, setup, logout, setDisplayName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
