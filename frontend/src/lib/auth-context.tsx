import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { DEV_BYPASS_LOGIN, DEV_ACCOUNT } from './dev-config';
import type { RankTier } from '../components/RankBadge';

export type User = {
  id: number;
  username: string;
  displayName: string;
  avatarKey: string;
  totalXp: number;
  playerLevel: number;
  rankTier: RankTier;
  createdAt: string;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signup: (input: { username: string; email: string; password: string; displayName: string; avatarKey: string }) => Promise<void>;
  login: (input: { username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get<{ user: User }>('/auth/me');
      setUser(data.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await api.get<{ user: User }>('/auth/me');
        setUser(data.user);
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 401) {
          setLoading(false);
          return;
        }
        if (DEV_BYPASS_LOGIN) {
          try {
            const data = await api.post<{ user: User }>('/auth/login', DEV_ACCOUNT);
            setUser(data.user);
          } catch {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  const signup: AuthContextValue['signup'] = async (input) => {
    const data = await api.post<{ user: User }>('/auth/signup', input);
    setUser(data.user);
  };

  const login: AuthContextValue['login'] = async (input) => {
    const data = await api.post<{ user: User }>('/auth/login', input);
    setUser(data.user);
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, logout, refreshUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
