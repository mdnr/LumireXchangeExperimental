import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from './api';
import type { AuthResponse, MeResponse } from './types';

// The context + hook live in one file by design so callers get a single import;
// fast-refresh only wants components exported, so silence the rule here.
/* eslint-disable react-refresh/only-export-components */

export interface User {
  email: string;
  displayName: string;
  roles: string[];
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string, role?: 'seller' | 'user') => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toUser(me: MeResponse): User {
  return { email: me.email, displayName: me.displayName, roles: me.roles };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      setInitializing(false);
      return;
    }
    api
      .me()
      .then((me) => setUser(toUser(me)))
      .catch(() => {
        setToken(null);
        setTokenState(null);
        setUser(null);
      })
      .finally(() => setInitializing(false));
  }, []);

  const storeAuth = (auth: AuthResponse) => {
    setToken(auth.token);
    setTokenState(auth.token);
    setUser({ email: auth.email, displayName: auth.displayName, roles: auth.roles });
  };

  const login = async (email: string, password: string) => {
    const auth = await api.login(email, password);
    storeAuth(auth);
  };

  const register = async (email: string, password: string, displayName: string, role?: 'seller' | 'user') => {
    const auth = await api.register(email, password, displayName, role);
    storeAuth(auth);
  };

  const logout = () => {
    setToken(null);
    setTokenState(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, initializing, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}