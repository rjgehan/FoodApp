import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { AuthResponse } from '../api/types';

interface Session {
  userId: string;
  displayName: string;
}

interface AuthContextValue {
  session: Session | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
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

  const login = useCallback(async (username: string, password: string) => {
    const auth = await api<AuthResponse>('POST', '/api/auth/login', { username, password });
    storeSession(auth);
    setSession({ userId: auth.userId, displayName: auth.displayName });
  }, []);

  const register = useCallback(async (username: string, password: string, displayName: string) => {
    const auth = await api<AuthResponse>('POST', '/api/auth/register', { username, password, displayName });
    storeSession(auth);
    setSession({ userId: auth.userId, displayName: auth.displayName });
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, login, register, logout }), [session, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
